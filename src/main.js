import '@fontsource/poppins/latin-800.css';
import '@fontsource/open-sans/latin-400.css';
import '@fontsource/open-sans/latin-600.css';
import '@fontsource/open-sans/latin-700.css';
import '@fontsource/roboto/latin-400.css';
import '@fontsource/montserrat/latin-300.css';
import '@fontsource/montserrat/latin-400.css';
import '@fontsource/montserrat/latin-700.css';
import './styles/main.css';
import './styles/pages.css';

import gsap from 'gsap';
import { Loader } from './ui/loader.js';
import { Sections } from './ui/sections.js';
import { Cursor } from './ui/cursor.js';
import { HeroUI } from './ui/hero.js';
import { UhfSection } from './ui/uhf.js';
import { VideoScene } from './ui/videoScene.js';
import { BubbleOverlay } from './ui/bubble.js';
import { Reveal } from './ui/reveal.js';
import { SignIn } from './ui/signin.js';
import { theme, initTheme, setTheme, onThemeChange } from './core/theme.js';

const params = new URLSearchParams(location.search);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Taille d'un "pixel maquette" (u) en pixels CSS, identique au calcul CSS. */
function unit(w, h) {
  return w / h < 1 ? w / 430 : Math.min(w / 1280, h / 776);
}

function setViewportVars() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const root = document.documentElement.style;
  root.setProperty('--vw', `${w}px`);
  root.setProperty('--vh', `${h}px`);
  return { w, h };
}

async function loadFonts() {
  const faces = [
    '800 80px Poppins',
    '400 16px "Open Sans"',
    '600 16px "Open Sans"',
    '700 16px "Open Sans"',
    '400 16px Roboto',
    '300 16px Montserrat',
    '400 16px Montserrat',
    '700 16px Montserrat',
  ];
  try {
    await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f))), wait(4000)]);
  } catch {
    /* polices de secours */
  }
}

// la 3D est une vidéo par variante : en mode nuit la scène est teal (comme la vidéo d'origine)
const variantOf = (t) => (t.dark ? 'dark' : t.accent);

async function boot() {
  // outil de développement : export des scènes Three.js vers Blender
  if (import.meta.env.DEV && params.has('export')) {
    document.getElementById('loader')?.remove();
    document.body.classList.remove('is-loading');
    const { runExport } = await import('./dev/exportBoot.js');
    await runExport(params.get('export')); // ?export (tout) ou ?export=hero|gate|loader
    return;
  }

  initTheme();
  setViewportVars();
  const cursor = new Cursor(document.getElementById('cursor'));
  const skipIntro = params.has('nointro') || params.has('section');
  const loaderEl = document.getElementById('loader');
  const loader = skipIntro ? null : new Loader(loaderEl);
  if (skipIntro) loaderEl.remove();

  // ---- scènes 3D (vidéos Blender)
  const heroEl = document.getElementById('scene-hero');
  const heroScene = new VideoScene(heroEl, 'hero');
  const gateScene = new VideoScene(document.getElementById('scene-gate'), 'gate');
  heroScene.setVariant(variantOf(theme));
  gateScene.setVariant(variantOf(theme));
  const bubble = new BubbleOverlay(document.getElementById('bubble'));
  const heroUI = new HeroUI();

  // ---- chargement : polices + vidéo du hero prête à être lue
  await Promise.all([
    loadFonts().then(() => loader?.setProgress(0.35)),
    Promise.race([heroScene.ready(), wait(12000)]).then(() => loader?.setProgress(0.85)),
  ]);
  gateScene.ready();
  loader?.setProgress(1);
  // le texte est découpé en lignes une fois les polices chargées (largeurs exactes)
  const uhf = new UhfSection(document.querySelector('.uhf'));
  document.fonts?.ready.then(() => uhf.resize(true));

  // ---- sections
  const sectionsEl = document.getElementById('sections');
  let introOffset = 0;
  // pages du menu (Features, Resources, Enterprise, Pricing) : apparition en cascade
  const sectionEls = [...sectionsEl.querySelectorAll('.section')];
  const reveals = sectionEls.map((el, i) => (i >= 2 ? new Reveal(el) : null));
  const navLinks = [...document.querySelectorAll('.nav__links [data-goto]')];
  const setActiveNav = (i) => navLinks.forEach((a) => a.classList.toggle('is-active', Number(a.dataset.goto) === i));
  const sections = new Sections({
    container: sectionsEl,
    count: sectionEls.length,
    onStart(next) {
      document.documentElement.classList.toggle('is-last', next === sections.count - 1);
      setActiveNav(next);
      if (next === 1) {
        gateScene.play(true);
        uhf.enter();
      }
      if (next === 0) {
        heroScene.play(true); // la boucle du parking reprend au début (comme la vidéo)
        bubble.reset();
      }
      reveals[next]?.enter();
    },
    onComplete(next, prev) {
      if (next !== 0) heroScene.pause();
      if (next !== 1) gateScene.pause();
      if (prev === 1 && next !== 1) uhf.reset();
      if (prev !== next) reveals[prev]?.reset();
    },
  });

  // connexion (démonstration) : le défilement des sections est suspendu pendant l'ouverture
  const signin = new SignIn(document.getElementById('signin'), {
    onOpen: () => (sections.enabled = false),
    onClose: () => (sections.enabled = true),
  });
  document.querySelectorAll('[data-signin]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.preventDefault();
      signin.open();
    }),
  );

  // navigation
  document.querySelectorAll('[data-goto]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.preventDefault();
      if (signin.isOpen) signin.close();
      sections.goTo(parseInt(el.dataset.goto, 10));
    }),
  );
  document.getElementById('scrollhint').addEventListener('click', () => {
    if (sections.index >= sections.count - 1) sections.goTo(0);
    else sections.next();
  });

  // thème : couleur d'accent + mode nuit
  document.querySelectorAll('.swatch').forEach((el) =>
    el.addEventListener('click', () => {
      if (el.hasAttribute('data-dark')) setTheme(theme.dark ? { dark: false } : { dark: true, accent: 'teal' });
      else setTheme({ accent: el.dataset.accent, dark: false });
    }),
  );
  onThemeChange((t) => {
    heroScene.setVariant(variantOf(t));
    gateScene.setVariant(variantOf(t));
  });

  // redimensionnement
  let uhfResizeTimer = 0;
  const resize = () => {
    const { h } = setViewportVars();
    sections.resize(h);
    clearTimeout(uhfResizeTimer);
    uhfResizeTimer = setTimeout(() => uhf.resize(), 120);
  };
  window.addEventListener('resize', resize);
  resize();

  // ---- boucle d'animation (interface uniquement : la 3D est une vidéo)
  let last = performance.now();
  let lastFrame = 0;
  const frame = (now) => {
    lastFrame = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    sections.update(dt);
    heroEl.style.transform = introOffset ? `translate3d(0, ${introOffset.toFixed(2)}px, 0)` : '';
    bubble.update(heroScene.time, dt);
    cursor.update(dt);
  };
  const loop = (now) => {
    frame(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  if (import.meta.env.DEV) {
    // horloge de secours si l'onglet est masqué (tests automatisés)
    setInterval(() => {
      if (performance.now() - lastFrame > 150) {
        gsap.ticker.tick();
        frame(performance.now());
      }
    }, 33);
  }

  if (skipIntro) {
    document.body.classList.remove('is-loading');
    sections.enabled = true;
    heroScene.play(true);
    const start = parseInt(params.get('section'), 10);
    if (start > 0) {
      sections.goTo(start);
      sections.update(10);
    }
  } else {
    // ---- intro : compteur à 100 %, puis rideau + glissement de la scène
    heroUI.prepare();
    await loader.finished();
    await wait(240);
    document.body.classList.remove('is-loading');
    heroScene.play(true); // l'image 0 de la vidéo = début du rideau
    const u = unit(window.innerWidth, window.innerHeight);
    const slide = { p: 0 };
    const wipe = { p: 0 };
    introOffset = 248 * u;
    // glissement de la scène 3D : courbe (1 - p)^2.3 mesurée sur la vidéo
    const intro = gsap.timeline();
    intro.to(slide, { p: 1, duration: 1.0, ease: 'none', onUpdate: () => (introOffset = 248 * u * Math.pow(1 - slide.p, 2.3)) }, 0);
    intro.to(wipe, { p: 1, duration: 0.75, ease: 'none', onUpdate: () => loader.wipe(wipe.p) }, 0);
    intro.add(heroUI.playIntro(), 0);
    await new Promise((r) => intro.eventCallback('onComplete', r));
    introOffset = 0;
    loader.dispose();
    sections.enabled = true;
  }

  // les autres couleurs se chargent en arrière-plan (changement instantané)
  setTimeout(() => {
    heroScene.preloadOthers();
    gateScene.preloadOthers();
  }, 1500);

  if (import.meta.env.DEV) window.__app = { sections, heroScene, gateScene, bubble, uhf, setTheme };
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('loader')?.remove();
  document.body.classList.remove('is-loading');
});
