// Pooled expanding shockwave rings and enemy attack telegraphs (ground decals).
import * as THREE from 'three';
import { Ease, clamp } from '../core/mathutils.js';

const _plane = new THREE.PlaneGeometry(2, 2);

const RING_FRAG = /* glsl */ `
  uniform float uR;
  uniform float uW;
  uniform float uFade;
  uniform float uSeed;
  uniform vec3 uInner;
  uniform vec3 uOuter;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    if (d > 1.0) discard;
    float band = smoothstep(uR - uW, uR, d) * (1.0 - smoothstep(uR, uR + uW * 0.25, d));
    float ang = atan(p.y, p.x);
    float streak = 0.7 + 0.3 * sin(ang * 23.0 + uSeed) * sin(ang * 7.0 - uSeed * 2.0);
    float fill = (1.0 - smoothstep(0.0, uR, d)) * 0.05;
    vec3 col = mix(uInner, uOuter, smoothstep(uR - uW, uR, d));
    float a = (band * streak + fill) * uFade;
    gl_FragColor = vec4(col, a);
  }`;

const TELE_FRAG = /* glsl */ `
  uniform float uHalf;
  uniform float uProgress;
  uniform float uFade;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    if (d > 1.0) discard;
    // angle from local +Y of the plane (mapped to the attack's forward direction)
    float ang = abs(atan(p.x, p.y));
    if (ang > uHalf) discard;
    float border = smoothstep(0.92, 0.98, d) + (uHalf < 3.1 ? smoothstep(uHalf - 0.06, uHalf, ang) : 0.0);
    float fill = (1.0 - smoothstep(uProgress - 0.03, uProgress, d)) * 0.38;
    float base = 0.13;
    float a = clamp(base + fill + border * 0.7, 0.0, 1.0) * uFade;
    gl_FragColor = vec4(uColor, a);
  }`;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

export class Rings {
  constructor(scene, capacity = 18) {
    this.items = [];
    for (let i = 0; i < capacity; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uR: { value: 0 }, uW: { value: 0.1 }, uFade: { value: 1 }, uSeed: { value: 0 },
          uInner: { value: new THREE.Color(0xff2a48) }, uOuter: { value: new THREE.Color(0xd8f3ff) },
        },
        vertexShader: VERT,
        fragmentShader: RING_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(_plane, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 11;
      scene.add(mesh);
      this.items.push({ mesh, mat, active: false, t: 0, life: 1, maxR: 1 });
    }
  }

  /** Flat ground ring by default; pass `normal` for an oriented ring. */
  spawn({ position, radius = 4, life = 0.5, width = 0.12, inner = 0xff2a48, outer = 0xd8f3ff, normal = null, y = 0.04 }) {
    let it = this.items.find((x) => !x.active);
    if (!it) it = this.items.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    it.active = true;
    it.t = 0;
    it.life = life;
    it.mesh.visible = true;
    it.mesh.position.copy(position);
    if (normal) {
      it.mesh.lookAt(position.x + normal.x, position.y + normal.y, position.z + normal.z);
    } else {
      it.mesh.position.y = position.y + y;
      it.mesh.rotation.set(-Math.PI / 2, 0, 0);
    }
    it.mesh.scale.setScalar(radius);
    const u = it.mat.uniforms;
    u.uW.value = width;
    u.uSeed.value = Math.random() * 100;
    u.uInner.value.set(inner);
    u.uOuter.value.set(outer);
    u.uR.value = 0;
    u.uFade.value = 1;
    return it;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt;
      const k = it.t / it.life;
      if (k >= 1) {
        it.active = false;
        it.mesh.visible = false;
        continue;
      }
      it.mat.uniforms.uR.value = Ease.outCubic(k) * 0.97;
      it.mat.uniforms.uFade.value = 1 - Ease.inQuad(k);
    }
  }

  clear() {
    for (const it of this.items) {
      it.active = false;
      it.mesh.visible = false;
    }
  }

  get activeCount() {
    return this.items.reduce((n, it) => n + (it.active ? 1 : 0), 0);
  }
}

/** Enemy attack warning decals. Owners update or release their telegraph handle. */
export class Telegraphs {
  constructor(scene, capacity = 14) {
    this.items = [];
    for (let i = 0; i < capacity; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uHalf: { value: Math.PI }, uProgress: { value: 0 }, uFade: { value: 0 },
          uColor: { value: new THREE.Color(0xff3a2a) },
        },
        vertexShader: VERT,
        fragmentShader: TELE_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(_plane, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      scene.add(mesh);
      this.items.push({ mesh, mat, active: false, t: 0, duration: 1, fadeOut: 0, owner: null });
    }
  }

  /** Shows a sector (halfAngle < PI) or circle warning that fills up over `duration`. */
  show({ position, yaw = 0, range = 3, halfAngle = Math.PI, duration = 0.6, color = 0xff3a2a }) {
    const it = this.items.find((x) => !x.active);
    if (!it) return null;
    it.active = true;
    it.t = 0;
    it.duration = duration;
    it.fadeOut = 0;
    it.mesh.visible = true;
    it.mesh.position.set(position.x, 0.05, position.z);
    // Lay the plane flat (local +Y -> world -Z), then spin it so local +Y points at forward(yaw).
    it.mesh.rotation.set(-Math.PI / 2, 0, 0);
    it.mesh.rotateZ(Math.PI + yaw);
    it.mesh.scale.setScalar(range);
    const u = it.mat.uniforms;
    u.uHalf.value = halfAngle;
    u.uColor.value.set(color);
    u.uProgress.value = 0;
    u.uFade.value = 1;
    return it;
  }

  move(it, position, yaw) {
    if (!it || !it.active) return;
    it.mesh.position.set(position.x, 0.05, position.z);
    if (yaw !== undefined) {
      it.mesh.rotation.set(-Math.PI / 2, 0, 0);
      it.mesh.rotateZ(Math.PI + yaw);
    }
  }

  release(it) {
    if (!it || !it.active) return;
    if (it.fadeOut <= 0) it.fadeOut = 0.15;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt;
      const u = it.mat.uniforms;
      if (it.fadeOut > 0) {
        it.fadeOut -= dt;
        u.uFade.value = clamp(it.fadeOut / 0.15, 0, 1);
        if (it.fadeOut <= 0) {
          it.active = false;
          it.mesh.visible = false;
        }
        continue;
      }
      u.uProgress.value = clamp(it.t / it.duration, 0, 1);
      // safety: never let a telegraph linger if its owner forgot to release it
      if (it.t > it.duration + 2) this.release(it);
    }
  }

  clear() {
    for (const it of this.items) {
      it.active = false;
      it.mesh.visible = false;
    }
  }

  get activeCount() {
    return this.items.reduce((n, it) => n + (it.active ? 1 : 0), 0);
  }
}
