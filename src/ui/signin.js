// Fenêtre « Sign in » (démonstration) : aucune donnée n'est envoyée ni conservée.

export class SignIn {
  constructor(root, { onOpen, onClose } = {}) {
    this.root = root;
    this.form = root.querySelector('form');
    this.msg = root.querySelector('.signin__msg');
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.isOpen = false;
    this._last = null;

    root.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => this.close()));
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = this.form.elements.email.value.trim();
      this.msg.textContent = email
        ? 'Demo only: sign-in is not connected yet. Nothing was sent.'
        : 'Enter your email to continue.';
    });
    document.addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape') this.close();
    });
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this._last = document.activeElement;
    this.msg.textContent = '';
    this.root.hidden = false;
    // laisse le navigateur afficher l'état initial avant l'animation d'ouverture
    requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.add('is-open')));
    setTimeout(() => this.form.elements.email.focus({ preventScroll: true }), 60);
    this.onOpen?.();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('is-open');
    this.form.reset();
    setTimeout(() => {
      if (!this.isOpen) this.root.hidden = true;
    }, 320);
    this._last?.focus?.({ preventScroll: true });
    this.onClose?.();
  }
}
