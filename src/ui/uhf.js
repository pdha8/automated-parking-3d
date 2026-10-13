import gsap from 'gsap';

// Section "UHF identification" : apparition du texte ligne par ligne,
// texte tronqué en fondu + bouton "see more" qui déroule la suite.

function splitLines(p) {
  const text = p.dataset.text || p.textContent.trim().replace(/\s+/g, ' ');
  p.dataset.text = text;
  p.innerHTML = text
    .split(' ')
    .map((w) => `<span class="w">${w}</span>`)
    .join(' ');
  const words = [...p.querySelectorAll('.w')];
  const lines = [];
  let top = null;
  for (const w of words) {
    const t = w.offsetTop;
    if (top === null || Math.abs(t - top) > 2) {
      lines.push([]);
      top = t;
    }
    lines[lines.length - 1].push(w.textContent);
  }
  p.innerHTML = lines.map((l) => `<span class="ln">${l.join(' ')}</span>`).join('');
  return [...p.querySelectorAll('.ln')];
}

export class UhfSection {
  constructor(root) {
    this.root = root;
    this.title = root.querySelector('.uhf__title');
    this.body = root.querySelector('.uhf__body');
    this.textEl = root.querySelector('.uhf__text');
    this.paras = [...root.querySelectorAll('.uhf__text p')];
    this.more = root.querySelector('.more');
    this.expanded = false;
    this.lines = [];
    this.more.addEventListener('click', () => this.expand());
    this.active = false;
    this.split();
    this._splitWidth = this.textEl.offsetWidth;
    this.collapse(true);
    gsap.set([this.title, ...this.lines, this.more], { opacity: 0 });
  }

  split() {
    this.lines = this.paras.flatMap((p) => splitLines(p));
    for (const l of this.lines) l.style.display = 'block';
  }

  resize(force = false) {
    const w = this.textEl.offsetWidth;
    if (w === this._splitWidth && !force) return;
    this._splitWidth = w;
    gsap.killTweensOf(this.lines);
    this.split();
    // état visible recalculé pour les nouvelles lignes
    this.lines.forEach((l, i) => {
      l.style.opacity = this.active && (this.expanded || i < 4) ? '1' : '0';
    });
    if (this.expanded) gsap.set(this.body, { height: this.textEl.offsetHeight });
    else this.collapse(true);
  }

  collapsedHeight() {
    const lh = parseFloat(getComputedStyle(this.lines[0] || this.textEl).lineHeight) || 25;
    return lh * 4;
  }

  collapse(immediate = false) {
    this.expanded = false;
    gsap.killTweensOf(this.body);
    const h = this.collapsedHeight();
    if (immediate) {
      gsap.set(this.body, { height: h, '--mask-solid': '45%', '--mask-end': '100%' });
      gsap.set(this.more, { scale: 1, pointerEvents: 'auto' });
    }
  }

  /** Entrée dans la section : titre puis lignes en cascade, puis bouton. */
  enter() {
    this.active = true;
    gsap.killTweensOf([this.title, ...this.lines, this.more]);
    this.collapse(true);
    gsap.set([this.title, ...this.lines, this.more], { opacity: 0 });
    gsap.fromTo(this.title, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.55, delay: 0.18, ease: 'power2.out' });
    const visible = this.lines.slice(0, 4);
    gsap.to(visible, { opacity: 1, duration: 0.45, delay: 0.32, stagger: 0.09, ease: 'power1.out' });
    gsap.set(this.lines.slice(4), { opacity: 0 });
    gsap.fromTo(this.more, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.4, delay: 0.62, ease: 'power2.out' });
  }

  /** "see more" : le bloc s'agrandit et les lignes suivantes apparaissent. */
  expand() {
    if (this.expanded) return;
    this.expanded = true;
    const full = this.textEl.offsetHeight;
    gsap.to(this.more, { opacity: 0, scale: 0.85, duration: 0.25, ease: 'power2.in', pointerEvents: 'none' });
    gsap.to(this.body, { height: full, duration: 0.7, ease: 'power2.inOut' });
    gsap.to(this.body, { '--mask-solid': '100%', '--mask-end': '100%', duration: 0.9, ease: 'power1.inOut' });
    gsap.to(this.lines.slice(2), { opacity: 1, duration: 0.5, stagger: 0.07, delay: 0.1, ease: 'power1.out' });
  }

  /** Sortie : on cache le texte pour rejouer l'animation au retour. */
  reset() {
    this.active = false;
    gsap.killTweensOf([this.title, ...this.lines, this.more, this.body]);
    gsap.set([this.title, ...this.lines, this.more], { opacity: 0 });
    this.collapse(true);
  }
}
