// Petites fonctions d'interpolation / easing partagées.

/**
 * Easing cubic-bezier identique à CSS (algorithme UnitBezier de WebKit).
 */
export function bezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t) => (3 * ax * t + 2 * bx) * t + cx;

  const solveX = (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (x > v) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sampleY(solveX(x)));
}

// Courbes mesurées image par image sur la vidéo de référence
export const EASE_WIPE = bezier(0.4, 0.1, 0.05, 0.65); // rideau du loader (0.75 s)
export const EASE_SCROLL = bezier(0.3, 0.1, 0.05, 0.9); // défilement des sections (~1 s)
export const EASE_OUT = bezier(0.2, 0.7, 0.2, 1);
export const EASE_IN_OUT = bezier(0.6, 0, 0.3, 1);
export const EASE_DRIVE = bezier(0.45, 0, 0.4, 1); // accélération / freinage des voitures

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Amortissement indépendant du framerate. */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

export function dampAngle(current, target, lambda, dt) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * (1 - Math.exp(-lambda * dt));
}
