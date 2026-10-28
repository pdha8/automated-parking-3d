import * as THREE from 'three';
import { MAT } from '../materials.js';
import { rbox, cyl, sphere, capsule, tube, mesh } from '../geo.js';
import { ScreenTexture, ticketTexture, receiptTexture } from '../textures.js';

/* --------------------------------------------------------------------------
   Plots (bornes cylindriques avec bande blanche) — instanciés
   -------------------------------------------------------------------------- */
export function createBollards(points) {
  const group = new THREE.Group();
  group.name = 'bollards';
  const n = points.length;
  const H = 0.3;
  const R = 0.068;
  const bodyGeo = cyl(R, R * 1.04, H, 20);
  const bandGeo = cyl(R * 1.025, R * 1.025, 0.075, 20);
  const capGeo = new THREE.SphereGeometry(R, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const body = new THREE.InstancedMesh(bodyGeo, MAT.accent, n);
  const band = new THREE.InstancedMesh(bandGeo, MAT.white, n);
  const cap = new THREE.InstancedMesh(capGeo, MAT.accent, n);
  const m = new THREE.Matrix4();
  points.forEach(([x, z], i) => {
    m.makeTranslation(x, H / 2, z);
    body.setMatrixAt(i, m);
    m.makeTranslation(x, H - 0.075, z);
    band.setMatrixAt(i, m);
    m.makeTranslation(x, H, z);
    cap.setMatrixAt(i, m);
  });
  for (const im of [body, band, cap]) {
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    group.add(im);
  }
  return group;
}

/* --------------------------------------------------------------------------
   Borne à ticket (entrée) / borne de sortie
   -------------------------------------------------------------------------- */
export function createMachine({ kind = 'entry', plate = 'KA6919EN' } = {}) {
  const g = new THREE.Group();
  g.name = `machine-${kind}`;
  const W = 0.5;
  const H = kind === 'entry' ? 0.56 : 0.7; // la borne de sortie est plus haute
  const D = 0.42;
  mesh(rbox(W, H, D, 0.07, 5), MAT.accent, g, 0, H / 2, 0);

  // bouton rouge en façade
  const by = kind === 'entry' ? 0.27 : 0.27;
  mesh(cyl(0.125, 0.125, 0.04, 32, 'z'), MAT.accent, g, 0, by, D / 2 + 0.012);
  const btn = mesh(cyl(0.092, 0.096, 0.06, 32, 'z'), MAT.red, g, 0, by, D / 2 + 0.035);
  const dome = mesh(sphere(0.092, 24, 12), MAT.red, g, 0, by, D / 2 + 0.06, { cast: false });
  dome.scale.set(1, 1, 0.28);

  const out = { group: g, ticket: null, receipt: null };

  if (kind === 'entry') {
    // fente sur le dessus + ticket qui sort
    mesh(rbox(0.3, 0.012, 0.05, 0.005, 2), MAT.slot, g, 0, H + 0.002, 0.02, { cast: false });
    const ticketPivot = new THREE.Group();
    ticketPivot.position.set(0, H, 0.02);
    g.add(ticketPivot);
    const tex = ticketTexture(plate, '12.30PM');
    const tMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, name: 'ticket' });
    const ticket = mesh(new THREE.BoxGeometry(0.25, 0.32, 0.006), [MAT.paper, MAT.paper, MAT.paper, MAT.paper, tMat, MAT.paper], ticketPivot, 0, 0.16, 0);
    ticket.castShadow = true;
    ticketPivot.userData.ticket = ticket;
    out.ticket = ticketPivot;
    // câble qui sort sur le côté et descend au sol
    mesh(tube([[-W / 2 + 0.02, 0.2, 0.0], [-W / 2 - 0.08, 0.18, 0.02], [-W / 2 - 0.13, 0.08, 0.04], [-W / 2 - 0.13, 0.015, 0.05]], 0.022), MAT.accent, g);
    mesh(cyl(0.045, 0.05, 0.025, 16), MAT.accent, g, -W / 2 - 0.13, 0.012, 0.05);
  } else {
    // fente frontale + reçu qui s'imprime
    mesh(rbox(0.26, 0.03, 0.03, 0.01, 2), MAT.slot, g, 0, 0.56, D / 2 + 0.002, { cast: false });
    const receiptPivot = new THREE.Group();
    receiptPivot.position.set(0, 0.56, D / 2 + 0.01);
    g.add(receiptPivot);
    const rTex = receiptTexture();
    const rMat = new THREE.MeshStandardMaterial({ map: rTex, roughness: 0.85, side: THREE.DoubleSide, name: 'receipt' });
    // papier légèrement courbé : sort vers l'avant puis retombe
    const pGeo = new THREE.PlaneGeometry(0.2, 0.34, 1, 12);
    const pos = pGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i); // -0.17..0.17
      const t = (0.17 - y) / 0.34; // 0 en haut (fente) -> 1 en bas
      pos.setY(i, -t * 0.3);
      pos.setZ(i, Math.sin(t * Math.PI * 0.55) * 0.075);
    }
    pGeo.computeVertexNormals();
    const paper = mesh(pGeo, rMat, receiptPivot, 0, 0, 0);
    paper.castShadow = true;
    out.receipt = receiptPivot;
  }
  return out;
}

/* --------------------------------------------------------------------------
   Panneau d'affichage sur poteau (sortie)
   -------------------------------------------------------------------------- */
export function createBoard({ width = 1.22, height = 0.42, postHeight = 0.98 } = {}) {
  const g = new THREE.Group();
  g.name = 'board';
  const screen = new ScreenTexture();
  const panel = new THREE.Group();
  panel.position.set(0, postHeight + height / 2 - 0.04, 0);
  g.add(panel);
  mesh(rbox(width, height, 0.13, 0.075, 5), MAT.accent, panel);
  const sMat = new THREE.MeshStandardMaterial({ name: 'screen', map: screen.texture, roughness: 0.35, metalness: 0.0, emissive: new THREE.Color('#ffffff'), emissiveMap: screen.texture, emissiveIntensity: 0.18 });
  mesh(new THREE.PlaneGeometry(width - 0.12, height - 0.12), sMat, panel, 0, 0, 0.067, { cast: false });
  // poteau
  mesh(cyl(0.042, 0.046, postHeight, 16), MAT.accent, g, -width / 2 + 0.12, postHeight / 2, -0.01);
  mesh(cyl(0.07, 0.08, 0.03, 20), MAT.accent, g, -width / 2 + 0.12, 0.015, -0.01);
  return { group: g, panel, screen };
}

/** Câble qui relie le bout du panneau à la borne de sortie (repère du portique). */
export function createGateCable(machinePos, boardRight = 1.3, boardY = 1.12, mScale = 1) {
  const mx = machinePos.x;
  const mz = machinePos.z;
  const top = 0.7 * mScale;
  const pts = [
    [boardRight - 0.02, boardY - 0.02, -0.02],
    [boardRight + 0.16, boardY - 0.06, -0.01],
    [boardRight + 0.22, boardY - 0.3, 0.0],
    [mx + 0.2 * mScale, top + 0.1, mz - 0.06 * mScale],
    [mx + 0.13 * mScale, top + 0.005, mz - 0.07 * mScale],
  ];
  return mesh(tube(pts, 0.026, 48), MAT.accent, null);
}

/* --------------------------------------------------------------------------
   Panneau "P"
   -------------------------------------------------------------------------- */
function pShape() {
  const s = new THREE.Shape();
  // jambage + boucle du P (unités ~ 0..1)
  s.moveTo(0, 0);
  s.lineTo(0.19, 0);
  s.lineTo(0.19, 0.3);
  s.lineTo(0.36, 0.3);
  s.bezierCurveTo(0.6, 0.3, 0.72, 0.45, 0.72, 0.62);
  s.bezierCurveTo(0.72, 0.82, 0.6, 0.96, 0.36, 0.96);
  s.lineTo(0, 0.96);
  s.lineTo(0, 0);
  const hole = new THREE.Path();
  hole.moveTo(0.19, 0.46);
  hole.lineTo(0.35, 0.46);
  hole.bezierCurveTo(0.47, 0.46, 0.53, 0.53, 0.53, 0.63);
  hole.bezierCurveTo(0.53, 0.73, 0.47, 0.8, 0.35, 0.8);
  hole.lineTo(0.19, 0.8);
  hole.lineTo(0.19, 0.46);
  s.holes.push(hole);
  return s;
}

export function createPSign() {
  const g = new THREE.Group();
  g.name = 'p-sign';
  const W = 0.6;
  const H = 0.72;
  const D = 0.14;
  const panel = new THREE.Group();
  panel.position.y = 0.5 + H / 2;
  g.add(panel);
  mesh(rbox(W, H, D, 0.15, 6), MAT.accent, panel);
  const geo = new THREE.ExtrudeGeometry(pShape(), { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 16 });
  geo.scale(0.5, 0.5, 1);
  geo.translate(-0.165, -0.24, D / 2 - 0.004);
  mesh(geo, MAT.white, panel, 0, 0, 0, { cast: false });
  mesh(cyl(0.045, 0.05, 0.56, 16), MAT.accent, g, 0, 0.28, -0.02);
  mesh(cyl(0.075, 0.085, 0.03, 20), MAT.accent, g, 0, 0.015, -0.02);
  return g;
}

/* --------------------------------------------------------------------------
   Ralentisseur rayé (capsule couchée)
   -------------------------------------------------------------------------- */
// capsule aplatie : dôme bas et large (10 cm de haut, 32 cm de large), comme sur la vidéo
export const BUMP = { r: 0.105, y: 0.045, sy: 0.667, sz: 1.52 };

export function createBump(length = 1.4, stripes = 6) {
  const g = new THREE.Group();
  g.name = 'bump';
  g.userData.bumpLength = length;
  const R = BUMP.r;
  const shape = new THREE.Group();
  shape.scale.set(1, BUMP.sy, BUMP.sz);
  g.add(shape);
  mesh(capsule(R, length, 'x', 10, 24), MAT.accent, shape, 0, BUMP.y, 0);
  const ringGeo = new THREE.TorusGeometry(R * 1.005, 0.0085, 6, 32);
  ringGeo.rotateY(Math.PI / 2);
  for (let i = 0; i < stripes; i++) {
    const x = -length / 2 + R * 1.6 + (i / (stripes - 1)) * (length - R * 3.2);
    const ring = mesh(ringGeo, MAT.white, shape, x, BUMP.y, 0, { cast: false });
    ring.rotation.z = 0.32;
  }
  return g;
}

/* --------------------------------------------------------------------------
   Bordure (séparateur de voie)
   -------------------------------------------------------------------------- */
export function createRail(length = 5) {
  const g = new THREE.Group();
  g.name = 'rail';
  mesh(capsule(0.055, length, 'z', 6, 14), MAT.accent, g, 0, 0.05, 0);
  return g;
}
