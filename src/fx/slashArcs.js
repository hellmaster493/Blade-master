// Pooled crescent slash arcs. The arc's shape is computed in the vertex shader so one
// shared grid geometry serves every arc; each pooled mesh only owns its uniforms.
import * as THREE from 'three';
import { clamp, Ease } from '../core/mathutils.js';

const SEG = 64;
let _sharedGeo = null;

function arcGeometry() {
  if (_sharedGeo) return _sharedGeo;
  const geo = new THREE.BufferGeometry();
  const uvs = [];
  const pos = [];
  for (let i = 0; i <= SEG; i++) {
    for (let j = 0; j <= 1; j++) {
      uvs.push(i / SEG, j);
      pos.push(0, 0, 0);
    }
  }
  const idx = [];
  for (let i = 0; i < SEG; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  _sharedGeo = geo;
  return geo;
}

const VERT = /* glsl */ `
  uniform float uA0;
  uniform float uA1;
  uniform float uR;
  uniform float uThick;
  uniform float uGrow;
  varying vec2 vUv;
  void main() {
    float a = mix(uA0, uA1, uv.x);
    float taper = pow(max(sin(3.14159265 * uv.x), 0.0), 0.65);
    float r = uR * (1.0 + uGrow);
    float rr = r - uThick * (1.0 + uGrow * 0.5) * (1.0 - uv.y) * taper;
    vec3 p = vec3(sin(a) * rr, 0.0, cos(a) * rr);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const FRAG = /* glsl */ `
  uniform float uHead;
  uniform float uTail;
  uniform float uFade;
  uniform float uAccent;
  uniform float uOpacity;
  uniform vec3 uBody;
  uniform vec3 uCore;
  uniform vec3 uAccentCol;
  varying vec2 vUv;
  void main() {
    float x = vUv.x;
    float y = vUv.y;
    float head = 1.0 - smoothstep(uHead - 0.05, uHead + 0.001, x);
    float tail = smoothstep(uTail, uTail + 0.3, x);
    float along = head * tail;
    float headGlow = smoothstep(uHead - 0.5, uHead, x);
    float edge = smoothstep(0.0, 0.5, y);
    float core = smoothstep(0.78, 1.0, y);
    vec3 col = mix(uBody, uCore, clamp(core * 0.9 + headGlow * 0.15, 0.0, 1.0));
    float acc = (1.0 - smoothstep(0.05, 0.24, y)) * uAccent;
    col = mix(col, uAccentCol, acc);
    float a = along * (edge * 0.42 + core * 0.6 + acc * 0.75) * uFade * uOpacity;
    a *= 0.5 + 0.5 * headGlow;
    gl_FragColor = vec4(col, a);
  }`;

const _m = new THREE.Matrix4();
const _n = new THREE.Vector3();

export class SlashArcs {
  constructor(scene, capacity = 24) {
    this.items = [];
    const geo = arcGeometry();
    for (let i = 0; i < capacity; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uA0: { value: 0 }, uA1: { value: 1 }, uR: { value: 1 }, uThick: { value: 0.3 }, uGrow: { value: 0 },
          uHead: { value: 0 }, uTail: { value: -1 }, uFade: { value: 1 }, uAccent: { value: 0 }, uOpacity: { value: 1 },
          uBody: { value: new THREE.Color(0x3d9dff) }, uCore: { value: new THREE.Color(0xffffff) },
          uAccentCol: { value: new THREE.Color(0xff2a48) },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 14;
      scene.add(mesh);
      this.items.push({ mesh, mat, active: false, t: 0, life: 0, sweep: 0, grow: 0, delay: 0 });
    }
  }

  /**
   * @param o.origin  world pivot
   * @param o.F, o.S  unit basis vectors of the slash plane (angle 0 = F, +90deg = S)
   * @param o.a0, o.a1 start/end angle in radians (the arc sweeps from a0 to a1)
   */
  spawn(o) {
    let it = this.items.find((x) => !x.active);
    if (!it) {
      // Recycle the oldest arc instead of growing the pool.
      it = this.items.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    }
    const u = it.mat.uniforms;
    u.uA0.value = o.a0;
    u.uA1.value = o.a1;
    u.uR.value = o.radius || 1.5;
    u.uThick.value = o.thickness || 0.45;
    u.uAccent.value = o.accent || 0;
    u.uOpacity.value = o.opacity !== undefined ? o.opacity : 1;
    u.uBody.value.set(o.body !== undefined ? o.body : 0x3d9dff);
    u.uCore.value.set(o.core !== undefined ? o.core : 0xffffff);
    u.uAccentCol.value.set(o.accentColor !== undefined ? o.accentColor : 0xff2a48);
    u.uGrow.value = 0;
    u.uHead.value = 0;
    u.uTail.value = -1;
    u.uFade.value = 1;
    _n.crossVectors(o.F, o.S).normalize();
    _m.makeBasis(o.S, _n, o.F);
    it.mesh.quaternion.setFromRotationMatrix(_m);
    it.mesh.position.copy(o.origin);
    it.active = true;
    it.t = 0;
    it.life = o.life || 0.35;
    it.sweep = o.sweep !== undefined ? o.sweep : 0.3;
    it.grow = o.grow || 0;
    it.delay = o.delay || 0;
    it.mesh.visible = it.delay <= 0;
    return it;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.active) continue;
      if (it.delay > 0) {
        it.delay -= dt;
        if (it.delay > 0) continue;
        it.mesh.visible = true;
      }
      it.t += dt;
      const k = it.t / it.life;
      if (k >= 1) {
        it.active = false;
        it.mesh.visible = false;
        continue;
      }
      const u = it.mat.uniforms;
      const sweepK = it.sweep > 0 ? clamp(k / it.sweep, 0, 1) : 1;
      u.uHead.value = Ease.outCubic(sweepK) * 1.05;
      u.uTail.value = -0.3 + Ease.inQuad(clamp((k - it.sweep * 0.6) / (1 - it.sweep * 0.6), 0, 1)) * 1.35;
      u.uFade.value = 1 - clamp((k - 0.55) / 0.45, 0, 1);
      u.uGrow.value = it.grow * Ease.outCubic(k);
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
