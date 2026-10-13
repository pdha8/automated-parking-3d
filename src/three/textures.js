import * as THREE from 'three';

const FONT_DISPLAY = 'Montserrat';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function canvasTexture(canvas, { srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

/* --------------------------------------------------------------------------
   Ecran des bornes (plaque d'immatriculation / heure de sortie)
   -------------------------------------------------------------------------- */
export class ScreenTexture {
  constructor({ width = 1024, height = 256, fontSize = 112, padX = 78, bg = ['#3a3b3e', '#28292b'] } = {}) {
    this.canvas = makeCanvas(width, height);
    this.ctx = this.canvas.getContext('2d');
    this.texture = canvasTexture(this.canvas);
    this.fontSize = fontSize;
    this.padX = padX;
    this.bg = bg;
    this.draw(null);
  }

  draw(tw) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, this.bg[0]);
    g.addColorStop(1, this.bg[1]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // léger reflet en haut de l'écran
    const s = ctx.createLinearGradient(0, 0, 0, h * 0.55);
    s.addColorStop(0, 'rgba(255,255,255,0.06)');
    s.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, w, h * 0.55);

    if (tw) {
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f3f3f3';
      const baseline = h * 0.5 + this.fontSize * 0.36;
      const drawRow = (chars) => {
        let x = this.padX;
        for (const c of chars) {
          ctx.font = `${c.w} ${this.fontSize}px ${FONT_DISPLAY}`;
          ctx.globalAlpha = Math.max(0, Math.min(1, c.a));
          ctx.fillText(c.ch, x, baseline);
          x += ctx.measureText(c.ch).width + this.fontSize * 0.012;
        }
      };
      drawRow(tw.ghosts);
      drawRow(tw.chars);
      ctx.globalAlpha = 1;
    }
    this.texture.needsUpdate = true;
  }
}

/* --------------------------------------------------------------------------
   Plaque d'immatriculation des voitures
   -------------------------------------------------------------------------- */
const plateCache = new Map();
export function plateTexture(text) {
  if (plateCache.has(text)) return plateCache.get(text);
  const c = makeCanvas(256, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f6f6f4';
  roundRect(ctx, 0, 0, 256, 64, 10);
  ctx.fill();
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = 4;
  roundRect(ctx, 5, 5, 246, 54, 7);
  ctx.stroke();
  ctx.fillStyle = '#121212';
  ctx.font = `700 40px ${FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const t = canvasTexture(c);
  plateCache.set(text, t);
  return t;
}

/* --------------------------------------------------------------------------
   Ticket d'entrée / reçu de sortie
   -------------------------------------------------------------------------- */
export function ticketTexture(plate = 'KA6919EN', time = '12.30PM') {
  const c = makeCanvas(256, 320);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 320);
  ctx.fillStyle = '#2a2a2a';
  ctx.font = `500 30px ${FONT_DISPLAY}`;
  ctx.fillText(plate, 26, 56);
  ctx.fillText(time, 26, 94);
  ctx.fillStyle = '#3a3a3a';
  const lines = [[26, 132, 190], [26, 156, 150], [26, 180, 176], [26, 204, 120]];
  for (const [x, y, w] of lines) ctx.fillRect(x, y, w, 6);
  return canvasTexture(c);
}

export function receiptTexture() {
  const c = makeCanvas(128, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = 'rgba(40,40,40,0.55)';
  for (let i = 0; i < 6; i++) ctx.fillRect(18, 40 + i * 26, 70 + ((i * 37) % 30), 5);
  // bord dentelé du papier
  ctx.fillStyle = '#e9e9e9';
  for (let x = 0; x < 128; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, 256);
    ctx.lineTo(x + 6, 246);
    ctx.lineTo(x + 12, 256);
    ctx.fill();
  }
  return canvasTexture(c);
}

/* --------------------------------------------------------------------------
   Visière du robot : yeux bleus lumineux ou pourcentage du loader
   -------------------------------------------------------------------------- */
export class VisorTexture {
  constructor() {
    this.canvas = makeCanvas(512, 256);
    this.ctx = this.canvas.getContext('2d');
    this.texture = canvasTexture(this.canvas);
    this.mode = 'eyes';
    this.text = '';
    this.blink = 0; // 0 = ouvert, 1 = fermé
    this.look = { x: 0, y: 0 };
    this.draw();
  }

  setText(text) {
    if (this.mode === 'text' && this.text === text) return;
    this.mode = 'text';
    this.text = text;
    this.draw();
  }

  setEyes(blink = 0, lookX = 0, lookY = 0) {
    if (this.mode === 'eyes' && Math.abs(this.blink - blink) < 0.01 && Math.abs(this.look.x - lookX) < 0.01 && Math.abs(this.look.y - lookY) < 0.01) return;
    this.mode = 'eyes';
    this.blink = blink;
    this.look.x = lookX;
    this.look.y = lookY;
    this.draw();
  }

  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // forme de l'écran (super-ellipse arrondie), le reste est transparent
    ctx.save();
    roundRect(ctx, 6, 8, w - 12, h - 16, 112);
    ctx.clip();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a2b2f');
    g.addColorStop(0.45, '#0b0b0d');
    g.addColorStop(1, '#050506');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (this.mode === 'text') {
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 92px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.text, w * 0.5, h * 0.53);
    } else {
      const open = 1 - this.blink;
      const ex = 92 + this.look.x * 26;
      const ey = this.look.y * 16;
      const eye = (cx, cy) => {
        const ry = Math.max(4, 36 * open);
        const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 64);
        glow.addColorStop(0, 'rgba(80,130,255,0.55)');
        glow.addColorStop(1, 'rgba(40,80,255,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(cx - 70, cy - 70, 140, 140);
        const core = ctx.createRadialGradient(cx - 6, cy - 8, 2, cx, cy, 34);
        core.addColorStop(0, '#9fc0ff');
        core.addColorStop(0.45, '#4d82ff');
        core.addColorStop(1, '#2f5fe6');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 30, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      };
      eye(w * 0.5 - ex, h * 0.5 + 6 + ey);
      eye(w * 0.5 + ex, h * 0.5 + 6 + ey);
    }
    ctx.restore();
    this.texture.needsUpdate = true;
  }
}

/* --------------------------------------------------------------------------
   Dégradés radiaux (halo au sol, flaques de phares, ombres douces)
   -------------------------------------------------------------------------- */
const radialCache = new Map();
export function radialTexture(stops = [[0, 1], [1, 0]], size = 256) {
  const key = JSON.stringify(stops) + size;
  if (radialCache.has(key)) return radialCache.get(key);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, a] of stops) g.addColorStop(o, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = canvasTexture(c, { srgb: false, aniso: 1 });
  radialCache.set(key, t);
  return t;
}

/** Flaque de lumière des phares (plus intense près de la voiture). */
export function headlightPoolTexture() {
  const w = 256;
  const h = 512;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  // le haut de l'image correspond au côté voiture ; dégradés elliptiques
  // qui s'annulent bien avant les bords (pas d'arête visible)
  ctx.globalCompositeOperation = 'lighter';
  for (const cx of [w * 0.34, w * 0.66]) {
    ctx.save();
    ctx.translate(cx, h * 0.1);
    ctx.scale(1, 2.6);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, w * 0.34);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.32)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-w, -h, w * 2, h * 2);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  return canvasTexture(c, { srgb: false, aniso: 1 });
}
