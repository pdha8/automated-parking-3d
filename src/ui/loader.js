import { EASE_WIPE, clamp } from '../core/ease.js';

// Ecran de chargement : le robot (rendu Blender) flotte, sa visière affiche
// le pourcentage. Rapide au début, lent à la fin, comme dans la vidéo.

export class Loader {
  constructor(root) {
    this.root = root;
    this.pctEl = root.querySelector('#loader-pct');
    this.shown = -1;
    this.target = 0; // progression réelle (0..1)
    this.start = performance.now();
    this.minDuration = 1900; // ms
    this.disposed = false;
    this._loop = (now) => {
      this._frame(now);
      if (!this.disposed) this._raf = requestAnimationFrame(this._loop);
    };
    this._raf = requestAnimationFrame(this._loop);
    if (import.meta.env.DEV) {
      // horloge de secours si l'onglet est masqué (tests automatisés)
      this._fallback = setInterval(() => {
        if (performance.now() - (this._lastFrame || 0) > 150) this._frame(performance.now());
      }, 33);
    }
  }

  /** Progression réelle du chargement (0..1). */
  setProgress(p) {
    this.target = Math.max(this.target, clamp(p));
  }

  /** Résolu quand le compteur atteint 100 %. */
  finished() {
    return new Promise((resolve) => {
      if (this.shown >= 100) resolve();
      else this._onFinish = resolve;
    });
  }

  _frame(now) {
    if (this.disposed) return;
    this._lastFrame = performance.now();
    const time = clamp((now - this.start) / this.minDuration);
    const curve = 1 - Math.pow(1 - time, 2.6);
    const cap = this.target >= 1 ? 1 : 0.15 + this.target * 0.84;
    const pct = Math.floor(Math.min(curve, cap) * 100);
    if (pct !== this.shown) {
      this.shown = pct;
      this.pctEl.textContent = `${pct}%`;
      if (pct >= 100 && this._onFinish) this._onFinish();
    }
  }

  /** Rideau : le hero apparaît de bas en haut. */
  wipe(progress) {
    const p = EASE_WIPE(clamp(progress));
    this.root.style.clipPath = `inset(0 0 ${(p * 100).toFixed(3)}% 0)`;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    clearInterval(this._fallback);
    this.root.remove();
  }
}
