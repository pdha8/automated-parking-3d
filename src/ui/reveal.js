import gsap from 'gsap';

// Apparition en cascade des éléments [data-reveal] d'une section, à son arrivée
// (même mouvement que le texte « UHF identification »). Remis à zéro en sortant.

const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function uPx() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u'));
  if (v) return v;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;width:calc(var(--u) * 100)';
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().width / 100;
  probe.remove();
  return px || 1;
}

export class Reveal {
  constructor(section) {
    this.items = [...section.querySelectorAll('[data-reveal]')];
    this.reset();
  }

  reset() {
    gsap.killTweensOf(this.items);
    gsap.set(this.items, { opacity: 0, y: reduced ? 0 : uPx() * 22 });
  }

  enter(delay = 0.22) {
    gsap.killTweensOf(this.items);
    gsap.to(this.items, {
      opacity: 1,
      y: 0,
      duration: reduced ? 0.3 : 0.7,
      ease: 'power3.out',
      stagger: 0.055,
      delay,
      clearProps: 'transform',
    });
  }
}
