import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Outil de développement : enregistre les scènes 3D (géométrie + animation
// échantillonnée image par image) pour les rendre dans Blender.
// Lancement : http://localhost:5173/?export

export const FPS = 60;
export const LOOP = 9; // secondes
export const FRAMES = FPS * LOOP; // 540
// cadre rendu = scène 1280 x 776 + marges (pour les écrans plus larges / plus hauts)
// cadre vidéo : maquette 1280x776 + marges (couvre les fenêtres larges et hautes)
export const FRAME = { stageW: 1280, stageH: 776, marginX: 240, marginY: 92 };
FRAME.w = FRAME.stageW + FRAME.marginX * 2;
FRAME.h = FRAME.stageH + FRAME.marginY * 2;

const WORK = 'blender/work';
const pad = (i) => String(i).padStart(4, '0');
const toBlob = (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png'));
const log = (...a) => {
  console.log('[export]', ...a);
  window.__exportLog = (window.__exportLog || '') + a.join(' ') + '\n';
};

async function save(path, body) {
  const r = await fetch(`/__save?path=${encodeURIComponent(`${WORK}/${path}`)}`, { method: 'POST', body });
  if (!r.ok) throw new Error(`save ${path}: ${r.status}`);
}

function worldVisible(o) {
  for (let n = o; n; n = n.parent) if (!n.visible) return false;
  return true;
}

/** Enregistre position / rotation / échelle (visibilité) de nœuds nommés. */
class Recorder {
  constructor(entries) {
    this.entries = entries.map((e) => ({ ...e, p: [], q: [], s: [], vis: [], prev: null }));
    this.times = [];
  }

  sample(t) {
    this.times.push(t);
    for (const e of this.entries) {
      const n = e.node;
      e.p.push(n.position.x, n.position.y, n.position.z);
      const q = n.quaternion.clone();
      // continuité des quaternions (sinon Blender interpole par le long chemin)
      if (e.prev && e.prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      e.prev = q;
      e.q.push(q.x, q.y, q.z, q.w);
      const v = e.visibility && !worldVisible(n) ? 1e-4 : 1;
      e.s.push(n.scale.x * v, n.scale.y * v, n.scale.z * v);
      e.vis.push(v === 1);
    }
  }

  /**
   * Images où l'objet est caché : il prend la position de l'image visible la plus
   * proche (avant puis après). Le saut de position se fait ainsi entre deux images
   * cachées : pas de traînée de flou de mouvement dans le rendu Blender.
   */
  _fillHidden(e) {
    const n = e.vis.length;
    const copy = (to, from) => {
      for (let j = 0; j < 3; j++) e.p[to * 3 + j] = e.p[from * 3 + j];
      for (let j = 0; j < 4; j++) e.q[to * 4 + j] = e.q[from * 4 + j];
    };
    for (let a = 0; a < n; a++) {
      if (e.vis[a]) continue;
      let b = a;
      while (b + 1 < n && !e.vis[b + 1]) b++;
      const before = a - 1;
      const after = b + 1 < n ? b + 1 : -1;
      const mid = Math.floor((a + b + 1) / 2);
      for (let i = a; i <= b; i++) {
        const from = (i < mid && before >= 0) || after < 0 ? before : after;
        if (from >= 0) copy(i, from);
      }
      a = b;
    }
  }

  clip(name) {
    const tracks = [];
    for (const e of this.entries) {
      if (e.visibility) this._fillHidden(e);
      tracks.push(new THREE.VectorKeyframeTrack(`${e.name}.position`, this.times, e.p));
      tracks.push(new THREE.QuaternionKeyframeTrack(`${e.name}.quaternion`, this.times, e.q));
      tracks.push(new THREE.VectorKeyframeTrack(`${e.name}.scale`, this.times, e.s));
    }
    return new THREE.AnimationClip(name, -1, tracks);
  }
}

/** Remplace les InstancedMesh par des maillages fusionnés (import Blender plus sûr). */
function bakeInstances(root) {
  const list = [];
  root.traverse((o) => o.isInstancedMesh && list.push(o));
  const m = new THREE.Matrix4();
  for (const im of list) {
    const geos = [];
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m);
      geos.push(im.geometry.clone().applyMatrix4(m));
    }
    const mesh = new THREE.Mesh(mergeGeometries(geos), im.material);
    mesh.name = `${im.material.name || 'inst'}_instances`;
    mesh.position.copy(im.position);
    mesh.quaternion.copy(im.quaternion);
    mesh.scale.copy(im.scale);
    im.parent.add(mesh);
    im.parent.remove(im);
  }
}

/** Masque tout ce qui ne doit pas partir dans Blender (sol, halos, lumières, effets). */
function hideForExport(scene, extra = []) {
  const hidden = [];
  scene.traverse((o) => {
    const mat = o.material;
    const fx = o.isLight || (mat && (mat.isShadowMaterial || mat.isShaderMaterial || mat.blending === THREE.AdditiveBlending));
    if (fx && o.visible) {
      o.visible = false;
      hidden.push(o);
    }
  });
  for (const o of extra) {
    if (o && o.visible) {
      o.visible = false;
      hidden.push(o);
    }
  }
  return hidden;
}

function frameFov(stageFov) {
  const t = Math.tan(THREE.MathUtils.degToRad(stageFov) / 2) * (FRAME.h / FRAME.stageH);
  return THREE.MathUtils.radToDeg(2 * Math.atan(t));
}

function makeCamera(ref, name) {
  const cam = new THREE.PerspectiveCamera(frameFov(ref.fov), FRAME.w / FRAME.h, 0.1, 200);
  cam.name = name;
  cam.position.copy(ref.position);
  if (ref.rotation) cam.rotation.copy(ref.rotation);
  return cam;
}

function bubbleState(hero) {
  const tw = hero.bubbleTW;
  const chars = (list) => list.map((c) => [c.ch, c.w >= 700 ? 1 : 0, +Math.max(0, Math.min(1, c.a)).toFixed(2)]);
  return { c: chars(tw.chars), g: chars(tw.ghosts), t: hero.bubble.timer, o: +hero.bubble.opacity.toFixed(3) };
}

async function exportGLB(root, clip, path) {
  const exporter = new GLTFExporter();
  const glb = await exporter.parseAsync(root, { binary: true, animations: [clip], onlyVisible: true, maxTextureSize: 2048 });
  await save(path, glb);
  log('GLB', path, Math.round(glb.byteLength / 1024), 'Ko');
}

/* ------------------------------------------------------------------ hero */
export async function exportHero(app) {
  const { hero } = app;
  const dt = 1 / FPS;
  hero.loopData = { plate: 'KA6919EN', exitPlate: 'KA2637EB', exit: [['13.12', 700], ['PM(42min)', 300]] };
  hero.resize(FRAME.stageW, FRAME.stageH);
  hero.top = 0;
  hero.restart({ withPrevious: true, T: -0.65 });
  hero.running = true;
  // une boucle de chauffe : tous les amortis atteignent le régime permanent
  for (let i = 0; i < FRAMES; i++) hero.update(dt);

  const cars = hero.cars;
  const entries = [];
  cars.forEach((c, i) => {
    c.group.name = `car${i}`;
    c.body.name = `car${i}_body`;
    entries.push({ node: c.group, name: c.group.name, visibility: true });
    entries.push({ node: c.body, name: c.body.name });
    c.wheels.forEach((w, j) => {
      w.name = `car${i}_wheel${j}`;
      entries.push({ node: w, name: w.name });
    });
    c.steer.forEach((s, j) => {
      s.name = `car${i}_steer${j}`;
      entries.push({ node: s, name: s.name });
    });
  });
  hero.robot.group.name = 'robot';
  hero.robot.head.name = 'robot_head';
  hero.robot.visor.name = 'robot_visor';
  entries.push({ node: hero.robot.group, name: 'robot' }, { node: hero.robot.head, name: 'robot_head' });
  hero.entry.ticket.name = 'ticket';
  entries.push({ node: hero.entry.ticket, name: 'ticket', visibility: true });
  hero.exitMachine.receipt.name = 'receipt';
  entries.push({ node: hero.exitMachine.receipt, name: 'receipt' });
  hero.exitBoard.panel.children.forEach((m) => {
    if (m.material && m.material.name === 'screen') m.name = 'exit_screen';
  });

  const rec = new Recorder(entries);
  const bubble = [];
  const pos = {};
  for (let f = 0; f <= FRAMES; f++) {
    if (f > 0) hero.update(dt);
    rec.sample(f / FPS);
    if (f === FRAMES) break;
    hero.projectBubble(pos);
    bubble.push({ x: +(pos.x / FRAME.stageW).toFixed(5), y: +(pos.y / FRAME.stageH).toFixed(5), ...bubbleState(hero) });
    await save(`hero/screen/${pad(f + 1)}.png`, await toBlob(hero.exitBoard.screen.canvas));
    await save(`hero/visor/${pad(f + 1)}.png`, await toBlob(hero.robot.visorTex.canvas));
    if (f % 30 === 0) log('hero frame', f);
  }

  // export : toutes les voitures visibles (la visibilité est dans l'échelle animée)
  for (const c of cars) c.group.visible = true;
  hero.entry.ticket.visible = true;
  hero.exitMachine.receipt.visible = true;
  bakeInstances(hero.scene);
  const extra = [hero.shadows.group, ...cars.map((c) => c.fx)];
  const hidden = hideForExport(hero.scene, extra);
  const cam = makeCamera(hero.camLandscape, 'cam_hero');
  hero.scene.add(cam);
  await exportGLB(hero.scene, rec.clip('loop'), 'hero/hero.glb');
  hero.scene.remove(cam);
  hidden.forEach((o) => (o.visible = true));

  const meta = {
    fps: FPS,
    frames: FRAMES,
    loop: LOOP,
    frame: FRAME,
    cameraStageFov: hero.camLandscape.fov,
    cameraFrameFov: frameFov(hero.camLandscape.fov),
    shiftX: 0,
    shiftY: 0,
    // la vidéo commence au début du rideau d'intro (T = -0.65 s) ; 1re plaque scannée à l'image 24
    firstScanFrame: Math.round((0.65 + 0.12) * FPS),
    keyLight: hero.key.position.toArray(),
    keyTarget: hero.key.target.position.toArray(),
  };
  await save('hero/meta.json', JSON.stringify(meta, null, 2));
  await save('hero/bubble.json', JSON.stringify(bubble));
  log('hero OK');
}

/* ------------------------------------------------------------------ gate */
export async function exportGate(app) {
  const { gate } = app;
  const dt = 1 / FPS;
  gate.loopData = { plate: 'KA6919EN', exit: [['13.12', 700], ['PM(42min)', 300]] };
  gate.resize(FRAME.stageW, FRAME.stageH);
  gate.top = 0;
  gate.enter();
  for (let i = 0; i < FRAMES; i++) gate.update(dt);

  const car = gate.car;
  const entries = [];
  car.group.name = 'gcar';
  car.body.name = 'gcar_body';
  entries.push({ node: car.group, name: 'gcar', visibility: true }, { node: car.body, name: 'gcar_body' });
  car.wheels.forEach((w, j) => {
    w.name = `gcar_wheel${j}`;
    entries.push({ node: w, name: w.name });
  });
  car.steer.forEach((s, j) => {
    s.name = `gcar_steer${j}`;
    entries.push({ node: s, name: s.name });
  });
  gate.robot.group.name = 'grobot';
  gate.robot.head.name = 'grobot_head';
  gate.robot.visor.name = 'grobot_visor';
  entries.push({ node: gate.robot.group, name: 'grobot' }, { node: gate.robot.head, name: 'grobot_head' });
  gate.machine.receipt.name = 'greceipt';
  entries.push({ node: gate.machine.receipt, name: 'greceipt' });
  gate.board.panel.children.forEach((m) => {
    if (m.material && m.material.name === 'screen') m.name = 'gate_screen';
  });

  const rec = new Recorder(entries);
  for (let f = 0; f <= FRAMES; f++) {
    if (f > 0) gate.update(dt);
    rec.sample(f / FPS);
    if (f === FRAMES) break;
    await save(`gate/screen/${pad(f + 1)}.png`, await toBlob(gate.board.screen.canvas));
    await save(`gate/visor/${pad(f + 1)}.png`, await toBlob(gate.robot.visorTex.canvas));
    if (f % 30 === 0) log('gate frame', f);
  }

  car.group.visible = true;
  gate.machine.receipt.visible = true;
  const hidden = hideForExport(gate.scene, [gate.shadows.group, car.fx]);
  const cam = makeCamera(gate.camLandscape, 'cam_gate');
  gate.scene.add(cam);
  await exportGLB(gate.scene, rec.clip('loop'), 'gate/gate.glb');
  gate.scene.remove(cam);
  hidden.forEach((o) => (o.visible = true));

  const meta = {
    fps: FPS,
    frames: FRAMES,
    loop: LOOP,
    frame: FRAME,
    cameraStageFov: gate.camLandscape.fov,
    cameraFrameFov: frameFov(gate.camLandscape.fov),
    // décalage du centre optique (en fraction de la largeur du cadre)
    shiftX: (gate.camLandscape.offsetX * FRAME.stageW) / FRAME.w,
    shiftY: (gate.camLandscape.offsetY * FRAME.stageH) / FRAME.w,
    keyLight: gate.key.position.toArray(),
    keyTarget: gate.key.target.position.toArray(),
  };
  await save('gate/meta.json', JSON.stringify(meta, null, 2));
  log('gate OK');
}

/* --------------------------------------------------------------- loader */
export async function exportLoaderRobot(app) {
  // robot seul, tel qu'il apparaît dans le loader (visière vide)
  const { createRobot } = await import('../three/models/robot.js');
  const scene = new THREE.Scene();
  const robot = createRobot();
  robot.group.name = 'lrobot';
  robot.head.name = 'lrobot_head';
  robot.visor.name = 'lrobot_visor';
  robot.head.rotation.y = 0.62;
  robot.visorTex.setText('');
  scene.add(robot.group);
  const cam = new THREE.PerspectiveCamera(22, 380 / 240, 0.1, 50);
  cam.name = 'cam_loader';
  cam.position.set(0, 0.25, 5.2);
  cam.lookAt(0, 0.05, 0);
  scene.add(cam);
  await save('loader/visor.png', await toBlob(robot.visorTex.canvas));
  const exporter = new GLTFExporter();
  const glb = await exporter.parseAsync(scene, { binary: true, onlyVisible: true });
  await save('loader/loader.glb', glb);
  log('loader OK');
  void app;
}

export async function exportAll(app, only = '') {
  window.__exportDone = false;
  try {
    if (!only || only === 'hero') await exportHero(app);
    if (!only || only === 'gate') await exportGate(app);
    if (!only || only === 'loader') await exportLoaderRobot(app);
    window.__exportDone = true;
    log('TERMINE');
  } catch (e) {
    log('ERREUR', e.message, e.stack);
    window.__exportError = e.message;
  }
}
