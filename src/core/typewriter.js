// Effet "machine à écrire" : chaque caractère apparaît / disparaît avec un
// court fondu, comme sur les écrans de la vidéo de référence.
//
// Un texte est une liste de "runs" : [['KA', 400], ['6919', 700], ['EN', 400]]

function flatten(runs) {
  const out = [];
  for (const [text, weight] of runs) {
    for (const ch of text) out.push({ ch, w: weight });
  }
  return out;
}

export class Typewriter {
  constructor({ typeInterval = 0.034, eraseInterval = 0.028, fade = 0.07, onChange } = {}) {
    this.typeInterval = typeInterval;
    this.eraseInterval = eraseInterval;
    this.fade = fade;
    this.onChange = onChange;
    this.chars = []; // caractères visibles : { ch, w, a, state }
    this.ghosts = []; // caractères en cours d'effacement quand la frappe reprend
    this.queue = [];
    this.timer = 0;
    this.text = '';
  }

  /** Affiche un nouveau texte (efface l'ancien caractère par caractère puis tape le nouveau). */
  set(runs, { immediate = false } = {}) {
    const target = flatten(runs);
    this.text = target.map((c) => c.ch).join('');
    if (immediate) {
      this.chars = target.map((c) => ({ ...c, a: 1, state: 'in' }));
      this.ghosts = [];
      this.queue = [];
      this.timer = 0;
      this.onChange?.(this);
      return;
    }
    this.queue = [];
    const visible = this.chars.filter((c) => c.state !== 'out').length;
    for (let i = 0; i < visible; i++) this.queue.push({ op: 'erase' });
    for (const c of target) this.queue.push({ op: 'type', c });
    if (this.timer < 0) this.timer = 0;
  }

  clear({ immediate = false } = {}) {
    this.set([], { immediate });
  }

  get busy() {
    return this.queue.length > 0;
  }

  update(dt) {
    let changed = false;

    for (const c of this.chars) {
      if (c.state === 'in' && c.a < 1) {
        c.a = Math.min(1, c.a + dt / this.fade);
        changed = true;
      } else if (c.state === 'out' && c.a > 0) {
        c.a = Math.max(0, c.a - dt / this.fade);
        changed = true;
      }
    }
    for (const g of this.ghosts) {
      if (g.a > 0) {
        g.a = Math.max(0, g.a - dt / this.fade);
        changed = true;
      }
    }
    if (this.ghosts.length && this.ghosts.every((g) => g.a <= 0)) {
      this.ghosts = [];
      changed = true;
    }
    while (this.chars.length && this.chars[this.chars.length - 1].state === 'out' && this.chars[this.chars.length - 1].a <= 0) {
      this.chars.pop();
      changed = true;
    }

    if (this.queue.length) {
      this.timer -= dt;
      while (this.timer <= 0 && this.queue.length) {
        const job = this.queue.shift();
        if (job.op === 'erase') {
          for (let i = this.chars.length - 1; i >= 0; i--) {
            if (this.chars[i].state !== 'out') {
              this.chars[i].state = 'out';
              break;
            }
          }
          this.timer += this.eraseInterval;
        } else {
          // les caractères encore en fondu de sortie deviennent des "fantômes"
          // superposés au début de la ligne (comme dans la vidéo)
          const fading = this.chars.filter((c) => c.state === 'out');
          if (fading.length) {
            this.ghosts.push(...fading);
            this.chars = this.chars.filter((c) => c.state !== 'out');
          }
          this.chars.push({ ...job.c, a: 0, state: 'in' });
          this.timer += this.typeInterval;
        }
        changed = true;
      }
    }

    if (changed) this.onChange?.(this);
  }
}
