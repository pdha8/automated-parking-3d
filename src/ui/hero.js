import gsap from 'gsap';

// Animation d'entrée du hero (titre ligne par ligne, bouton qui s'étire,
// description en fondu), calée sur la vidéo de référence.

function uPx() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;width:calc(var(--u) * 100)';
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().width / 100;
  probe.remove();
  return px || 1;
}

export class HeroUI {
  constructor() {
    this.lines = [...document.querySelectorAll('.hero__line > span')];
    this.desc = document.querySelector('.hero__desc');
    this.cta = document.querySelector('.cta');
    this.ctaLabel = this.cta.querySelector('.cta__label');
  }

  /** Etat initial avant l'animation d'entrée. */
  prepare() {
    const u = uPx();
    gsap.set(this.lines, { opacity: 0, y: u * 70 });
    gsap.set(this.desc, { opacity: 0, y: u * 10 });
    gsap.set(this.cta, { scale: 0 });
    gsap.set(this.ctaLabel, { opacity: 0 });
  }

  /** Animation d'entrée (t = 0 au début du rideau). */
  playIntro() {
    const tl = gsap.timeline();
    tl.to(this.lines[0], { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out' }, 0.33);
    tl.to(this.lines[1], { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out' }, 0.4);
    // bouton : pastille qui apparaît puis s'étire en pilule
    const w = this.cta.offsetWidth;
    const h = this.cta.offsetHeight;
    tl.fromTo(this.cta, { width: h, x: (w - h) / 2, scale: 0 }, { scale: 1, duration: 0.14, ease: 'power2.out' }, 0.52);
    tl.to(this.cta, { width: w, x: 0, duration: 0.3, ease: 'power3.out' }, 0.64);
    tl.to(this.ctaLabel, { opacity: 1, duration: 0.25, ease: 'power1.out' }, 0.72);
    tl.add(() => gsap.set(this.cta, { clearProps: 'width,transform' }), 1.1);
    tl.to(this.desc, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 0.62);
    return tl;
  }
}
