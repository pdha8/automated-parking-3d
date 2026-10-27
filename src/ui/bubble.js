import { Typewriter } from '../core/typewriter.js';
import data from '../data/hero-bubble.json';

// Bulle du robot (plaque scannée + chrono) superposée à la vidéo du parking.
// Sa position et son contenu sont enregistrés image par image lors de l'export
// (src/dev/exporter.js) : elle suit exactement le robot rendu dans Blender.

const FPS = 60;
const STAGE_W = 1280;
const STAGE_H = 776;
const FRAME_W = 1760; // cadre de la vidéo (maquette + marges), en pixels maquette
const FRAME_H = 960;
const MARGIN_X = (FRAME_W - STAGE_W) / 2;
const MARGIN_Y = (FRAME_H - STAGE_H) / 2;
// image où la voiture arrivée à la borne est scannée : le chrono repart de zéro
const FIRST_SCAN = Math.max(1, data.findIndex((d, i) => i > 0 && d.t < data[i - 1].t));

function charsHTML(list) {
  return list
    .map(([ch, bold, a]) => {
      const tag = bold ? 'b' : 'span';
      return `<${tag} style="opacity:${a}">${ch}</${tag}>`;
    })
    .join('');
}

export class BubbleOverlay {
  constructor(el) {
    this.el = el;
    this.plate = el.querySelector('.bubble__plate');
    this.timer = el.querySelector('.bubble__timer');
    this.visible = 1;
    this._key = '';
    this._timer = '';
    this.reset();
  }

  /** La vidéo repart du début : la bulle réapparaît au scan de la voiture. */
  reset() {
    this.firstPlay = true;
    this.prevFrame = -1;
    this.fresh = null; // machine à écrire "première apparition"
    this.freshTime = 0;
    this.appear = 0;
  }

  update(time, dt) {
    const n = data.length;
    const f = Math.min(n - 1, Math.max(0, Math.floor(time * FPS + 1e-3)));
    if (this.prevFrame >= 0 && f < this.prevFrame - FPS / 3) this.firstPlay = false; // la vidéo a bouclé
    this.prevFrame = f;
    const st = data[f];

    let opacity = st.o;
    let html;
    if (this.firstPlay) {
      if (f < FIRST_SCAN) {
        this.el.style.opacity = '0';
        return;
      }
      // première apparition : fondu + plaque tapée lettre par lettre (sans effacement)
      if (!this.fresh) {
        this.fresh = new Typewriter({ typeInterval: 0.05, fade: 0.06 });
        this.fresh.set([['KA', 400], ['6919', 700], ['EN', 400]]);
        this.freshTime = (f - FIRST_SCAN) / FPS;
        this.fresh.update(this.freshTime);
        this.appear = 0;
      }
      const target = (f - FIRST_SCAN) / FPS;
      if (target > this.freshTime) {
        this.fresh.update(target - this.freshTime);
        this.freshTime = target;
      }
      this.appear = Math.min(1, this.appear + dt / 0.25);
      opacity = this.appear;
      const c = this.fresh.chars.map((ch) => [ch.ch, ch.w >= 700 ? 1 : 0, +ch.a.toFixed(2)]);
      html = charsHTML(c);
    } else {
      html = charsHTML(st.c);
      if (st.g.length) html += `<span class="bubble__ghost">${charsHTML(st.g)}</span>`;
    }

    opacity *= this.visible;
    this.el.style.opacity = opacity.toFixed(3);
    if (opacity < 0.003) return;
    this.el.style.left = `${(((MARGIN_X + st.x * STAGE_W) / FRAME_W) * 100).toFixed(3)}%`;
    this.el.style.top = `${(((MARGIN_Y + st.y * STAGE_H) / FRAME_H) * 100).toFixed(3)}%`;
    this.el.style.transform = `scale(${(0.92 + 0.08 * Math.min(1, opacity)).toFixed(3)})`;

    const key = html || '&nbsp;';
    if (key !== this._key) {
      this.plate.innerHTML = `<span class="bubble__chars">${key}</span>`;
      this._key = key;
    }
    if (st.t !== this._timer) {
      this.timer.textContent = st.t;
      this._timer = st.t;
    }
  }
}
