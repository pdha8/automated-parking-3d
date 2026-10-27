import * as THREE from 'three';
import { EASE_DRIVE, clamp } from '../core/ease.js';

// Trajectoire temporisée d'une voiture : une suite de segments (courbes de
// Bézier dans le plan XZ), parcourus en marche avant ou arrière.

const EASES = {
  linear: (t) => t,
  inout: EASE_DRIVE,
  in: (t) => t * t, // accélération douce
  out: (t) => 1 - (1 - t) * (1 - t),
  softout: (t) => 1 - Math.pow(1 - t, 3),
  softin: (t) => t * t * t,
};

// accélération progressive (sans à-coup au démarrage ni en fin d'accélération)
// puis vitesse constante
function accel(a) {
  const k = 1 - a / 2;
  return (t) => {
    if (t >= a) return (t - a / 2) / k;
    const u = t / a;
    return ((a / k) * (u * u * u - (u * u * u * u) / 2));
  };
}
EASES.accel = accel(0.2);
// départ et arrêt avec accélération nulle aux extrémités
EASES.smoother = (t) => t * t * t * (t * (6 * t - 15) + 10);

/** Progression avec pentes imposées au début et à la fin (vitesse continue entre segments). */
function hermite(s0, s1) {
  return (t) => {
    const t2 = t * t;
    const t3 = t2 * t;
    return (t3 - 2 * t2 + t) * s0 + (-2 * t3 + 3 * t2) + (t3 - t2) * s1;
  };
}

/** Même chose avec accélération nulle aux deux bouts (démarrage / arrêt en douceur). */
function hermite5(s0, s1) {
  return (t) => {
    const t2 = t * t;
    const t3 = t2 * t;
    const t4 = t3 * t;
    const t5 = t4 * t;
    return s0 * (t - 6 * t3 + 8 * t4 - 3 * t5) + s1 * (-4 * t3 + 7 * t4 - 3 * t5) + (10 * t3 - 15 * t4 + 6 * t5);
  };
}

/**
 * Lisse la courbure d'un tracé : le cap (direction) est filtré le long de la
 * distance parcourue (noyau gaussien d'écart-type sigma, en unités de scène),
 * puis le tracé est reconstruit à partir de ce cap. Les virages restent au même
 * endroit mais la direction ne peut plus tourner brusquement (jonctions de
 * courbes, virages trop serrés). L'arrivée est recalée sur le point d'origine.
 */
function smoothCurve(curve, sigma) {
  const n = 480;
  const pts = curve.getSpacedPoints(n);
  const L = curve.getLength();
  const ds = L / n;
  // cap de chaque petit tronçon (angle continu, sans saut de 2π)
  const th = [];
  for (let i = 0; i < n; i++) {
    let a = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
    if (i > 0) {
      while (a - th[i - 1] > Math.PI) a -= Math.PI * 2;
      while (a - th[i - 1] < -Math.PI) a += Math.PI * 2;
    }
    th.push(a);
  }
  // caps d'extrémité : tangente exacte de la courbe (et non la première corde)
  const unwrap = (a, ref) => {
    while (a - ref > Math.PI) a -= Math.PI * 2;
    while (a - ref < -Math.PI) a += Math.PI * 2;
    return a;
  };
  const t0 = curve.getTangentAt(0);
  const t1 = curve.getTangentAt(1);
  th[0] = unwrap(Math.atan2(t0.y, t0.x), th[0]);
  th[n - 1] = unwrap(Math.atan2(t1.y, t1.x), th[n - 1]);
  // filtrage gaussien ; au-delà des bords, réflexion impaire autour du cap
  // d'extrémité : le cap de départ et d'arrivée reste exactement le même
  const r = Math.max(1, Math.round((sigma / ds) * 3));
  const w = [];
  for (let k = -r; k <= r; k++) w.push(Math.exp(-0.5 * Math.pow((k * ds) / sigma, 2)));
  const at = (j) => {
    if (j < 0) return 2 * th[0] - th[Math.min(n - 1, -j)];
    if (j > n - 1) return 2 * th[n - 1] - th[Math.max(0, 2 * (n - 1) - j)];
    return th[j];
  };
  const sm = th.map((_, i) => {
    let acc = 0;
    let tot = 0;
    for (let k = -r; k <= r; k++) {
      acc += at(i + k) * w[k + r];
      tot += w[k + r];
    }
    return acc / tot;
  });
  // reconstruction, puis recalage progressif sur le point d'arrivée
  const out = [pts[0].clone()];
  for (let i = 0; i < n; i++) out.push(new THREE.Vector2(out[i].x + Math.cos(sm[i]) * ds, out[i].y + Math.sin(sm[i]) * ds));
  const ex = pts[n].x - out[n].x;
  const ey = pts[n].y - out[n].y;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const f = t * t * (3 - 2 * t);
    out[i].x += ex * f;
    out[i].y += ey * f;
  }
  return new THREE.SplineCurve(out);
}

function toCurve(pts) {
  const v = pts.map(([x, z]) => new THREE.Vector2(x, z));
  if (v.length === 2) return new THREE.LineCurve(v[0], v[1]);
  if (v.length === 3) return new THREE.QuadraticBezierCurve(v[0], v[1], v[2]);
  return new THREE.CubicBezierCurve(v[0], v[1], v[2], v[3]);
}

function toPath(pieces) {
  if (pieces.length === 1) return toCurve(pieces[0]);
  const p = new THREE.CurvePath();
  for (const pc of pieces) p.add(toCurve(pc));
  return p;
}

export class Track {
  /**
   * @param {Array<{t:[number,number], pts?:number[][], hold?:number[], reverse?:boolean, ease?:string}>} segs
   */
  constructor(segs) {
    this.segments = [];
    let dist = 0;
    let last = null;
    for (const s of segs) {
      const seg = { t0: s.t[0], t1: s.t[1], reverse: !!s.reverse, ease: EASES[s.ease || 'inout'] };
      if (s.pts || s.path) {
        seg.curve = s.path ? toPath(s.path) : toCurve(s.pts);
        seg.curve.arcLengthDivisions = 240;
        if (s.smooth) {
          seg.curve = smoothCurve(seg.curve, s.smooth);
          seg.curve.arcLengthDivisions = 480;
        }
        seg.length = seg.curve.getLength();
        // vitesses imposées aux extrémités (u/s) : pas de saut de vitesse au raccord
        if (s.v) {
          const T = seg.t1 - seg.t0;
          const s0 = (s.v[0] * T) / seg.length;
          const s1 = (s.v[1] * T) / seg.length;
          seg.ease = s.soft ? hermite5(s0, s1) : hermite(s0, s1);
        }
      } else {
        seg.curve = null;
        seg.length = 0;
      }
      seg.dist0 = dist;
      dist += seg.reverse ? -seg.length : seg.length;
      this.segments.push(seg);
      last = seg;
    }
    this.t0 = this.segments[0].t0;
    this.t1 = last.t1;
    this._tmp = new THREE.Vector2();
    this._tan = new THREE.Vector2();
    // les segments "hold" héritent de la pose du segment précédent
    for (let i = 0; i < this.segments.length; i++) {
      const s = this.segments[i];
      if (!s.curve) {
        const prev = this.segments[i - 1];
        const next = this.segments[i + 1];
        s.holdFrom = prev || next;
        s.holdAtEnd = !!prev;
      }
    }
  }

  _pose(seg, u, out) {
    const c = seg.curve;
    c.getPointAt(u, this._tmp);
    c.getTangentAt(u, this._tan);
    let dx = this._tan.x;
    let dz = this._tan.y;
    if (seg.reverse) {
      dx = -dx;
      dz = -dz;
    }
    out.x = this._tmp.x;
    out.z = this._tmp.y;
    out.heading = Math.atan2(dx, dz);
    out.dist = seg.dist0 + (seg.reverse ? -1 : 1) * seg.length * u;
  }

  /** Pose à l'instant t : { x, z, heading, dist } (dist = distance signée cumulée). */
  sample(t, out = {}) {
    const segs = this.segments;
    let seg = segs[0];
    if (t <= this.t0) {
      seg = segs[0];
      t = seg.t0;
    } else if (t >= this.t1) {
      seg = segs[segs.length - 1];
      t = seg.t1;
    } else {
      for (const s of segs) {
        if (t >= s.t0 && t <= s.t1) {
          seg = s;
          break;
        }
      }
    }
    if (!seg.curve) {
      const ref = seg.holdFrom;
      this._pose(ref, seg.holdAtEnd ? 1 : 0, out);
      out.dist = seg.dist0;
      return out;
    }
    const k = clamp((t - seg.t0) / Math.max(1e-6, seg.t1 - seg.t0));
    this._pose(seg, clamp(seg.ease(k)), out);
    return out;
  }
}
