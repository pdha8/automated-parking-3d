import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Carrosseries "jouet" obtenues en extrudant un profil latéral arrondi,
// puis en resserrant le haut (vitres inclinées vers l'intérieur).
// Repère : avant = +Z, haut = +Y, largeur selon X.

/** Construit une forme 2D (u = longueur, v = hauteur) à partir d'une liste
 *  de points ; chaque point peut avoir un rayon d'arrondi. */
function roundedPolygon(points) {
  const shape = new THREE.Shape();
  const n = points.length;
  const P = points.map(([u, v, r = 0]) => ({ u, v, r }));
  const corner = (i) => {
    const p = P[i];
    const a = P[(i - 1 + n) % n];
    const b = P[(i + 1) % n];
    if (!p.r) return { start: [p.u, p.v], ctrl: null, end: [p.u, p.v] };
    const la = Math.hypot(a.u - p.u, a.v - p.v);
    const lb = Math.hypot(b.u - p.u, b.v - p.v);
    const r = Math.min(p.r, la * 0.48, lb * 0.48);
    return {
      start: [p.u + ((a.u - p.u) / la) * r, p.v + ((a.v - p.v) / la) * r],
      ctrl: [p.u, p.v],
      end: [p.u + ((b.u - p.u) / lb) * r, p.v + ((b.v - p.v) / lb) * r],
    };
  };
  const c0 = corner(0);
  shape.moveTo(...c0.end);
  for (let i = 1; i <= n; i++) {
    const c = corner(i % n);
    shape.lineTo(...c.start);
    if (c.ctrl) shape.quadraticCurveTo(c.ctrl[0], c.ctrl[1], c.end[0], c.end[1]);
  }
  return shape;
}

/**
 * @param {Array} profile  points [u, v, rayon] (sens anti-horaire, vue de côté, avant à droite)
 * @param {number} width   largeur hors tout
 * @param {number} bevel   rayon des arêtes latérales
 * @param {number} belt    hauteur de la ceinture de caisse (début du resserrement)
 * @param {number} top     hauteur du toit
 * @param {number} taper   resserrement en haut (fraction de la largeur)
 */
export function extrudeBody({ profile, width, bevel = 0.06, belt = 0.47, top = 0.74, taper = 0.16, curveSegments = 10, bevelSegments = 5 }) {
  const shape = roundedPolygon(profile);
  const depth = Math.max(0.001, width - bevel * 2);
  let g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.9,
    bevelOffset: 0,
    bevelSegments,
    curveSegments,
    steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2); // u -> +Z (avant), extrusion -> X
  // resserrement de l'habitacle
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > belt) {
      const k = Math.min(1, (y - belt) / (top - belt));
      pos.setX(i, pos.getX(i) * (1 - taper * k * (0.6 + 0.4 * k)));
    }
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  return g;
}

/** Profil plat (vitre, toit) extrudé finement, centré en X. */
export function flatShape(points, thickness = 0.01, bevel = 0.004) {
  const shape = roundedPolygon(points);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  g.translate(0, 0, -thickness / 2);
  return g;
}

/**
 * Extrait la "calotte" de la carrosserie au-dessus de yCut (toit) et la
 * gonfle très légèrement : le toit blanc épouse exactement la forme arrondie.
 */
export function extractCap(geo, yCut, inflate = 0.006) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const idx = geo.index;
  const outP = [];
  const outN = [];
  const count = idx ? idx.count : pos.count;
  const get = (i) => (idx ? idx.getX(i) : i);
  for (let t = 0; t < count; t += 3) {
    const a = get(t);
    const b = get(t + 1);
    const c = get(t + 2);
    if (pos.getY(a) < yCut || pos.getY(b) < yCut || pos.getY(c) < yCut) continue;
    for (const v of [a, b, c]) {
      const nx = nor.getX(v);
      const ny = nor.getY(v);
      const nz = nor.getZ(v);
      outP.push(pos.getX(v) + nx * inflate, pos.getY(v) + ny * inflate, pos.getZ(v) + nz * inflate);
      outN.push(nx, ny, nz);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(outP, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(outN, 3));
  return g;
}

/** Demi-largeur de la caisse à la hauteur y (après resserrement). */
export function halfWidthAt(y, { width, belt, top, taper }) {
  if (y <= belt) return width / 2;
  const k = Math.min(1, (y - belt) / (top - belt));
  return (width / 2) * (1 - taper * k * (0.6 + 0.4 * k));
}
