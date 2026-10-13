import * as THREE from 'three';
import { MAT } from '../materials.js';
import { rbox, cyl, sphere, tireGeometry, mesh } from '../geo.js';
import { plateTexture, headlightPoolTexture } from '../textures.js';
import { extrudeBody, flatShape, halfWidthAt, extractCap } from './carBody.js';

// Voitures "jouet" : carrosserie extrudée à partir d'un profil latéral
// arrondi (capot plongeant, pare-brise incliné), toit blanc bombé.
// Repère local : avant = +Z, haut = +Y.

export const WHEEL_R = 0.145;
const WHEEL_W = 0.115;
export const FX_LAYER = 1; // calque des effets (faisceaux, halos) : exclus des ombres

const S = 0.054; // épaisseur d'arrondi ajoutée par le biseau d'extrusion

// Profils intérieurs (le biseau ajoute S tout autour). Points [z, y, rayon].
const SPECS = {
  mini: {
    length: 1.62,
    width: 0.8,
    profile: [
      [-0.756, 0.172, 0.03],
      [0.756, 0.172, 0.03],
      [0.756, 0.41, 0.09],
      [0.7, 0.452, 0.07],
      [0.34, 0.468, 0.05],
      [0.15, 0.69, 0.07],
      [-0.6, 0.7, 0.07],
      [-0.7, 0.48, 0.05],
      [-0.756, 0.45, 0.06],
    ],
    belt: 0.5,
    top: 0.755,
    taper: 0.24,
    windshield: [[0.34, 0.468], [0.15, 0.69]],
    rearGlass: [[-0.6, 0.7], [-0.7, 0.48]],
    sideFront: [[0.3, 0.527], [0.175, 0.688], [-0.13, 0.688], [-0.13, 0.527]],
    sideRear: [[-0.2, 0.527], [-0.2, 0.688], [-0.575, 0.688], [-0.66, 0.527]],
    roof: { cut: 0.702 },
    wheelZ: 0.53,
    trackX: 0.37,
    lampY: 0.39,
    lampX: 0.25,
    lampR: 0.064,
    tailY: 0.37,
    bumperY: 0.165,
    mirror: [0.32, 0.53],
  },
  sedan: {
    length: 1.8,
    width: 0.82,
    profile: [
      [-0.846, 0.168, 0.03],
      [0.846, 0.168, 0.03],
      [0.846, 0.34, 0.07],
      [0.78, 0.372, 0.05],
      [0.36, 0.382, 0.05],
      [0.17, 0.6, 0.07],
      [-0.3, 0.606, 0.07],
      [-0.47, 0.392, 0.05],
      [-0.8, 0.378, 0.05],
      [-0.846, 0.33, 0.05],
    ],
    belt: 0.425,
    top: 0.66,
    taper: 0.15,
    windshield: [[0.36, 0.382], [0.17, 0.6]],
    rearGlass: [[-0.3, 0.606], [-0.47, 0.392]],
    sideFront: [[0.32, 0.435], [0.18, 0.612], [-0.05, 0.612], [-0.05, 0.435]],
    sideRear: [[-0.11, 0.435], [-0.11, 0.612], [-0.29, 0.612], [-0.43, 0.435]],
    roof: null,
    wheelZ: 0.6,
    trackX: 0.38,
    lampY: 0.32,
    lampX: 0.27,
    lampR: 0.058,
    tailY: 0.31,
    bumperY: 0.16,
    mirror: [0.34, 0.43],
  },
  hatch: {
    length: 1.66,
    width: 0.82,
    profile: [
      [-0.776, 0.172, 0.03],
      [0.776, 0.172, 0.03],
      [0.776, 0.36, 0.09],
      [0.66, 0.425, 0.07],
      [0.36, 0.452, 0.05],
      [0.1, 0.682, 0.07],
      [-0.5, 0.684, 0.08],
      [-0.73, 0.47, 0.06],
      [-0.776, 0.4, 0.06],
    ],
    belt: 0.48,
    top: 0.738,
    taper: 0.16,
    windshield: [[0.36, 0.452], [0.1, 0.682]],
    rearGlass: [[-0.5, 0.684], [-0.73, 0.47]],
    sideFront: [[0.31, 0.505], [0.12, 0.69], [-0.12, 0.69], [-0.12, 0.505]],
    sideRear: [[-0.19, 0.505], [-0.19, 0.69], [-0.47, 0.69], [-0.66, 0.505]],
    roof: null,
    wheelZ: 0.55,
    trackX: 0.38,
    lampY: 0.36,
    lampX: 0.26,
    lampR: 0.068,
    tailY: 0.36,
    bumperY: 0.165,
    mirror: [0.33, 0.51],
  },
};

let beamMaterial = null;
let poolTexture = null;

function getBeamMaterial() {
  if (beamMaterial) return beamMaterial;
  beamMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uIntensity: { value: 0 },
      uColor: { value: new THREE.Color('#fff6e6') },
      uLength: { value: 2.0 },
    },
    vertexShader: /* glsl */ `
      uniform float uLength;
      varying float vAlong;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying float vWorldY;
      void main() {
        vAlong = clamp(position.z / uLength, 0.0, 1.0);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldY = wp.y;
        vec4 mv = viewMatrix * wp;
        vViewPos = mv.xyz;
        vNormalV = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      uniform vec3 uColor;
      varying float vAlong;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying float vWorldY;
      void main() {
        if (vWorldY < 0.0) discard; // rien sous le sol
        float facing = abs(dot(normalize(vNormalV), normalize(-vViewPos)));
        float edge = pow(facing, 1.15);
        float fall = pow(1.0 - vAlong, 1.35) * smoothstep(0.0, 0.06, vAlong);
        float ground = smoothstep(0.0, 0.12, vWorldY);
        float a = uIntensity * edge * fall * ground;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  return beamMaterial;
}

let beamGeometry = null;
function getBeamGeometry() {
  if (beamGeometry) return beamGeometry;
  const g = new THREE.ConeGeometry(0.62, 2.0, 40, 8, true);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, 1.0);
  beamGeometry = g;
  return g;
}

export function setBeamIntensity(v) {
  getBeamMaterial().uniforms.uIntensity.value = v;
}

function buildWheel() {
  const wheel = new THREE.Group();
  mesh(tireGeometry(WHEEL_R, WHEEL_W), MAT.rubber, wheel);
  mesh(cyl(WHEEL_R * 0.6, WHEEL_R * 0.6, WHEEL_W * 0.84, 24, 'x'), MAT.rim, wheel);
  mesh(cyl(WHEEL_R * 0.42, WHEEL_R * 0.42, WHEEL_W * 0.9, 20, 'x'), MAT.dark, wheel, 0, 0, 0, { cast: false });
  mesh(cyl(WHEEL_R * 0.3, WHEEL_R * 0.36, WHEEL_W * 0.96, 18, 'x'), MAT.rim, wheel, 0, 0, 0, { cast: false });
  mesh(cyl(WHEEL_R * 0.1, WHEEL_R * 0.12, WHEEL_W * 1.02, 12, 'x'), MAT.chrome, wheel, 0, 0, 0, { cast: false });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const s = mesh(rbox(WHEEL_W * 0.94, 0.024, 0.04, 0.008, 2), MAT.rim, wheel, 0, Math.cos(a) * WHEEL_R * 0.36, Math.sin(a) * WHEEL_R * 0.36, { cast: false });
    s.rotation.x = -a;
  }
  return wheel;
}

// normale extérieure d'un segment [a -> b] du profil (z, y), parcouru dans le sens du profil
function segNormal([a, b]) {
  const dz = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dz, dy);
  return { nz: dy / len, ny: -dz / len };
}

/** Ligne extérieure (surface) d'un segment de profil intérieur, décalée de S. */
function outerLine(seg) {
  const [a, b] = seg;
  const { nz, ny } = segNormal(seg);
  const off = S + 0.004;
  return [
    [a[0] + nz * off, a[1] + ny * off],
    [b[0] + nz * off, b[1] + ny * off],
  ];
}

/** Inverse l'ordre des sommets de chaque triangle (géométrie non indexée). */
function flipWinding(g) {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 3) {
    const x = pos.getX(i + 1);
    const y = pos.getY(i + 1);
    const z = pos.getZ(i + 1);
    pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
    pos.setXYZ(i + 2, x, y, z);
  }
}

/** Vitre posée sur une face inclinée avant/arrière (suit le resserrement). */
function slopeGlass(spec, line, margin = 0.06) {
  const [p0, p1] = line;
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const { nz, ny } = segNormal(line);
  const inset = 0.035;
  const g = flatShape(
    [
      [-0.5, inset, 0.02],
      [0.5, inset, 0.02],
      [0.5, len - inset, 0.02],
      [-0.5, len - inset, 0.02],
    ],
    0.012,
    0.003,
  );
  const pos = g.attributes.position;
  const dz = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);
    const v = pos.getY(i);
    const w = pos.getZ(i);
    const t = v / len;
    const y = p0[1] + dy * t;
    const z = p0[0] + dz * t;
    const hw = halfWidthAt(y, spec) - margin;
    pos.setXYZ(i, u * hw * 2, y + w * ny, z + w * nz);
  }
  g.computeVertexNormals();
  return g;
}

/** Vitre latérale : forme plate plaquée sur le flanc resserré. */
function sideGlass(spec, pts, side) {
  const g = flatShape(pts.map(([z, y]) => [z, y, 0.025]), 0.01, 0.003);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getX(i);
    const y = pos.getY(i);
    const w = pos.getZ(i);
    const x = side * (halfWidthAt(y, spec) + 0.004 + w);
    pos.setXYZ(i, x, y, z);
  }
  if (side > 0) flipWinding(g); // la projection côté +X est une symétrie
  g.computeVertexNormals();
  return g;
}

/**
 * @param {object} o
 * @param {'mini'|'sedan'|'hatch'} o.style
 * @param {THREE.Material} o.paint  peinture
 * @param {THREE.Material} o.roof   toit (mini)
 * @param {string} o.plate         immatriculation
 * @param {boolean} o.active       voiture animée (phares fonctionnels)
 */
export function createCar({ style = 'mini', paint = MAT.paint, roof = MAT.roof, plate = 'KA6919EN', active = true } = {}) {
  const spec = SPECS[style];
  const L = spec.length;
  const W = spec.width;
  const car = new THREE.Group();
  car.name = `car-${style}`;
  const body = new THREE.Group();
  car.add(body);

  const lamp = active ? MAT.lamp : MAT.lampOff;
  const tail = active ? MAT.tail : MAT.tailOff;

  // ---- carrosserie (géométries partagées par style)
  spec._bodyGeo ||= extrudeBody({ profile: spec.profile, width: W, bevel: 0.06, belt: spec.belt, top: spec.top, taper: spec.taper });
  mesh(spec._bodyGeo, paint, body);

  // ---- vitres
  spec._glass ||= {
    front: slopeGlass(spec, outerLine(spec.windshield), 0.065),
    rear: slopeGlass(spec, outerLine(spec.rearGlass), 0.07),
    sides: [-1, 1].flatMap((sd) => [sideGlass(spec, spec.sideFront, sd), sideGlass(spec, spec.sideRear, sd)]),
  };
  mesh(spec._glass.front, MAT.glass, body, 0, 0, 0, { cast: false });
  mesh(spec._glass.rear, MAT.glass, body, 0, 0, 0, { cast: false });
  for (const g of spec._glass.sides) mesh(g, MAT.glass, body, 0, 0, 0, { cast: false });

  // ---- toit blanc : calotte qui épouse la carrosserie
  if (spec.roof) {
    spec._roofGeo ||= extractCap(spec._bodyGeo, spec.roof.cut, 0.007);
    mesh(spec._roofGeo, roof, body, 0, 0, 0, { cast: false });
  }

  const zf = L / 2;
  const lr = spec.lampR;
  // ---- phares ronds
  for (const sx of [-1, 1]) {
    const x = sx * spec.lampX;
    mesh(cyl(lr * 1.22, lr * 1.22, 0.04, 24, 'z'), MAT.chrome, body, x, spec.lampY, zf - 0.012, { cast: false });
    const lens = mesh(sphere(lr, 20, 14), lamp, body, x, spec.lampY, zf + 0.004, { cast: false });
    lens.scale.set(1, 1, 0.45);
    mesh(sphere(0.02, 12, 8), MAT.chrome, body, sx * (spec.lampX + 0.1), spec.lampY - 0.08, zf - 0.012, { cast: false });
  }
  // calandre
  mesh(rbox(0.28, 0.07, 0.024, 0.022), MAT.dark, body, 0, spec.lampY - 0.11, zf - 0.006, { cast: false });
  // pare-chocs
  mesh(rbox(W + 0.02, 0.055, 0.085, 0.025), MAT.chrome, body, 0, spec.bumperY, zf - 0.02);
  mesh(rbox(W + 0.02, 0.055, 0.085, 0.025), MAT.chrome, body, 0, spec.bumperY, -zf + 0.02);
  // feux arrière
  for (const sx of [-1, 1]) {
    mesh(rbox(0.065, 0.12, 0.024, 0.015), tail, body, sx * (W / 2 - 0.08), spec.tailY + 0.02, -zf - 0.002, { cast: false });
    mesh(rbox(0.055, 0.045, 0.024, 0.015), tail, body, sx * (W / 2 - 0.07), spec.tailY - 0.1, -zf - 0.002, { cast: false });
  }
  // plaques
  const plateMat = new THREE.MeshStandardMaterial({ map: plateTexture(plate), roughness: 0.5, name: 'plate' });
  const plateGeo = new THREE.PlaneGeometry(0.27, 0.068);
  const rearPlate = mesh(plateGeo, plateMat, body, 0, spec.tailY - 0.07, -zf - 0.008, { cast: false });
  rearPlate.rotation.y = Math.PI;
  mesh(plateGeo, plateMat, body, 0, spec.bumperY + 0.075, zf + 0.012, { cast: false });
  // rétroviseurs + poignées
  for (const sx of [-1, 1]) {
    const [mz, my] = spec.mirror;
    mesh(rbox(0.06, 0.045, 0.075, 0.016), paint, body, sx * (halfWidthAt(my, spec) + 0.025), my + 0.02, mz, { cast: false });
    mesh(rbox(0.016, 0.018, 0.06, 0.006), MAT.chrome, body, sx * (W / 2 + 0.002), spec.belt - 0.05, 0.04, { cast: false });
  }

  // ---- roues
  const wheels = [];
  const steer = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * spec.trackX, WHEEL_R, sz * spec.wheelZ);
    const w = buildWheel();
    pivot.add(w);
    car.add(pivot);
    wheels.push(w);
    if (sz > 0) steer.push(pivot);
  }

  // ---- faisceaux des phares + halo au sol (mode nuit)
  let fx = null;
  if (active) {
    fx = new THREE.Group();
    for (const sx of [-1, 1]) {
      const beam = new THREE.Mesh(getBeamGeometry(), getBeamMaterial());
      beam.position.set(sx * spec.lampX, spec.lampY, zf + 0.02);
      beam.rotation.x = 0.02;
      beam.rotation.y = sx * 0.05;
      beam.layers.set(FX_LAYER);
      beam.renderOrder = 5;
      fx.add(beam);
    }
    poolTexture ||= headlightPoolTexture();
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 2.3),
      new THREE.MeshBasicMaterial({
        map: poolTexture,
        color: '#fff4e2',
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.012, zf + 1.1);
    pool.layers.set(FX_LAYER);
    pool.renderOrder = 4;
    fx.add(pool);
    fx.userData.pool = pool;
    car.add(fx);
  }

  return {
    group: car,
    body,
    wheels,
    steer,
    spec,
    fx,
    plateMat,
    setPlate(text) {
      plateMat.map = plateTexture(text);
      plateMat.needsUpdate = true;
    },
    setNight(v) {
      if (fx) fx.userData.pool.material.opacity = v * 0.5;
    },
  };
}
