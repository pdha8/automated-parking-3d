import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Un seul renderer WebGL (fond transparent : le fond de page CSS fait office
// de sol) qui dessine plusieurs "vues" — une par section — chacune décalée
// verticalement comme le contenu HTML qu'elle accompagne.

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    const r = this.renderer;
    // appareils modestes / petits écrans : qualité allégée pour rester fluide
    this.lowPower = window.matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lowPower ? 1.6 : 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.setClearColor(0x000000, 0);
    r.autoClear = false;

    const pmrem = new THREE.PMREMGenerator(r);
    const room = new RoomEnvironment();
    this.envMap = pmrem.fromScene(room, 0.04).texture;
    room.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    pmrem.dispose();

    this.views = [];
    this.width = 1;
    this.height = 1;
  }

  addView(view) {
    this.views.push(view);
    return view;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    for (const v of this.views) v.resize?.(width, height);
  }

  isOnScreen(view) {
    return view.enabled && view.top < this.height && view.top + this.height > 0;
  }

  async compile() {
    const r = this.renderer;
    for (const v of this.views) {
      if (r.compileAsync) await r.compileAsync(v.scene, v.camera);
      else r.compile(v.scene, v.camera);
    }
  }

  render() {
    const r = this.renderer;
    r.setRenderTarget(null);
    r.setScissorTest(false);
    r.setViewport(0, 0, this.width, this.height);
    r.clear(true, true, true);

    for (const v of this.views) {
      if (!this.isOnScreen(v)) continue;
      v.beforeRender?.(r);
      r.setRenderTarget(null);
      const y = this.height - (v.top + this.height);
      r.setViewport(0, y, this.width, this.height);
      r.setScissor(0, Math.max(0, y), this.width, Math.min(this.height, this.height + y));
      r.setScissorTest(true);
      r.render(v.scene, v.camera);
      r.setScissorTest(false);
    }
  }
}
