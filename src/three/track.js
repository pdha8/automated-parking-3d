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

// accélération courte puis vitesse constante (pente continue)
function accel(a) {
  const k = 1 - a / 2;
  return (t) => (t < a ? (t * t) / (2 * a * k) : (t - a / 2) / k);
}
EASES.accel = accel(0.14);

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
        seg.length = seg.curve.getLength();
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
