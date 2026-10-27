// Outil de développement : reconstruit les scènes Three.js et lance l'export
// vers Blender (http://localhost:5173/?export). Non inclus dans le site final.

import '@fontsource/montserrat/latin-500.css'; // plaques d'immatriculation
import { Stage } from '../three/stage.js';
import { createMaterials } from '../three/materials.js';
import { HeroScene } from '../three/heroScene.js';
import { GateScene } from '../three/gateScene.js';
import { exportAll } from './exporter.js';

export async function runExport(only = '') {
  // les textes des écrans et des plaques sont dessinés dans des canvas : toutes
  // les graisses de Montserrat doivent être chargées avant la première image
  const weights = [300, 400, 500, 700];
  await Promise.all(weights.map((w) => document.fonts.load(`${w} 40px Montserrat`)));
  const missing = weights.filter((w) => !document.fonts.check(`${w} 40px Montserrat`));
  if (missing.length) throw new Error(`polices manquantes : Montserrat ${missing.join(', ')}`);
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
