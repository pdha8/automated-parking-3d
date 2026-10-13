import * as THREE from 'three';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

// Ombres de contact douces (technique de l'exemple three.js
// "webgl_shadow_contact") : on rend la profondeur de la scène vue du sol,
// on la floute, puis on l'affiche sur un plan posé au sol.

export class ContactShadows {
  constructor(renderer, scene, { width = 16, depth = 16, resolution = 1024, cameraHeight = 1.6, blur = 2.6, darkness = 1.6, opacity = 0.62, center = new THREE.Vector3(), shear = [0, 0] } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.blur = blur;
    this.group = new THREE.Group();
    this.group.position.copy(center);
    this.group.position.y += 0.002;
    scene.add(this.group);

    const opts = { type: THREE.HalfFloatType };
    this.rt = new THREE.WebGLRenderTarget(resolution, resolution, opts);
    this.rt.texture.generateMipmaps = false;
    this.rtBlur = new THREE.WebGLRenderTarget(resolution, resolution, opts);
    this.rtBlur.texture.generateMipmaps = false;

    const planeGeo = new THREE.PlaneGeometry(width, depth).rotateX(Math.PI / 2);
    this.planeMat = new THREE.MeshBasicMaterial({ map: this.rt.texture, opacity, transparent: true, depthWrite: false });
    this.plane = new THREE.Mesh(planeGeo, this.planeMat);
    this.plane.renderOrder = 1;
    this.plane.scale.y = -1; // l'image est rendue "par en dessous"
    this.group.add(this.plane);

    this.blurPlane = new THREE.Mesh(planeGeo);
    this.blurPlane.visible = false;
    this.group.add(this.blurPlane);

    this.camera = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, 0, cameraHeight);
    this.camera.rotation.x = Math.PI / 2; // regarde vers le haut
    this.camera.layers.set(0);
    this.group.add(this.camera);

    this.depthMaterial = new THREE.MeshDepthMaterial();
    this.depthMaterial.userData.darkness = { value: darkness };
    this.depthMaterial.userData.shear = { value: new THREE.Vector2(shear[0], shear[1]) };
    this.depthMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.darkness = this.depthMaterial.userData.darkness;
      shader.uniforms.uShear = this.depthMaterial.userData.shear;
      // cisaillement : plus un point est haut, plus son ombre est décalée
      // dans la direction opposée à la lumière (ombre "soleil" douce)
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'uniform vec2 uShear;\nvoid main() {')
        .replace(
          '#include <project_vertex>',
          /* glsl */ `
          vec4 wp = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          wp = modelMatrix * wp;
          wp.xz += wp.y * uShear;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          `,
        );
      shader.fragmentShader = /* glsl */ `
        uniform float darkness;
        ${shader.fragmentShader.replace(
          'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
          'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );',
        )}
      `;
    };
    this.depthMaterial.depthTest = false;
    this.depthMaterial.depthWrite = false;

    this.hBlur = new THREE.ShaderMaterial({ ...HorizontalBlurShader, uniforms: THREE.UniformsUtils.clone(HorizontalBlurShader.uniforms) });
    this.hBlur.depthTest = false;
    this.vBlur = new THREE.ShaderMaterial({ ...VerticalBlurShader, uniforms: THREE.UniformsUtils.clone(VerticalBlurShader.uniforms) });
    this.vBlur.depthTest = false;
  }

  set opacity(v) {
    this.planeMat.opacity = v;
  }

  get opacity() {
    return this.planeMat.opacity;
  }

  blurShadow(amount) {
    const r = this.renderer;
    this.blurPlane.visible = true;

    this.blurPlane.material = this.hBlur;
    this.blurPlane.material.uniforms.tDiffuse.value = this.rt.texture;
    this.hBlur.uniforms.h.value = amount * (1 / 256);
    r.setRenderTarget(this.rtBlur);
    r.render(this.blurPlane, this.camera);

    this.blurPlane.material = this.vBlur;
    this.blurPlane.material.uniforms.tDiffuse.value = this.rtBlur.texture;
    this.vBlur.uniforms.v.value = amount * (1 / 256);
    r.setRenderTarget(this.rt);
    r.render(this.blurPlane, this.camera);

    this.blurPlane.visible = false;
  }

  update() {
    const r = this.renderer;
    const scene = this.scene;
    const prevBg = scene.background;
    const prevOverride = scene.overrideMaterial;
    const prevClear = r.getClearAlpha();
    const prevAutoClear = r.autoClear;
    scene.background = null;
    scene.overrideMaterial = this.depthMaterial;
    this.plane.visible = false;
    r.autoClear = true;
    r.setClearAlpha(0);

    r.setRenderTarget(this.rt);
    r.render(scene, this.camera);
    scene.overrideMaterial = prevOverride;

    this.blurShadow(this.blur);
    this.blurShadow(this.blur * 0.4);

    r.setRenderTarget(null);
    r.setClearAlpha(prevClear);
    r.autoClear = prevAutoClear;
    this.plane.visible = true;
    scene.background = prevBg;
  }
}
