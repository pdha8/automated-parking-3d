import { WHEEL_R } from './models/car.js';
import { BUMP } from './models/props.js';

// Passage sur les ralentisseurs : chaque roue roule sur le profil du dôme (au lieu de le
// traverser) et la caisse suit (hauteur, tangage, roulis). Sans état : la pose ne dépend
// que de la position de la voiture, donc la boucle vidéo reste parfaite.

const A = BUMP.r * BUMP.sz; // demi-largeur du dôme
const B = BUMP.r * BUMP.sy; // demi-hauteur
const C = BUMP.y * BUMP.sy; // hauteur du centre de la section
const STEPS = 96;

/** Montée du centre de la roue à la distance v de l'axe du dôme (section réduite d'un facteur k aux bouts). */
function liftAcross(v, k) {
  let best = 0;
  for (let i = 0; i <= STEPS; i++) {
    const a = (i / STEPS) * Math.PI;
    const d = Math.abs(v - A * k * Math.cos(a));
    if (d >= WHEEL_R) continue;
    best = Math.max(best, C + B * k * Math.sin(a) + Math.sqrt(WHEEL_R * WHEEL_R - d * d) - WHEEL_R);
  }
  return best;
}

export class BumpField {
  constructor() {
    this.bumps = [];
  }

  /** Ajoute un ralentisseur créé par createBump (position et rotation.y déjà réglées). */
  add(group) {
    const half = group.userData.bumpLength / 2;
    const r = group.rotation.y;
    this.bumps.push({ x: group.position.x, z: group.position.z, c: Math.cos(r), s: Math.sin(r), half, flat: half - BUMP.r });
  }

  /** Montée d'une roue dont le centre est au-dessus du point (x, z) du sol. */
  lift(x, z) {
    let h = 0;
    for (const b of this.bumps) {
      const dx = x - b.x;
      const dz = z - b.z;
      const u = Math.abs(dx * b.c - dz * b.s); // le long du dôme
      const v = dx * b.s + dz * b.c; // en travers
      if (u >= b.half || Math.abs(v) >= A + WHEEL_R) continue;
      const k = u <= b.flat ? 1 : Math.sqrt(1 - ((u - b.flat) / BUMP.r) ** 2);
      h = Math.max(h, liftAcross(v, k));
    }
    return h;
  }

  /** Pose les roues de la voiture sur les dômes ; renvoie la pose de la caisse qui en découle. */
  ride(car, out = { lift: 0, pitch: 0, roll: 0 }) {
    const g = car.group;
    const ch = Math.cos(g.rotation.y);
    const sh = Math.sin(g.rotation.y);
    let front = 0;
    let rear = 0;
    let left = 0;
    let right = 0;
    let halfTrack = 0;
    let halfBase = 0;
    for (const w of car.wheels) {
      const p = w.parent.position; // pivot de la roue, repère de la voiture
      const h = this.lift(g.position.x + p.x * ch + p.z * sh, g.position.z - p.x * sh + p.z * ch);
      w.position.y = h;
      if (p.z > 0) front += h / 2;
      else rear += h / 2;
      if (p.x > 0) right += h / 2;
      else left += h / 2;
      halfTrack = Math.abs(p.x);
      halfBase = Math.abs(p.z);
    }
    out.lift = (front + rear) / 2;
    out.pitch = -Math.asin((front - rear) / (2 * halfBase));
    out.roll = Math.asin((right - left) / (2 * halfTrack));
    return out;
  }
}
