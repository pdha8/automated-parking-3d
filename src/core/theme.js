// Etat du thème : couleur d'accent + mode sombre.

export const ACCENTS = {
  teal: '#29bbba',
  blue: '#277bc5',
  green: '#27b938',
};

export const theme = {
  accent: 'teal',
  dark: false,
};

const listeners = new Set();

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function applyToDocument() {
  const root = document.documentElement;
  root.style.setProperty('--accent', ACCENTS[theme.accent]);
  root.classList.toggle('is-dark', theme.dark);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme.dark ? '#151515' : '#d6d4d2');

  document.querySelectorAll('.swatch').forEach((el) => {
    const active = el.hasAttribute('data-dark') ? theme.dark : !theme.dark && el.dataset.accent === theme.accent;
    el.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

export function setTheme(patch) {
  const prev = { ...theme };
  Object.assign(theme, patch);
  if (prev.accent === theme.accent && prev.dark === theme.dark) return;
  applyToDocument();
  listeners.forEach((fn) => fn(theme, prev));
}

export function initTheme() {
  applyToDocument();
}
