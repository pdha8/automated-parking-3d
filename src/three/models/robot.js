import * as THREE from 'three';
import { MAT } from '../materials.js';
import { cyl, sphere, mesh } from '../geo.js';
import { VisorTexture } from '../textures.js';

// Petit robot flottant : tête ovoïde blanche, visière noire avec yeux bleus,
// oreille sur le côté et antenne. Il regarde vers +Z.

const HEAD_SCALE = new THREE.Vector3(1, 0.78, 0.92);
const BOTTOM_FLAT = 0.74; // dessous de la tête plus plat que le dessus

/** Aplatit la moitié basse d'une sphère (forme de la tête du robot). */
function flattenBottom(g) {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0) pos.setY(i, y * BOTTOM_FLAT);
  }
  g.computeVertexNormals();
  return g;
}

let shellGeo = null;

export function createRobot() {
  const root = new THREE.Group(); // position + flottement
  root.name = 'robot';
  const head = new THREE.Group(); // orientation (regard)
  root.add(head);

  shellGeo ||= flattenBottom(new THREE.SphereGeometry(0.5, 64, 40));
  const shell = mesh(shellGeo, MAT.robot, head);
  shell.scale.copy(HEAD_SCALE);

  // visière : calotte sphérique à l'avant, texture avec transparence pour les coins arrondis
  const visorTex = new VisorTexture();
  const visorGeo = flattenBottom(new THREE.SphereGeometry(0.5, 64, 40, Math.PI / 2 - 1.0, 2.0, Math.PI / 2 - 0.7, 1.36));
  const visorMat = new THREE.MeshPhysicalMaterial({
    name: 'visor',
    map: visorTex.texture,
    emissiveMap: visorTex.texture,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.9,
    roughness: 0.12,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    transparent: true,
    alphaTest: 0.02,
  });
  const visor = mesh(visorGeo, visorMat, head, 0, 0, 0, { cast: false });
  visor.scale.copy(HEAD_SCALE).multiplyScalar(1.018);
  visor.renderOrder = 2;

  // oreille (côté gauche du robot)
  const ear = new THREE.Group();
  ear.position.set(-0.49, 0.02, -0.02);
  head.add(ear);
  mesh(cyl(0.17, 0.17, 0.1, 32, 'x'), MAT.robot, ear);
  mesh(cyl(0.11, 0.11, 0.13, 28, 'x'), MAT.robotDetail, ear, -0.005, 0, 0);
  // antenne
  const antenna = new THREE.Group();
  antenna.position.set(-0.47, 0.1, -0.08);
  antenna.rotation.z = 0.12;
  antenna.rotation.x = -0.12;
  head.add(antenna);
  mesh(cyl(0.011, 0.013, 0.6, 8), MAT.robot, antenna, 0, 0.3, 0);
  mesh(sphere(0.02, 10, 8), MAT.robot, antenna, 0, 0.6, 0);

  // ancre de la bulle (au-dessus à droite de la tête)
  const bubbleAnchor = new THREE.Object3D();
  bubbleAnchor.position.set(0.42, 0.42, 0);
  root.add(bubbleAnchor);

  const state = { blinkT: 2 + Math.random() * 2, blink: 0 };

  return {
    group: root,
    head,
    visor,
    visorTex,
    bubbleAnchor,
    /** Direction du regard + clignement (imposé, ou automatique si blink est absent). */
    updateEyes(dt, lookX = 0, lookY = 0, blink = null) {
      if (blink === null) {
        state.blinkT -= dt;
        if (state.blinkT < 0) {
          state.blink += dt / 0.09;
          if (state.blink >= 2) {
            state.blink = 0;
            state.blinkT = 2.5 + Math.random() * 3;
          }
        }
        blink = state.blink <= 1 ? state.blink : 2 - state.blink;
      }
      visorTex.setEyes(Math.max(0, blink), lookX, lookY);
    },
  };
}
