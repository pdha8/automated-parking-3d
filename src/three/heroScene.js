import * as THREE from 'three';
import { MAT, night } from './materials.js';
import { createCar, setBeamIntensity, FX_LAYER, WHEEL_R } from './models/car.js';
import { createRobot } from './models/robot.js';
import { createBollards, createMachine, createBoard, createPSign, createBump, createRail, createGateCable } from './models/props.js';
import { ContactShadows } from './contactShadows.js';
import { radialTexture } from './textures.js';
import { Track } from './track.js';
import { Typewriter } from '../core/typewriter.js';
import { clamp, damp, dampAngle, smoothstep, lerp } from '../core/ease.js';

/* ==========================================================================
   Scène 1 : le parking automatisé (hero)
   Repère : X vers la droite (rangée du haut), Z vers la caméra (colonne de
   gauche), sol en y = 0.
   ========================================================================== */

export const PERIOD = 9; // une nouvelle voiture arrive toutes les 9 s (boucle parfaite)

/** Heure d'arrivée à la borne d'entrée de la voiture k. */
export function arrivalTime(k) {
  return k * PERIOD;
}

/** Clignements des yeux du robot, calés sur la boucle (rendu Blender reproductible). */
export function blinkAmount(phase, times = [2.6, 6.9]) {
  for (const t0 of times) {
    const d = (phase - t0) / 0.09;
    if (d >= 0 && d < 2) return d <= 1 ? d : 2 - d;
  }
  return 0;
}

// intensités lumineuses (mode clair)
export const LIGHT = { hemi: 0.56, key: 1.26, fill: 0.27, env: 0.36 };
// mode nuit : lumière lunaire faible, les phares font le reste
export const NIGHT = { hemi: 0.1, key: 0.55, fill: 0.05, env: 0.09 };

// Voitures successives : plaque + affichage de sortie
const CARS = [
  { plate: 'KA2637EB', exit: [['13.12', 700], ['PM(42min)', 300]] },
  { plate: 'KA6919EN', exit: [['13.54', 700], ['PM(38min)', 300]] },
  { plate: 'KA4108MX', exit: [['14.21', 700], ['PM(45min)', 300]] },
  { plate: 'KA7350RT', exit: [['14.47', 700], ['PM(31min)', 300]] },
  { plate: 'KA1294JD', exit: [['15.06', 700], ['PM(52min)', 300]] },
];

export function carData(k) {
  const n = CARS.length;
  return CARS[(((k + 1) % n) + n) % n];
}

/** 'KA6919EN' -> [['KA',400],['6919',700],['EN',400]] */
export function plateRuns(plate) {
  const m = plate.match(/^([A-Z]*)(\d*)([A-Z]*)$/);
  if (!m) return [[plate, 400]];
  return [[m[1], 400], [m[2], 700], [m[3], 400]].filter((r) => r[0]);
}

/** Chrono "HH:MM:SS:FF" (FF en 1/24 s) — accéléré une fois la voiture entrée. */
export function timerValue(tau) {
  if (tau <= 0) return 0;
  if (tau < 1.4) return tau;
  return 1.4 + (tau - 1.4) * 11.6;
}

export function formatTimer(sec) {
  const total = Math.max(0, sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const f = Math.floor((total % 1) * 24);
  const p = (v) => String(v).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`;
}

// --------------------------------------------------------------------------
// Disposition du parking
// --------------------------------------------------------------------------
// Positions relevées sur la vidéo (caméra résolue par moindres carrés, erreur < 1 px)
export const LAYOUT = {
  robot: [-1.03, 1.0, 1.74],
  robotScale: 0.84,
  leftCol: { x: -1.77, z0: 1.02, dz: 0.94, n: 7 },
  topRow: { z: 0, x0: 0, dx: 0.84, n: 9 },
  entryMachine: [-1.4, 7.0],
  entryBump: [-0.15, 6.8],
  entryBumpLen: 1.62,
  bottomRow: [[0.89, 6.42], [1.67, 6.48], [2.51, 6.45]],
  sedan: [2.2, 3.12, -Math.PI / 2 - 0.06],
  hatch: [2.14, 5.68, -Math.PI / 2 - 0.03],
  rail: { x: 3.58, z0: 1.9, z1: 8.6 },
  pSign: [3.9, 4.04],
  rightBollards: [[4.41, 2.11], [4.38, 3.93], [5.84, 2.11], [5.85, 3.95], [4.36, 5.75], [5.86, 5.8]],
  exitBoard: [5.27, -0.02],
  exitMachine: [6.36, -0.09],
  exitBump: [7.15, 1.6],
};

// Trajectoire d'une voiture (temps τ relatif à son arrivée à la borne d'entrée)
function buildTrack() {
  return new Track([
    // arrivée en diagonale depuis le bas à droite (hors champ), freinage jusqu'à la borne d'entrée
    { t: [-1.5, 0], pts: [[2.35, 11.79], [-0.15, 7.72]], ease: 'softout' },
    // avance au pas pendant l'impression du ticket
    { t: [0, 1.5], pts: [[-0.15, 7.72], [-0.33, 7.43]], ease: 'linear' },
    // entre dans le parking, se redresse puis tourne vers la place du milieu
    {
      t: [1.5, 3.9],
      path: [
        [[-0.33, 7.43], [-0.68, 6.86], [-0.16, 6.45], [-0.13, 5.9]],
        [[-0.13, 5.9], [-0.12, 5.6], [0.34, 5.36], [0.52, 5.12]],
        [[0.52, 5.12], [0.76, 4.8], [1.4, 4.67], [1.84, 4.6]],
      ],
      ease: 'inout',
    },
    // garée
    { t: [3.9, 4.6], hold: true },
    // marche arrière en braquant sec : l'arrière part vers la caméra
    { t: [4.6, 6.05], pts: [[1.84, 4.6], [1.05, 4.72], [0.47, 4.8], [0.25, 5.15]], reverse: true, ease: 'inout' },
    { t: [6.05, 7.8], hold: true },
    // repart vers le robot, tourne à droite et longe la rangée du haut jusqu'à la sortie
    {
      t: [7.8, 12.1],
      path: [
        [[0.25, 5.15], [0.62, 4.5], [0.12, 2.35], [0.8, 2.0]],
        [[0.8, 2.0], [1.6, 1.69], [3.4, 1.6], [4.74, 1.6]],
        [[4.74, 1.6], [11.0, 1.52]],
      ],
      ease: 'accel',
    },
  ]);
}

export class HeroScene {
  constructor(stage) {
    this.stage = stage;
    const scene = (this.scene = new THREE.Scene());
    scene.environment = stage.envMap;
    scene.environmentIntensity = 0.75;

    // caméra de référence, résolue à partir de la vidéo (scène 1280 x 776)
    this.camLandscape = {
      fov: 32.18,
      position: new THREE.Vector3(-3.839, 6.206, 15.273),
      rotation: new THREE.Euler(-0.439, -0.1615, -0.0438, 'YXZ'),
      offsetX: 0,
      offsetY: 0,
    };
    // cadrage portrait (mobile) : parking centré dans la moitié basse
    // même angle de vue, caméra reculée dans l'axe et parking centré sous le texte
    this.camPortrait = {
      fov: 44,
      position: new THREE.Vector3(-0.95, 10.2, 25.4),
      rotation: new THREE.Euler(-0.439, -0.1615, -0.0438, 'YXZ'),
      offsetX: 0.07,
      offsetY: 0.13,
    };
    this.camRef = { ...this.camLandscape };
    this.camera = new THREE.PerspectiveCamera(32, 1280 / 776, 0.5, 120);
    this.camera.layers.enable(FX_LAYER);

    this.top = 0;
    this.enabled = true;

    this._buildLights();
    this._buildFloor();
    this._buildProps();
    this._buildCars();

    this.robot = createRobot();
    this.robot.group.scale.setScalar(LAYOUT.robotScale);
    this.robot.group.position.set(...LAYOUT.robot);
    // le robot flotte : pas d'ombre au sol (comme dans la vidéo)
    this.robot.group.traverse((o) => {
      o.castShadow = false;
      o.layers.set(FX_LAYER);
    });
    scene.add(this.robot.group);

    this.shadows = new ContactShadows(stage.renderer, scene, {
      width: 22,
      depth: 22,
      resolution: stage.lowPower ? 512 : 1024,
      cameraHeight: 1.6,
      blur: 2.2,
      darkness: 1.7,
      opacity: 0.85,
      center: new THREE.Vector3(2.6, 0, 4.2),
      shear: [0.42, 0.16],
    });

    // écran de la borne de sortie (machine à écrire)
    this.exitTW = new Typewriter({ typeInterval: 0.033, eraseInterval: 0.033, fade: 0.066, onChange: (tw) => this.exitBoard.screen.draw(tw) });
    // bulle du robot (rendue en HTML par l'UI)
    this.bubbleTW = new Typewriter({ typeInterval: 0.05, eraseInterval: 0.03, fade: 0.06 });
    this.bubble = { opacity: 0, timer: '00:00:00:00', x: 0, y: 0, scale: 1 };

    this.T = -0.65;
    this.minCar = -1;
    // données fixes pour l'export vidéo (même plaque à chaque tour de boucle)
    this.loopData = null;
    this._scanK = null;
    this.time = 0;
    this.running = true;
    this._desiredExit = null;
    this._desiredBubble = null;
    this._bubbleShown = false;

    this.resize(1280, 776);
  }

  /* ---------------------------------------------------------------- build */
  _buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight('#ffffff', '#aeaba7', LIGHT.hemi);
    s.add(this.hemi);

    const key = (this.key = new THREE.DirectionalLight('#ffffff', LIGHT.key));
    key.position.set(-7.0, 11.5, 1.2);
    key.target.position.set(2.6, 0, 4.0);
    key.castShadow = true;
    key.shadow.mapSize.setScalar(this.stage.lowPower ? 1024 : 2048);
    const c = key.shadow.camera;
    c.left = -10;
    c.right = 10;
    c.top = 10;
    c.bottom = -10;
    c.near = 1;
    c.far = 30;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 4;
    s.add(key, key.target);

    const fill = (this.fill = new THREE.DirectionalLight('#ffffff', LIGHT.fill));
    fill.position.set(9, 6, 12);
    fill.target.position.set(2.6, 0, 4.0);
    s.add(fill, fill.target);
  }

  _buildFloor() {
    const s = this.scene;
    // sol "attrape-ombre" : invisible sauf les ombres portées
    this.floorMat = new THREE.ShadowMaterial({ color: '#3a3530', opacity: 0.16, transparent: true, depthWrite: false });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.renderOrder = 0;
    s.add(floor);

    // halo lumineux autour du parking (mode nuit)
    this.glowMat = new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 1], [0.35, 0.75], [0.7, 0.25], [1, 0]]),
      color: '#ffffff',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), this.glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(2.4, 0.004, 3.8);
    glow.layers.set(FX_LAYER);
    glow.renderOrder = 2;
    s.add(glow);
  }

  _buildProps() {
    const s = this.scene;
    const L = LAYOUT;
    const pts = [];
    for (let i = 0; i < L.leftCol.n; i++) pts.push([L.leftCol.x, L.leftCol.z0 + i * L.leftCol.dz]);
    for (let i = 0; i < L.topRow.n; i++) pts.push([L.topRow.x0 + i * L.topRow.dx, L.topRow.z]);
    pts.push(...L.bottomRow, ...L.rightBollards);
    s.add(createBollards(pts));

    const entry = createMachine({ kind: 'entry' });
    entry.group.position.set(L.entryMachine[0], 0, L.entryMachine[1]);
    entry.group.rotation.y = -0.12;
    s.add(entry.group);
    this.entry = entry;

    const bump = createBump(L.entryBumpLen, 6);
    bump.position.set(L.entryBump[0], 0, L.entryBump[1]);
    s.add(bump);

    // borne de sortie : panneau sur poteau + borne à reçu reliée par un câble
    const gate = new THREE.Group();
    gate.position.set(L.exitBoard[0], 0, L.exitBoard[1]);
    gate.rotation.y = -0.12;
    s.add(gate);
    const board = createBoard({ width: 1.6, height: 0.46, postHeight: 0.86 });
    board.group.position.set(0.68, 0, 0);
    gate.add(board.group);
    this.exitBoard = board;
    const exit = createMachine({ kind: 'exit' });
    exit.group.scale.setScalar(1.15);
    exit.group.position.set(L.exitMachine[0] - L.exitBoard[0], 0, L.exitMachine[1] - L.exitBoard[1] + 0.14);
    gate.add(exit.group);
    this.exitMachine = exit;
    gate.add(createGateCable(exit.group.position, 1.46, 1.05, 1.15));

    const exitBump = createBump(1.5, 6);
    exitBump.rotation.y = Math.PI / 2;
    exitBump.position.set(L.exitBump[0], 0, L.exitBump[1]);
    s.add(exitBump);

    const p = createPSign();
    p.position.set(L.pSign[0], 0, L.pSign[1]);
    p.rotation.y = -0.28;
    s.add(p);

    const rail = createRail(L.rail.z1 - L.rail.z0);
    rail.position.set(L.rail.x, 0, (L.rail.z0 + L.rail.z1) / 2);
    s.add(rail);
  }

  _buildCars() {
    const s = this.scene;
    const L = LAYOUT;
    // voitures garées (blanches)
    const sedan = createCar({ style: 'sedan', paint: MAT.whitePaint, plate: 'KA5522CD', active: false });
    sedan.group.position.set(L.sedan[0], 0, L.sedan[1]);
    sedan.group.rotation.y = L.sedan[2];
    s.add(sedan.group);
    const hatch = createCar({ style: 'hatch', paint: MAT.whitePaint, plate: 'KA8813AA', active: false });
    hatch.group.position.set(L.hatch[0], 0, L.hatch[1]);
    hatch.group.rotation.y = L.hatch[2];
    s.add(hatch.group);

    // deux voitures animées (une entre pendant que l'autre sort)
    this.track = buildTrack();
    this.cars = [0, 1].map(() => {
      const c = createCar({ style: 'mini', paint: MAT.paint, roof: MAT.roof, plate: 'KA6919EN', active: true });
      c.group.visible = false;
      s.add(c.group);
      return { ...c, k: null, pose: {}, prevPose: null, steerAngle: 0, pitch: 0, speed: 0 };
    });
  }

  /* --------------------------------------------------------------- layout */
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.updateCamera();
  }

  /** Cadrage : la scène garde la même taille relative à la "scène" 1280x776 centrée. */
  updateCamera() {
    const { width, height } = this;
    const cam = this.camera;
    const ref = this.camRef;
    const portrait = width / height < 1;
    if (portrait && this.camPortrait) Object.assign(ref, this.camPortrait);
    else if (!portrait && this.camLandscape) Object.assign(ref, this.camLandscape);

    let fov = ref.fov;
    if (!portrait) {
      const u = Math.min(width / 1280, height / 776);
      const stageH = 776 * u;
      fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(ref.fov) / 2) * (height / stageH)));
    }
    cam.fov = fov;
    cam.aspect = width / height;
    cam.position.copy(ref.position);
    cam.rotation.copy(ref.rotation);
    if (ref.offsetX || ref.offsetY) {
      cam.setViewOffset(width, height, -ref.offsetX * width, -ref.offsetY * height, width, height);
    } else {
      cam.clearViewOffset();
    }
    cam.updateProjectionMatrix();
  }

  /* ------------------------------------------------------------- timeline */
  /** Redémarre la boucle (voiture à la borne d'entrée). */
  restart({ withPrevious = false, T = -0.65 } = {}) {
    this.T = T;
    this.minCar = withPrevious ? -1 : 0;
    this._desiredExit = null;
    this._desiredBubble = null;
    this._scanK = null;
    this._bubbleShown = false;
    this.bubble.opacity = 0;
    this.bubbleTW.clear({ immediate: true });
    this.exitTW.clear({ immediate: true });
    this._initDisplays = true;
  }

  beforeRender() {
    this.shadows.update();
  }

  update(dt) {
    this.time += dt;
    if (this.running) this.T += dt;
    const T = this.T;
    const n = night.value;

    // lumière jour / nuit
    this.hemi.intensity = lerp(LIGHT.hemi, NIGHT.hemi, n);
    this.key.intensity = lerp(LIGHT.key, NIGHT.key, n);
    this.fill.intensity = lerp(LIGHT.fill, NIGHT.fill, n);
    this.scene.environmentIntensity = lerp(LIGHT.env, NIGHT.env, n);
    this.glowMat.opacity = n * 0.1;
    this.floorMat.opacity = lerp(0.16, 0.3, n);
    this.shadows.opacity = lerp(0.85, 0.9, n);
    setBeamIntensity(n * 1.05);

    // ---- voitures concernées (de la plus récente à la plus ancienne)
    const kMax = Math.floor((T - this.track.t0) / PERIOD);
    const cars = [];
    for (let k = kMax; k >= Math.max(this.minCar, kMax - 2); k--) cars.push({ k, tau: T - arrivalTime(k) });

    const active = cars.filter((a) => a.tau >= this.track.t0 && a.tau <= this.track.t1);
    for (const c of this.cars) c.k = null;
    for (const a of active) {
      const c = this.cars[((a.k % 2) + 2) % 2];
      c.k = a.k;
      c.tau = a.tau;
    }
    for (const c of this.cars) this._updateCar(c, dt);

    // ---- ticket d'entrée (dernière voiture arrivée à la borne)
    const arrived = cars.find((a) => a.tau >= 0);
    let ticket = 0;
    if (arrived) ticket = smoothstep(0.12, 0.38, arrived.tau) * (1 - smoothstep(2.2, 2.42, arrived.tau));
    // le ticket coulisse hors de la fente (la partie basse reste cachée dans la borne)
    const tp = this.entry.ticket;
    tp.position.y = 0.56 - 0.33 * (1 - ticket);
    tp.visible = ticket > 0.001;

    // ---- reçu de sortie
    let receipt = 0;
    for (const a of cars) receipt = Math.max(receipt, smoothstep(9.6, 10.05, a.tau) * (1 - smoothstep(11.6, 11.9, a.tau)));
    this.exitMachine.receipt.scale.set(1, Math.max(0.001, receipt), Math.max(0.001, receipt));
    this.exitMachine.receipt.visible = receipt > 0.001;

    // ---- écran de sortie : plaque à l'approche, puis heure et durée
    let exitText = [];
    for (const a of cars) {
      const info = this.carInfo(a.k);
      if (a.tau >= 8.2 && a.tau < 9.55) {
        exitText = plateRuns(info.exitPlate || info.plate);
        break;
      }
      if (a.tau >= 9.55 && a.tau < 12.2) {
        exitText = info.exit;
        break;
      }
    }
    const exitKey = JSON.stringify(exitText);
    if (exitKey !== this._desiredExit) {
      this.exitTW.set(exitText, { immediate: this._initDisplays });
      this._desiredExit = exitKey;
    }

    // ---- bulle du robot : plaque scannée + chrono
    // (la voiture -1, déjà dans le parking au chargement, n'a pas été scannée à l'écran)
    const scanned = cars.find((a) => a.tau >= 0.12 && a.k >= 0);
    if (scanned) {
      const bubbleKey = this.carInfo(scanned.k).plate;
      // nouvelle voiture scannée : la plaque est retapée
      if (bubbleKey !== this._desiredBubble || scanned.k !== this._scanK) {
        this.bubbleTW.set(plateRuns(bubbleKey));
        this._desiredBubble = bubbleKey;
        this._scanK = scanned.k;
        this._bubbleShown = true;
      }
      this.bubble.timer = formatTimer(timerValue(scanned.tau));
    }
    this.bubble.opacity = damp(this.bubble.opacity, this._bubbleShown ? 1 : 0, 14, dt);
    this.bubbleTW.update(dt);
    this.exitTW.update(dt);
    this._initDisplays = false;

    this._updateRobot(dt, active);
  }

  carInfo(k) {
    if (!this.loopData) return carData(k);
    return { plate: this.loopData.plate, exitPlate: this.loopData.exitPlate, exit: this.loopData.exit };
  }

  _updateCar(c, dt) {
    if (c.k === null) {
      c.group.visible = false;
      c.prevPose = null;
      return;
    }
    if (c._plateK !== c.k) {
      c.setPlate(this.carInfo(c.k).plate);
      c._plateK = c.k;
      c.prevPose = null;
    }
    c.group.visible = true;
    const p = this.track.sample(c.tau, c.pose);
    c.group.position.set(p.x, 0, p.z);
    c.group.rotation.y = p.heading;

    // roues : rotation selon la distance parcourue, braquage selon la courbure
    const spin = p.dist / WHEEL_R;
    for (const w of c.wheels) w.rotation.x = spin;
    if (c.prevPose) {
      const ds = p.dist - c.prevPose.dist;
      let dh = p.heading - c.prevPose.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const target = Math.abs(ds) > 1e-4 ? clamp(Math.atan((dh / ds) * 1.25), -0.55, 0.55) : c.steerAngle;
      c.steerAngle = damp(c.steerAngle, target, 10, dt);
      const speed = dt > 0 ? ds / dt : 0;
      const accel = dt > 0 ? (speed - c.speed) / dt : 0;
      c.speed = speed;
      c.pitch = damp(c.pitch, clamp(-accel * 0.006, -0.03, 0.03), 6, dt);
      c.roll = damp(c.roll || 0, clamp(-speed * (dh / Math.max(1e-4, Math.abs(ds))) * 0.02, -0.03, 0.03), 6, dt);
    }
    for (const s of c.steer) s.rotation.y = c.steerAngle;
    c.body.rotation.x = c.pitch;
    c.body.rotation.z = c.roll || 0;
    c.prevPose = { dist: p.dist, heading: p.heading };
    c.setNight(night.value);
  }

  _updateRobot(dt, active) {
    const r = this.robot;
    // fréquences multiples de 2π/9 : le mouvement boucle exactement avec le parking
    const t = this.T;
    const w = (Math.PI * 2) / PERIOD;
    const base = LAYOUT.robot;
    r.group.position.y = base[1] + Math.sin(t * w * 3) * 0.045;
    r.group.position.x = base[0] + Math.sin(t * w) * 0.015;

    // regard : vers la caméra, ou vers la voiture qu'il scanne
    const cam = this.camera.position;
    let tx = cam.x;
    let tz = cam.z;
    let ty = 0;
    const scanning = active.find((a) => a.tau > -0.6 && a.tau < 1.6);
    if (scanning) {
      const c = this.cars[((scanning.k % 2) + 2) % 2];
      const dx = c.group.position.x - r.group.position.x;
      const dz = c.group.position.z - r.group.position.z;
      // mélange : on garde le visage plutôt vers la caméra
      tx = r.group.position.x + dx * 0.55 + (cam.x - r.group.position.x) * 0.08;
      tz = r.group.position.z + dz * 0.55 + (cam.z - r.group.position.z) * 0.08;
      ty = -0.12;
    }
    const yaw = Math.atan2(tx - r.group.position.x, tz - r.group.position.z) + 0.22;
    r.head.rotation.y = dampAngle(r.head.rotation.y, yaw, 3.2, dt);
    r.head.rotation.x = damp(r.head.rotation.x, ty + Math.sin(t * w * 2) * 0.03, 3, dt);
    r.head.rotation.z = Math.sin(t * w * 2 + 1.2) * 0.035;
    const phase = ((t % PERIOD) + PERIOD) % PERIOD;
    r.updateEyes(dt, Math.sin(t * w) * 0.15, 0, blinkAmount(phase));
  }

  /** Position écran (px) de l'ancre de la bulle. */
  projectBubble(out) {
    const v = this._v || (this._v = new THREE.Vector3());
    this.robot.bubbleAnchor.getWorldPosition(v);
    v.project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.width;
    out.y = (-v.y * 0.5 + 0.5) * this.height + this.top;
    return out;
  }
}
