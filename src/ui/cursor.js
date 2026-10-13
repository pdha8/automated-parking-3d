import { damp } from '../core/ease.js';

// Curseur de la vidéo : une petite étoile qui suit la souris et un anneau
// qui la rattrape avec un léger retard.

export class Cursor {
  constructor(root) {
    this.root = root;
    this.ring = root.querySelector('.cursor__ring');
    this.star = root.querySelector('.cursor__star');
    this.enabled = window.matchMedia('(pointer: fine)').matches;
    this.x = window.innerWidth / 2;
    this.y = window.innerHeight / 2;
    this.rx = this.x;
    this.ry = this.y;
    this.visible = false;
    if (!this.enabled) return;

    document.documentElement.classList.add('has-cursor');
    root.classList.add('is-hidden');

    window.addEventListener('mousemove', (e) => {
      this.x = e.clientX;
      this.y = e.clientY;
      if (!this.visible) {
        this.visible = true;
        this.rx = this.x;
        this.ry = this.y;
        root.classList.remove('is-hidden');
      }
    });
    document.addEventListener('mouseleave', () => {
      this.visible = false;
      root.classList.add('is-hidden');
    });
    window.addEventListener('mousedown', () => root.classList.add('is-down'));
    window.addEventListener('mouseup', () => root.classList.remove('is-down'));
  }

  update(dt) {
    if (!this.enabled) return;
    this.rx = damp(this.rx, this.x, 11, dt);
    this.ry = damp(this.ry, this.y, 11, dt);
    this.star.style.transform = `translate3d(${this.x}px, ${this.y}px, 0)`;
    this.ring.style.transform = `translate3d(${this.rx}px, ${this.ry}px, 0)`;
  }
}
