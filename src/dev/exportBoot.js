// Outil de développement : reconstruit les scènes Three.js et lance l'export
// vers Blender (http://localhost:5173/?export). Non inclus dans le site final.

import { Stage } from '../three/stage.js';
import { createMaterials } from '../three/materials.js';
import { HeroScene } from '../three/heroScene.js';
import { GateScene } from '../three/gateScene.js';
import { exportAll } from './exporter.js';

export async function runExport(only = '') {
  createMaterials();
  const canvas = document.createElement('canvas');
  canvas.className = 'webgl';
  document.body.prepend(canvas);
  const stage = new Stage(canvas);
  const hero = new HeroScene(stage);
  const gate = new GateScene(stage);
  stage.addView(hero);
  stage.addView(gate);
  stage.resize(window.innerWidth, window.innerHeight);
  await exportAll({ hero, gate }, only);
}
