import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Petites fabriques de géométries avec cache (les mêmes pièces sont
// réutilisées par toutes les voitures / bornes).

const cache = new Map();

function cached(key, make) {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
}

export function rbox(w, h, d, r, seg = 4) {
  return cached(`rb:${w}:${h}:${d}:${r}:${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999));
}

/**
 * Boîte arrondie dont le haut est rétréci (habitacle de voiture : montants
 * et pare-brise inclinés). tx / tz = facteur de largeur / profondeur en haut.
 */
export function taperedBox(w, h, d, r, tx = 0.9, tz = 0.85, seg = 5, shiftZ = 0) {
  return cached(`tb:${w}:${h}:${d}:${r}:${tx}:${tz}:${seg}:${shiftZ}`, () => {
    const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999).clone();
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const a = 1 - tx;
    const b = 1 - tz;
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const X = pos.getX(i);
      const Y = pos.getY(i);
      const Z = pos.getZ(i);
      const k = (Y + h / 2) / h; // 0 en bas -> 1 en haut
      const s = 1 - a * k;
      const t = 1 - b * k;
      pos.setXYZ(i, X * s, Y, Z * t + shiftZ * k);
      // normales : n' = J^-T n (déformation linéaire en hauteur)
      const ds = -a / h;
      const c = Z * (-b / h) + shiftZ / h;
      n.set(nor.getX(i), nor.getY(i), nor.getZ(i));
      const nx = n.x / s;
      const ny = (-X * ds * n.x) / s + n.y - (c * n.z) / t;
      const nz = n.z / t;
      n.set(nx, ny, nz).normalize();
      nor.setXYZ(i, n.x, n.y, n.z);
    }
    return g;
  });
}

/** Cylindre dont l'axe est orienté selon 'x', 'y' ou 'z'. */
export function cyl(rTop, rBottom, h, seg = 24, axis = 'y', open = false) {
  return cached(`cy:${rTop}:${rBottom}:${h}:${seg}:${axis}:${open}`, () => {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    return g;
  });
}

export function sphere(r, ws = 24, hs = 16) {
  return cached(`sp:${r}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
}

/** Capsule couchée selon l'axe donné. */
export function capsule(r, length, axis = 'x', capSeg = 8, radSeg = 20) {
  return cached(`ca:${r}:${length}:${axis}`, () => {
    const g = new THREE.CapsuleGeometry(r, Math.max(0.001, length - 2 * r), capSeg, radSeg, 1);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    return g;
  });
}

/** Pneu au profil arrondi (tour), axe selon X. */
export function tireGeometry(radius, width) {
  return cached(`tire:${radius}:${width}`, () => {
    const rIn = radius * 0.6;
    const hw = width / 2;
    const rr = Math.min(width * 0.38, radius * 0.25);
    const pts = [];
    pts.push(new THREE.Vector2(rIn, -hw));
    const steps = 6;
    // coin bas
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2);
      pts.push(new THREE.Vector2(radius - rr + Math.cos(a) * rr, -hw + rr + Math.sin(a) * rr));
    }
    // coin haut
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * (Math.PI / 2);
      pts.push(new THREE.Vector2(radius - rr + Math.cos(a) * rr, hw - rr + Math.sin(a) * rr));
    }
    pts.push(new THREE.Vector2(rIn, hw));
    const g = new THREE.LatheGeometry(pts, 36);
    g.rotateZ(Math.PI / 2);
    return g;
  });
}

/** Tube le long d'une courbe (câbles). */
export function tube(points, radius = 0.02, segs = 40) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.5);
  return new THREE.TubeGeometry(curve, segs, radius, 10, false);
}

export function mesh(geo, mat, parent, x = 0, y = 0, z = 0, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (parent) parent.add(m);
  return m;
}
