import * as THREE from 'three';
import { ACCENTS } from '../core/theme.js';

// Matériaux partagés par toutes les scènes. Les matériaux "accent" changent
// de couleur avec le sélecteur "Color" (teal / bleu / vert).

const accentMaterials = [];
const accentFrom = new THREE.Color(ACCENTS.teal);
const accentTo = new THREE.Color(ACCENTS.teal);
const accentNow = new THREE.Color(ACCENTS.teal);
let accentT = 1;
let accentDuration = 0.3;

export const MAT = {};

// "Nuit" : 0 = mode clair, 1 = mode sombre (interpolé)
export const night = { value: 0, target: 0 };

function phys(params) {
  return new THREE.MeshPhysicalMaterial(params);
}

function accent(params = {}) {
  const m = phys({ color: ACCENTS.teal, metalness: 0, ...params });
  accentMaterials.push(m);
  return m;
}

export function createMaterials() {
  if (MAT.ready) return MAT;

  // peinture carrosserie (vernis brillant, aspect jouet)
  MAT.paint = accent({ roughness: 0.32, clearcoat: 0.85, clearcoatRoughness: 0.14 });
  // éléments du parking : bornes, plots, panneaux
  MAT.accent = accent({ roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.3 });

  MAT.whitePaint = phys({ color: '#e2e5e9', roughness: 0.3, clearcoat: 0.85, clearcoatRoughness: 0.14 });
  MAT.roof = phys({ color: '#eceef0', roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.16 });
  MAT.white = phys({ color: '#f3f4f5', roughness: 0.34, clearcoat: 0.45, clearcoatRoughness: 0.24 });
  MAT.robot = phys({ color: '#ffffff', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  MAT.robotDetail = phys({ color: '#e4e6e8', roughness: 0.3, clearcoat: 0.6 });
  MAT.glass = phys({ color: '#18191b', roughness: 0.1, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.04 });
  MAT.rubber = new THREE.MeshStandardMaterial({ color: '#202123', roughness: 0.88 });
  MAT.rim = new THREE.MeshStandardMaterial({ color: '#e1e4e7', roughness: 0.26, metalness: 0.7 });
  MAT.chrome = new THREE.MeshStandardMaterial({ color: '#eceef0', roughness: 0.16, metalness: 0.85 });
  MAT.red = phys({ color: '#c8272a', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 });
  MAT.tail = new THREE.MeshStandardMaterial({
    color: '#c21e25',
    roughness: 0.28,
    emissive: new THREE.Color('#ff2a2a'),
    emissiveIntensity: 0,
  });
  MAT.lamp = new THREE.MeshStandardMaterial({
    color: '#f3f3ef',
    roughness: 0.12,
    metalness: 0.25,
    emissive: new THREE.Color('#fff3d6'),
    emissiveIntensity: 0,
  });
  // voitures garées : feux éteints
  MAT.lampOff = new THREE.MeshStandardMaterial({ color: '#f3f3ef', roughness: 0.12, metalness: 0.25 });
  MAT.tailOff = new THREE.MeshStandardMaterial({ color: '#c21e25', roughness: 0.28 });
  MAT.dark = new THREE.MeshStandardMaterial({ color: '#1d1e20', roughness: 0.55 });
  MAT.slot = new THREE.MeshStandardMaterial({ color: '#0d0e0f', roughness: 0.75 });
  MAT.paper = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, side: THREE.DoubleSide });

  // noms explicites : ils servent à retrouver les matériaux dans Blender
  for (const [key, m] of Object.entries(MAT)) if (m && m.isMaterial) m.name = key;

  MAT.ready = true;
  return MAT;
}

/** Change la couleur d'accent de tous les matériaux concernés (petite transition). */
export function setAccentColor(hex, duration = 0.3) {
  accentFrom.copy(accentNow);
  accentTo.set(hex);
  accentDuration = Math.max(0.0001, duration);
  accentT = duration <= 0 ? 1 : 0;
  if (accentT >= 1) {
    accentNow.copy(accentTo);
    for (const m of accentMaterials) m.color.copy(accentNow);
  }
}

const accentEff = new THREE.Color();
let lastNight = -1;

export function updateMaterials(dt) {
  let dirty = false;
  if (accentT < 1) {
    accentT = Math.min(1, accentT + dt / accentDuration);
    const k = accentT * accentT * (3 - 2 * accentT);
    accentNow.copy(accentFrom).lerp(accentTo, k);
    dirty = true;
  }

  // transition jour / nuit
  if (night.value !== night.target) {
    const speed = dt / 0.28;
    night.value = night.target > night.value ? Math.min(night.target, night.value + speed) : Math.max(night.target, night.value - speed);
  }
  if (night.value !== lastNight) {
    lastNight = night.value;
    dirty = true;
  }
  // la nuit, la couleur d'accent paraît plus sombre et moins saturée (comme dans la vidéo)
  if (dirty) {
    accentEff.copy(accentNow).multiplyScalar(1 - 0.58 * night.value);
    for (const m of accentMaterials) m.color.copy(accentEff);
  }
  MAT.tail.emissiveIntensity = 0.15 + night.value * 1.6;
  MAT.lamp.emissiveIntensity = night.value * 2.2;
}

export function setNight(on, instant = false) {
  night.target = on ? 1 : 0;
  if (instant) night.value = night.target;
}
