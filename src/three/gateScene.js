import * as THREE from 'three';
import { MAT, night } from './materials.js';
import { createCar, setBeamIntensity, FX_LAYER, WHEEL_R } from './models/car.js';
import { createRobot } from './models/robot.js';
import { createMachine, createBoard, createBump, createGateCable } from './models/props.js';
import { ContactShadows } from './contactShadows.js';
import { radialTexture } from './textures.js';
import { Typewriter } from '../core/typewriter.js';
import { damp, dampAngle, lerp, smoothstep, clamp } from '../core/ease.js';
import { plateRuns, blinkAmount, LIGHT, NIGHT } from './heroScene.js';

/* ==========================================================================
   Scène 2 : gros plan sur la borne de sortie ("UHF identification")
   La voiture s'arrête devant le panneau, l'heure de sortie s'affiche, le reçu
   s'imprime, puis elle repart vers la droite par-dessus le ralentisseur.
   ========================================================================== */

const CYCLE = 9; // s
const STOP_X = -0.1;

// voitures qui passent la borne de sortie (la première est celle de la vidéo)
const GATE_CARS = [
  { plate: 'KA6919EN', exit: [['13.12', 700], ['PM(42min)', 300]] },
  { plate: 'KA4108MX', exit: [['13.27', 700], ['PM(55min)', 300]] },
  { plate: 'KA7350RT', exit: [['13.41', 700], ['PM(18min)', 300]] },
  { plate: 'KA1294JD', exit: [['13.58', 700], ['PM(36min)', 300]] },
  { plate: 'KA2637EB', exit: [['14.10', 700], ['PM(47min)', 300]] },
];
const gateCar = (i) => GATE_CARS[((i % GATE_CARS.length) + GATE_CARS.length) % GATE_CARS.length];
const CAR_Z = 1.05;
const BUMP_X = 1.27;

export class GateScene {
  constructor(stage) {
    this.stage = stage;
    const scene = (this.scene = new THREE.Scene());
    scene.environment = stage.envMap;
    scene.environmentIntensity = LIGHT.env;

    // caméra résolue à partir de la vidéo (coins du panneau + roues de la voiture)
    this.camLandscape = {
      fov: 26.8,
      position: new THREE.Vector3(-4.351, 3.302, 10.589),
      rotation: new THREE.Euler(-0.2342, -0.4437, 0, 'YXZ'),
      offsetX: -0.2254,
      offsetY: 0,
    };
    this.camPortrait = {
      fov: 40,
      position: new THREE.Vector3(-4.45, 3.25, 10.95),
      rotation: new THREE.Euler(-0.2342, -0.4437, 0, 'YXZ'),
      offsetX: 0.01,
      offsetY: 0.15,
    };
    this.camera = new THREE.PerspectiveCamera(30, 1280 / 776, 0.3, 80);
    this.camera.layers.enable(FX_LAYER);
    this.top = 0;
    this.enabled = true;

    // lumières (identiques à la scène 1)
    this.hemi = new THREE.HemisphereLight('#ffffff', '#aeaba7', LIGHT.hemi);
    scene.add(this.hemi);
    const key = (this.key = new THREE.DirectionalLight('#ffffff', LIGHT.key));
    key.position.set(-6.5, 10, 4.5);
    key.target.position.set(0.3, 0, 0.4);
    key.castShadow = true;
    key.shadow.mapSize.setScalar(stage.lowPower ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 30 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    scene.add(key, key.target);
    this.fill = new THREE.DirectionalLight('#ffffff', LIGHT.fill);
    this.fill.position.set(6, 5, 8);
    scene.add(this.fill);

    this.floorMat = new THREE.ShadowMaterial({ color: '#3a3530', opacity: 0.16, transparent: true, depthWrite: false });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    this.glowMat = new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 1], [0.4, 0.7], [1, 0]]),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), this.glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0.3, 0.004, 0.6);
    glow.layers.set(FX_LAYER);
    scene.add(glow);

    // portique : panneau + borne + câble
    const gate = new THREE.Group();
    scene.add(gate);
    this.board = createBoard({ width: 1.6, height: 0.46, postHeight: 0.86 });
    this.board.group.position.set(0, 0, 0);
    gate.add(this.board.group);
    this.machine = createMachine({ kind: 'exit' });
    this.machine.group.scale.setScalar(1.15);
    this.machine.group.position.set(0.45, 0, 0.16);
    gate.add(this.machine.group);
    gate.add(createGateCable(this.machine.group.position, 0.78, 1.06, 1.15));

    const bump = createBump(1.7, 7);
    bump.rotation.y = Math.PI / 2 + 0.07;
    bump.position.set(BUMP_X, 0, 1.02);
    scene.add(bump);

    // voiture
    this.car = createCar({ style: 'mini', paint: MAT.paint, roof: MAT.roof, plate: 'KA6919EN', active: true });
    this.car.group.rotation.y = Math.PI / 2; // regarde vers +X
    this.car.group.position.set(STOP_X, 0, CAR_Z);
    scene.add(this.car.group);

    // robot
    this.robot = createRobot();
    this.robot.group.scale.setScalar(0.84);
    this.robot.group.position.set(1.18, 1.06, 0.88);
    this.robot.group.traverse((o) => {
      o.castShadow = false;
      o.layers.set(FX_LAYER);
    });
    scene.add(this.robot.group);

    this.shadows = new ContactShadows(stage.renderer, scene, {
      width: 10,
      depth: 10,
      resolution: stage.lowPower ? 512 : 1024,
      cameraHeight: 1.6,
      blur: 2.0,
      darkness: 1.6,
      opacity: 0.8,
      center: new THREE.Vector3(0.4, 0, 0.6),
      shear: [0.42, 0.16],
    });

    this.tw = new Typewriter({ typeInterval: 0.028, eraseInterval: 0.025, fade: 0.06, onChange: (tw) => this.board.screen.draw(tw) });
    this.sigma = 0;
    this.cycle = 0;
    this.running = false;
    this.loopData = null; // données fixes pour l'export vidéo
    this.time = 0;
    this._desired = null;
    this._prevX = STOP_X;

    this.resize(1280, 776);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    const portrait = width / height < 1;
    const ref = portrait ? this.camPortrait : this.camLandscape;
    const cam = this.camera;
    let fov = ref.fov;
    if (!portrait) {
      const u = Math.min(width / 1280, height / 776);
      fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(ref.fov) / 2) * (height / (776 * u))));
    }
    cam.fov = fov;
    cam.aspect = width / height;
    cam.position.copy(ref.position);
    cam.rotation.copy(ref.rotation);
    // décalage du centre optique pour placer la scène à gauche du texte
    const u = Math.min(width / 1280, height / 776);
    const shiftX = portrait ? ref.offsetX * width : ref.offsetX * 1280 * u;
    const shiftY = portrait ? ref.offsetY * height : ref.offsetY * 776 * u;
    cam.setViewOffset(width, height, -shiftX, -shiftY, width, height);
    cam.updateProjectionMatrix();
  }

  /** Entrée dans la section : la voiture est à la borne, sa plaque est affichée. */
  enter() {
    this.running = true;
    this.sigma = 0;
    this._desired = null;
    this._first = true;
  }

  /** Sortie de la section : l'écran s'efface. */
  leave() {
    this.running = false;
    this.tw.clear();
    this._desired = '[]';
  }

  beforeRender() {
    this.shadows.update();
  }

  update(dt) {
    this.time += dt;
    const n = night.value;
    this.hemi.intensity = lerp(LIGHT.hemi, NIGHT.hemi, n);
    this.key.intensity = lerp(LIGHT.key, NIGHT.key, n);
    this.fill.intensity = lerp(LIGHT.fill, NIGHT.fill, n);
    this.scene.environmentIntensity = lerp(LIGHT.env, NIGHT.env, n);
    this.glowMat.opacity = n * 0.12;
    this.floorMat.opacity = lerp(0.16, 0.3, n);
    this.car.setNight(n);
    setBeamIntensity(n * 1.05);

    if (this.running) {
      this.sigma += dt;
      if (this.sigma >= CYCLE) {
        this.sigma -= CYCLE;
        this.cycle++;
      }
    }
    const s = this.sigma;
    const data = this.loopData || gateCar(this.cycle);

    // ---- voiture : arrêt -> départ vers la droite -> nouvelle voiture depuis la gauche
    // (elle n'est cachée qu'une fois entièrement sortie du cadre : x = 12 à s = 5.4)
    let x;
    if (s < 2.4) x = STOP_X;
    else if (s < 5.4) {
      const k = (s - 2.4) / 2.4;
      x = STOP_X + k * k * k * 6.2;
    } else if (s < 5.6) x = 99; // hors champ
    else {
      const k = clamp((s - 5.6) / (CYCLE - 5.6));
      x = STOP_X - (1 - k) * (1 - k) * (1 - k) * 6.5;
    }
    const nextData = this.loopData || (s >= 5.6 ? gateCar(this.cycle + 1) : data);
    if (this._plate !== nextData.plate) {
      this.car.setPlate(nextData.plate);
      this._plate = nextData.plate;
    }
    const car = this.car;
    car.group.visible = x < 50;
    if (car.group.visible) {
      car.group.position.x = x;
      const dx = x - this._prevX;
      for (const w of car.wheels) w.rotation.x += dx / WHEEL_R;
      // petit "saut" quand les roues passent sur le ralentisseur
      const over = Math.exp(-Math.pow((x + 0.53 - BUMP_X) / 0.12, 2)) * 0.035 + Math.exp(-Math.pow((x - 0.53 - BUMP_X) / 0.12, 2)) * 0.035;
      car.body.position.y = over;
      car.body.rotation.x = damp(car.body.rotation.x, clamp(-(dx / Math.max(dt, 1e-4) - (car._v || 0)) * 0.004, -0.03, 0.03), 6, dt);
      car._v = dx / Math.max(dt, 1e-4);
    }
    this._prevX = x;

    // ---- reçu
    const receipt = smoothstep(1.2, 1.65, s) * (1 - smoothstep(4.6, 4.95, s));
    this.machine.receipt.scale.set(1, Math.max(0.001, receipt), Math.max(0.001, receipt));
    this.machine.receipt.visible = receipt > 0.001;

    // ---- écran
    let text;
    if (!this.running) text = [];
    else if (s < 0.6) text = plateRuns(data.plate);
    else if (s < 5.0) text = data.exit;
    else if (s < 7.6) text = [];
    else text = plateRuns(nextData.plate);
    const key = JSON.stringify(text);
    if (key !== this._desired) {
      this.tw.set(text, { immediate: !!this._first });
      this._first = false;
      this._desired = key;
    }
    this.tw.update(dt);

    // ---- robot
    const r = this.robot;
    // fréquences multiples de 2π/9 : boucle parfaite avec le cycle de la borne
    const t = this.sigma + this.cycle * CYCLE;
    const w = (Math.PI * 2) / CYCLE;
    r.group.position.y = 1.06 + Math.sin(t * w * 3) * 0.045;
    // regarde la caméra, en jetant un œil à la voiture quand elle est proche
    const toCam = Math.atan2(this.camera.position.x - r.group.position.x, this.camera.position.z - r.group.position.z);
    let yaw = toCam;
    if (car.group.visible && Math.abs(x - STOP_X) < 2.5) {
      const look = Math.atan2(x - r.group.position.x, CAR_Z - r.group.position.z);
      yaw = lerp(toCam, look, 0.25);
    }
    r.head.rotation.y = dampAngle(r.head.rotation.y, yaw - 0.08, 3, dt);
    r.head.rotation.x = Math.sin(t * w * 2) * 0.03 - 0.05;
    r.head.rotation.z = Math.sin(t * w * 2 + 1.2) * 0.035;
    r.updateEyes(dt, Math.sin(t * w) * 0.15, 0, blinkAmount(this.sigma, [3.4, 7.7]));
  }
}
