// Visual transformation for Kairo's awakened Gears. Every Gear has its own aura, and each step
// up is bigger and more violent than the last:
//   - a flame aura around his silhouette (a layer behind him plus wisps in front of him)
//   - a glowing sigil on the ground and a light that colours the arena around him
//   - recoloured eyes, hair, markings and blade
//   - ambient particles, lightning (Gear 3+) and levitating rocks (Gear 4)
//   - an awakening burst with a pillar of light that scales with the Gear
import * as THREE from 'three';
import { glowTexture, toon } from '../../world/materials.js';
import { COLORS } from '../../fx/fx.js';
import { damp, rand, clamp } from '../../core/mathutils.js';

// Per-gear look. size scales the aura (1 = 1.7 m wide, 2.5 m tall); aura is its brightness.
const LOOKS = [
  null,
  { size: 0, aura: 0, eyes: 0, eyeColor: 0xff4060, hair: 0x1d2029, hairGlow: 0x000000, blade: 0x5ec8ff, lightI: 0 },
  {
    size: 1, aura: 1, speed: 1, turb: 0.8, core: 0xe6faff, mid: 0x5ec8ff, edge: 0x2f6dff, alt: 0xffffff, altMix: 0,
    ground: 0x3f9dff, groundCore: 0xd8f6ff, groundSize: 1.7, cracks: 0, light: 0x6ccfff, lightI: 7,
    eyes: 0.8, eyeColor: 0x7fdcff, hair: 0x1b2333, hairGlow: 0x06203a, blade: 0x7fdcff,
    ghost: COLORS.blue, pillar: 0.6, shake: 0.45, ring: 6.5,
  },
  {
    size: 1.2, aura: 1.1, speed: 1.35, turb: 1.1, core: 0xffe8ec, mid: 0xff3a55, edge: 0xb80c28, alt: 0xff9a40, altMix: 0.25,
    ground: 0xff2440, groundCore: 0xffd0d8, groundSize: 2.3, cracks: 0.35, light: 0xff3048, lightI: 12,
    eyes: 1, eyeColor: 0xff2440, hair: 0x2c0c14, hairGlow: 0x3a0612, blade: 0xff2440,
    ghost: COLORS.crimson, pillar: 1, shake: 0.65, ring: 8,
  },
  {
    size: 1.45, aura: 1.25, speed: 1.75, turb: 1.4, core: 0xfbf2ff, mid: 0xb55cff, edge: 0xff2a6a, alt: 0x5ec8ff, altMix: 0.55,
    ground: 0xa04bff, groundCore: 0xf0dcff, groundSize: 3.2, cracks: 1, light: 0xb070ff, lightI: 20,
    eyes: 1.2, eyeColor: 0xe8c8ff, hair: 0xc8c2e2, hairGlow: 0x2a1048, blade: 0xc77dff,
    ghost: 0xb55cff, pillar: 1.5, shake: 0.9, ring: 10,
  },
];

const NOISE = /* glsl */ `
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + 17.0;
      a *= 0.5;
    }
    return v;
  }`;

const UV_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

// Anime flame aura on an upright, camera-facing plane: hugs the body (rounded at the feet,
// widest at the shoulders) and breaks into tongues that lick upward. The front layer only
// keeps the outer flames and a few wisps so Kairo stays readable.
const FLAME_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uTurb;
  uniform float uFront;
  uniform vec3 uCore;
  uniform vec3 uMid;
  uniform vec3 uEdge;
  uniform vec3 uAlt;
  uniform float uAltMix;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    float x = vUv.x * 2.0 - 1.0;
    float y = vUv.y;
    float t = uTime;
    float wave = (fbm(vec2(y * 3.0 - t * 1.3, x * 0.8)) - 0.5) * 0.55 * uTurb * y;
    float ax = abs(x + wave);
    float prof = 0.42 + 0.25 * smoothstep(0.0, 0.45, y) - 0.62 * smoothstep(0.5, 1.0, y);
    float tongue = fbm(vec2(x * 3.5, y * 2.2 - t * 2.0));
    prof += (tongue - 0.5) * 0.6 * uTurb * smoothstep(0.15, 0.9, y);
    prof = max(prof, 0.0);
    float inside = smoothstep(prof, prof - 0.2, ax);
    float r = clamp(ax / max(prof, 0.02), 0.0, 1.0);
    float rim = smoothstep(0.45, 0.95, r);
    float body = fbm(vec2(x * 5.0, y * 4.0 - t * 3.0));
    float streak = smoothstep(0.62, 0.92, vnoise(vec2(x * 14.0, y * 4.5 - t * 6.0))) * (1.0 - smoothstep(0.45, 0.95, y));
    float a = inside * (0.3 + 0.7 * body) * (0.55 + 0.45 * rim) + streak * inside * 0.55;
    a *= 0.4 + 0.6 * smoothstep(0.0, 0.6, r); // translucent core, bright licking edges
    a *= mix(1.0, rim * 0.75 + streak * 0.3, uFront);
    a *= smoothstep(0.0, 0.07, y);
    vec3 col = mix(uCore, uMid, smoothstep(0.1, 0.65, r));
    col = mix(col, uEdge, clamp(smoothstep(0.6, 1.0, r) * 0.8 + smoothstep(0.55, 1.0, y) * 0.4, 0.0, 1.0));
    col = mix(col, uAlt, uAltMix * smoothstep(0.55, 0.78, fbm(vec2(x * 2.0 + 5.0, y * 2.5 - t * 1.7))));
    col += streak * 0.35;
    gl_FragColor = vec4(col, clamp(a * uIntensity, 0.0, 1.0));
  }`;

// Ground sigil: radial glow, a pulsing ring, turning rays and (higher Gears) glowing cracks.
const GROUND_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uCracks;
  uniform vec3 uColor;
  uniform vec3 uCore;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ang = atan(p.y, p.x);
    float glow = pow(max(0.0, 1.0 - r), 2.2);
    float ring = smoothstep(0.05, 0.0, abs(r - 0.8 - 0.02 * sin(uTime * 3.0)));
    float ring2 = smoothstep(0.025, 0.0, abs(r - 0.56)) * (0.5 + 0.5 * sin(ang * 12.0 + uTime * 4.0));
    float rays = pow(0.5 + 0.5 * sin(ang * 10.0 + uTime * 2.0 + vnoise(vec2(ang * 3.0, uTime)) * 3.0), 6.0) * (1.0 - r);
    float n = fbm(p * 3.2 + vec2(0.0, uTime * 0.05));
    float crack = (1.0 - smoothstep(0.0, 0.03, abs(n - 0.5))) * smoothstep(1.0, 0.25, r) * uCracks;
    float a = (glow * 0.75 + ring * 0.55 + ring2 * 0.35 + rays * 0.3 + crack * 1.1) * smoothstep(1.0, 0.88, r);
    vec3 col = mix(uColor, uCore, clamp(glow * 0.6 + crack * 0.5, 0.0, 1.0));
    gl_FragColor = vec4(col, clamp(a * uIntensity, 0.0, 1.0));
  }`;

// Pillar of light that shoots up when a Gear awakens.
const PILLAR_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uAlpha;
  uniform vec3 uColor;
  uniform vec3 uCore;
  varying vec2 vUv;
  void main() {
    float fade = pow(1.0 - vUv.y, 1.4) * smoothstep(0.0, 0.04, vUv.y);
    float streak = 0.6 + 0.4 * sin(vUv.x * 50.0 + uTime * 14.0 + vUv.y * 6.0);
    vec3 col = mix(uColor, uCore, fade * 0.7);
    gl_FragColor = vec4(col, clamp(fade * streak * uAlpha, 0.0, 1.0));
  }`;

const BOLT_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aSide;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSide;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vSide = aSide;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const BOLT_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSide;
  void main() {
    float core = 1.0 - abs(vSide);
    vec3 col = mix(vColor, vec3(1.0), smoothstep(0.45, 1.0, core));
    gl_FragColor = vec4(col, pow(core, 1.3) * vAlpha);
  }`;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Color();
const _cam = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function additive(uniforms, fragmentShader, vertexShader = UV_VERT) {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}

// ------------------------------------------------------------------ lightning
const BOLT_PTS = 10;

/** Jagged, camera-facing lightning ribbons, all drawn in one mesh. */
class Bolts {
  constructor(scene, capacity = 14) {
    this.capacity = capacity;
    const nv = capacity * BOLT_PTS * 2;
    this.pos = new Float32Array(nv * 3);
    this.col = new Float32Array(nv * 3);
    this.alpha = new Float32Array(nv);
    const side = new Float32Array(nv);
    const index = [];
    for (let b = 0; b < capacity; b++) {
      for (let i = 0; i < BOLT_PTS; i++) {
        const v = (b * BOLT_PTS + i) * 2;
        side[v] = 1;
        side[v + 1] = -1;
        if (i < BOLT_PTS - 1) index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geo.setIndex(index);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, additive({}, BOLT_FRAG, BOLT_VERT));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 22;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < capacity; i++) {
      const pts = [];
      for (let j = 0; j < BOLT_PTS; j++) pts.push(new THREE.Vector3());
      this.items.push({ active: false, t: 0, life: 0.1, a: new THREE.Vector3(), b: new THREE.Vector3(), pts, color: new THREE.Color(), width: 0.05, jag: 0.2, rejag: false });
    }
    this.active = 0;
  }

  spawn(a, b, { color = 0xffffff, width = 0.05, life = 0.12, jag = 0.2 } = {}) {
    let it = this.items.find((x) => !x.active);
    if (!it) it = this.items.reduce((p, q) => (p.t / p.life > q.t / q.life ? p : q));
    it.active = true;
    it.t = 0;
    it.life = life;
    it.a.copy(a);
    it.b.copy(b);
    it.color.set(color);
    it.width = width;
    it.jag = jag;
    it.rejag = false;
    this.jagged(it);
  }

  jagged(it) {
    const len = _v.subVectors(it.b, it.a).length() || 1;
    const dir = _v.divideScalar(len);
    for (let i = 0; i < BOLT_PTS; i++) {
      const u = i / (BOLT_PTS - 1);
      const p = it.pts[i].lerpVectors(it.a, it.b, u);
      if (i === 0 || i === BOLT_PTS - 1) continue;
      _v2.set(rand(-1, 1), rand(-1, 1), rand(-1, 1));
      _v2.addScaledVector(dir, -_v2.dot(dir));
      p.addScaledVector(_v2, it.jag * len * 0.35 * Math.sin(Math.PI * u));
    }
  }

  update(dt, camera) {
    let any = false;
    camera.getWorldPosition(_cam);
    for (let b = 0; b < this.capacity; b++) {
      const it = this.items[b];
      const base = b * BOLT_PTS * 2;
      if (it.active) {
        it.t += dt;
        if (it.t >= it.life) it.active = false;
        else if (!it.rejag && it.t > it.life * 0.5) {
          it.rejag = true;
          this.jagged(it); // lightning flickers into a new shape once
        }
      }
      const alpha = it.active ? (1 - it.t / it.life) * (0.7 + 0.3 * Math.random()) : 0;
      if (it.active) any = true;
      for (let i = 0; i < BOLT_PTS; i++) {
        const v = base + i * 2;
        this.alpha[v] = this.alpha[v + 1] = alpha;
        if (!it.active) continue;
        const p = it.pts[i];
        const p0 = it.pts[Math.max(0, i - 1)];
        const p1 = it.pts[Math.min(BOLT_PTS - 1, i + 1)];
        _a.subVectors(p1, p0);
        _b.subVectors(_cam, p);
        _a.cross(_b);
        if (_a.lengthSq() < 1e-8) _a.set(1, 0, 0);
        _a.normalize().multiplyScalar(it.width * (1 - 0.45 * (i / (BOLT_PTS - 1))));
        this.pos[v * 3] = p.x + _a.x;
        this.pos[v * 3 + 1] = p.y + _a.y;
        this.pos[v * 3 + 2] = p.z + _a.z;
        this.pos[v * 3 + 3] = p.x - _a.x;
        this.pos[v * 3 + 4] = p.y - _a.y;
        this.pos[v * 3 + 5] = p.z - _a.z;
        for (const o of [v * 3, v * 3 + 3]) {
          this.col[o] = it.color.r;
          this.col[o + 1] = it.color.g;
          this.col[o + 2] = it.color.b;
        }
      }
    }
    this.mesh.visible = any;
    if (any) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aColor.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
    }
    this.active = this.items.reduce((n, x) => n + (x.active ? 1 : 0), 0);
  }

  clear() {
    for (const it of this.items) it.active = false;
    this.mesh.visible = false;
    this.active = 0;
  }
}

// ------------------------------------------------------------------ levitating rocks
/** Gear 4: chunks of the arena floor tear loose and float up around Kairo. */
class Rocks {
  constructor(scene, capacity = 12) {
    this.capacity = capacity;
    this.alive = 0;
    const mat = toon(0x4a4458, { emissive: 0x16082a });
    this.mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < capacity; i++) {
      this.items.push({ p: new THREE.Vector3(), vy: 0, top: 1, rise: 1, r: new THREE.Euler(), w: new THREE.Vector3(), life: 0, max: 1, size: 0.1, phase: 0, falling: false });
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this.time = 0;
  }

  spawn(center, { rMin = 1.2, rMax = 3.0, lift = 1 } = {}) {
    if (this.alive >= this.capacity) return null;
    const it = this.items[this.alive++];
    const a = rand(0, Math.PI * 2);
    const r = rand(rMin, rMax);
    it.size = rand(0.07, 0.2);
    it.p.set(center.x + Math.cos(a) * r, it.size * 0.4, center.z + Math.sin(a) * r);
    it.top = rand(0.6, 2.6) * lift;
    it.rise = rand(0.5, 1.1);
    it.vy = 0;
    it.r.set(rand(0, 6), rand(0, 6), rand(0, 6));
    it.w.set(rand(-1.5, 1.5), rand(-1.5, 1.5), rand(-1.5, 1.5));
    it.life = it.max = rand(2.6, 4.6);
    it.phase = rand(0, 6);
    it.falling = false;
    return it.p;
  }

  dropAll() {
    for (let i = 0; i < this.alive; i++) this.items[i].falling = true;
  }

  update(dt, onLand) {
    this.time += dt;
    let i = 0;
    while (i < this.alive) {
      const it = this.items[i];
      it.life -= dt;
      if (it.falling) {
        it.vy -= 22 * dt;
        it.p.y += it.vy * dt;
      } else {
        it.p.y += (it.top - it.p.y) * (1 - Math.exp(-it.rise * dt)) + Math.sin(this.time * 2 + it.phase) * 0.06 * dt;
      }
      it.r.x += it.w.x * dt;
      it.r.y += it.w.y * dt;
      it.r.z += it.w.z * dt;
      if (it.life <= 0 || (it.falling && it.p.y < it.size * 0.4)) {
        if (onLand && it.falling) onLand(it.p);
        this.alive--;
        const last = this.items[this.alive];
        this.items[this.alive] = it;
        this.items[i] = last;
        continue;
      }
      const s = it.size * Math.min(1, (it.max - it.life) / 0.3) * (it.falling ? 1 : Math.min(1, it.life / 0.4));
      this._q.setFromEuler(it.r);
      this._s.setScalar(Math.max(0.001, s));
      this._m.compose(it.p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
      i++;
    }
    this.mesh.count = this.alive;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.alive = 0;
    this.mesh.count = 0;
  }
}

// ------------------------------------------------------------------ the Gear look
export class GearVisuals {
  constructor(kairo) {
    this.k = kairo;
    const scene = kairo.game.scene;
    this.gear = 1;
    this.intensity = 0;
    this.size = 1;
    this.eyes = 0;
    this.time = 0;
    this.lightI = 0;
    this.particleT = 0;
    this.boltT = 0;
    this.strikeT = 0;
    this.rockT = 0;
    this.pulseT = 0;
    this.chargeGear = 0;
    this.chargeP = 0;
    this.colorGear = 2;
    this.hairColor = new THREE.Color(LOOKS[1].hair);
    this.hairGlow = new THREE.Color(0, 0, 0);
    this.blade = new THREE.Color(LOOKS[1].blade);

    // flame aura: one layer behind Kairo and one in front, both facing the camera
    const flameUniforms = (front) => ({
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uTurb: { value: 1 },
      uFront: { value: front },
      uCore: { value: new THREE.Color(LOOKS[2].core) },
      uMid: { value: new THREE.Color(LOOKS[2].mid) },
      uEdge: { value: new THREE.Color(LOOKS[2].edge) },
      uAlt: { value: new THREE.Color(LOOKS[2].alt) },
      uAltMix: { value: 0 },
    });
    const plane = new THREE.PlaneGeometry(1.7, 2.5);
    plane.translate(0, 1.25 - 0.12, 0);
    this.back = new THREE.Mesh(plane, additive(flameUniforms(0), FLAME_FRAG));
    this.front = new THREE.Mesh(plane, additive(flameUniforms(1), FLAME_FRAG));
    this.back.renderOrder = 7;
    this.front.renderOrder = 12;
    this.flames = [this.back, this.front];

    // ground sigil
    const disc = new THREE.PlaneGeometry(2, 2);
    disc.rotateX(-Math.PI / 2);
    this.groundMat = additive({
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uCracks: { value: 0 },
      uColor: { value: new THREE.Color(LOOKS[2].ground) },
      uCore: { value: new THREE.Color(LOOKS[2].groundCore) },
    }, GROUND_FRAG);
    this.ground = new THREE.Mesh(disc, this.groundMat);
    this.ground.renderOrder = 6;

    // awakening pillar
    const tube = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
    tube.translate(0, 0.5, 0);
    this.pillarMat = additive({
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      uColor: { value: new THREE.Color() },
      uCore: { value: new THREE.Color(0xffffff) },
    }, PILLAR_FRAG);
    this.pillar = new THREE.Mesh(tube, this.pillarMat);
    this.pillar.renderOrder = 13;
    this.pillarT = 1;
    this.pillarLife = 0.7;
    this.pillarPower = 1;

    for (const m of [this.back, this.front, this.ground, this.pillar]) {
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
    }

    // the aura lights the floor around him (always in the scene so the light count never changes)
    this.light = new THREE.PointLight(0x6ccfff, 0, 9, 2);
    scene.add(this.light);

    this.bolts = new Bolts(scene);
    this.rocks = new Rocks(scene);

    // glowing eyes
    const head = kairo.model.joints.get('head');
    this.eyeSprites = [];
    for (const sx of [1, -1]) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: LOOKS[3].eyeColor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      s.position.set(sx * 0.041, 0.1, 0.11);
      s.scale.setScalar(0.07);
      s.visible = false;
      s.renderOrder = 9;
      head.add(s);
      this.eyeSprites.push(s);
    }
  }

  get look() {
    return LOOKS[this.gear];
  }

  /** Aura height in metres (handy for tests and tuning). */
  get auraHeight() {
    return 2.5 * this.back.scale.y;
  }

  setGear(g) {
    this.gear = g;
    for (const s of this.eyeSprites) s.material.color.set(LOOKS[g].eyeColor);
    if (g === 1) this.rocks.dropAll();
  }

  /** The awakening explosion: everything scales with the Gear being reached. */
  burst(g) {
    const k = this.k;
    const fx = k.game.fx;
    const L = LOOKS[g];
    const p = g - 1; // 1..3
    const c = k.chestWorld(_v);
    const main = L.mid;
    const sparkColors = [L.mid, L.core, 0xffffff, L.alt];
    this.colorGear = g;
    this.applyColors(g, 1);
    fx.ring({ position: k.position, radius: L.ring, life: 0.7, width: 0.12, inner: main, outer: 0xffffff });
    fx.ring({ position: k.position, radius: L.ring * 0.6, life: 0.5, width: 0.22, inner: L.edge, outer: L.core });
    fx.ring({ position: c, radius: 2.4 + p * 0.8, life: 0.45, width: 0.12, normal: _v2.set(0, 1, 0).cross(k.facingDir).normalize(), inner: main, outer: 0xffffff });
    fx.flash({ position: c, color: 0xffffff, size: 2.2 + p * 0.4, life: 0.2, kind: 'star', opacity: 0.7 });
    fx.flash({ position: c, color: main, size: 3.5 + p, life: 0.4, kind: 'glow', opacity: 0.45 });
    fx.sparks(c, { dir: UP, count: 40 + p * 30, speed: 12 + p * 3, spread: 1.6, colors: sparkColors, size: 0.08, life: 0.8, gravity: 6 });
    fx.swirl(k.position, { count: 40 + p * 25, radius: 0.6, radiusVel: 6 + p * 2, angVel: 9, rise: 2.5, life: 0.7, colors: [L.mid, L.core] });
    fx.dust(k.position, { count: 12 + p * 8, radius: 1.5, speed: 5 + p * 2.5, alpha: 0.35, size: 0.6 });
    fx.debris(k.position, { count: 8 + p * 8, power: 5 + p * 2 });
    fx.light(c, main, 30 + p * 15, 3.5);
    // pillar of light
    this.pillarT = 0;
    this.pillarLife = 0.55 + p * 0.12;
    this.pillarPower = L.pillar;
    this.pillarMat.uniforms.uColor.value.set(main);
    this.pillarMat.uniforms.uCore.value.set(L.core);
    // lightning: Gear 3 crackles, Gear 4 strikes him from the sky and tears into the floor
    if (g >= 3) {
      const n = g === 4 ? 9 : 4;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
        const r = rand(1.5, g === 4 ? 4.5 : 3);
        _a.set(c.x, c.y + rand(-0.3, 0.4), c.z);
        _b.set(k.position.x + Math.cos(a) * r, 0.05, k.position.z + Math.sin(a) * r);
        this.bolts.spawn(_a, _b, { color: i % 2 ? L.alt : L.mid, width: g === 4 ? 0.09 : 0.06, life: rand(0.18, 0.32), jag: 0.35 });
      }
    }
    if (g === 4) {
      _a.set(k.position.x + rand(-0.5, 0.5), 16, k.position.z + rand(-0.5, 0.5));
      this.bolts.spawn(_a, c, { color: 0xd8b8ff, width: 0.22, life: 0.35, jag: 0.12 });
      for (let i = 0; i < 7; i++) this.rocks.spawn(k.position, { rMin: 1, rMax: 3.4 });
    }
    this.intensity = L.aura * 1.5; // overshoot, settles to the gear's level
    this.size = L.size * 1.4;
  }

  /** Gathering energy before the burst. progress runs 0 → 1 up to the burst. */
  charge(dt, g, progress) {
    const k = this.k;
    const L = LOOKS[g];
    this.chargeGear = g;
    this.chargeP = progress;
    if (Math.random() < dt * (40 + g * 15)) {
      k.game.fx.swirl(k.position, { count: 2, radius: 2.4 + g * 0.3, radiusVel: -3.2, angVel: 7, rise: 1.2, life: 0.5, size: 0.06, colors: [L.core, L.mid] });
    }
    if (g >= 3 && Math.random() < dt * (8 + g * 6) * progress) this.bodyBolt(L, 0.5);
    if (g === 4 && Math.random() < dt * 10) this.rocks.spawn(k.position, { rMin: 1, rMax: 3, lift: 0.5 });
  }

  /** A hit landed while awakened: the aura flares, and Gear 4 calls lightning onto the target. */
  onHit(point) {
    if (this.gear < 2) return;
    this.intensity = Math.min(this.intensity + 0.12 * (this.gear - 1), LOOKS[this.gear].aura * 1.5);
    if (this.gear === 4) {
      const L = LOOKS[4];
      _a.set(point.x + rand(-0.4, 0.4), point.y + 6, point.z + rand(-0.4, 0.4));
      this.bolts.spawn(_a, point, { color: Math.random() < 0.5 ? L.mid : L.alt, width: 0.07, life: 0.14, jag: 0.25 });
    }
  }

  /** Short arc crackling across his body. */
  bodyBolt(L, scale = 1) {
    const p = this.k.position;
    _a.set(p.x + rand(-0.35, 0.35), p.y + rand(0.3, 1.7), p.z + rand(-0.35, 0.35));
    _v2.set(rand(-1, 1), rand(-0.4, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.4, 1.1) * scale * (this.gear === 4 ? 1.4 : 1));
    _b.copy(_a).add(_v2);
    this.bolts.spawn(_a, _b, { color: Math.random() < 0.6 ? L.mid : L.alt, width: 0.035 + 0.01 * this.gear, life: rand(0.07, 0.15), jag: 0.3 });
  }

  /** Eases the aura colours towards a gear's palette (t = 1 snaps). */
  applyColors(g, t) {
    const L = LOOKS[g];
    for (const m of this.flames) {
      const u = m.material.uniforms;
      u.uCore.value.lerp(_c.set(L.core), t);
      u.uMid.value.lerp(_c.set(L.mid), t);
      u.uEdge.value.lerp(_c.set(L.edge), t);
      u.uAlt.value.lerp(_c.set(L.alt), t);
      u.uAltMix.value += (L.altMix - u.uAltMix.value) * t;
      u.uTurb.value += (L.turb - u.uTurb.value) * t;
    }
    const gu = this.groundMat.uniforms;
    gu.uColor.value.lerp(_c.set(L.ground), t);
    gu.uCore.value.lerp(_c.set(L.groundCore), t);
    gu.uCracks.value += (L.cracks - gu.uCracks.value) * t;
    this.light.color.lerp(_c.set(L.light), t);
  }

  reset() {
    this.gear = 1;
    this.intensity = 0;
    this.eyes = 0;
    this.lightI = 0;
    this.size = 1;
    this.chargeGear = 0;
    this.pillarT = 1;
    this.light.intensity = 0;
    for (const m of [this.back, this.front, this.ground, this.pillar]) m.visible = false;
    this.bolts.clear();
    this.rocks.clear();
    for (const s of this.eyeSprites) {
      s.visible = false;
      s.material.opacity = 0;
    }
    const m = this.k.model.materials;
    this.hairColor.set(LOOKS[1].hair);
    this.hairGlow.set(0);
    m.hair.color.copy(this.hairColor);
    if (m.hair.emissive) m.hair.emissive.set(0);
  }

  update(dt) {
    const k = this.k;
    const game = k.game;
    const L = LOOKS[this.gear];
    this.time += dt;

    // targets: the current gear, or the one gathering during an awakening
    let tAura = L.aura;
    let tSize = this.gear > 1 ? L.size : this.size;
    let tLight = L.lightI;
    if (this.chargeGear) {
      const C = LOOKS[this.chargeGear];
      tAura = Math.max(tAura, C.aura * (0.2 + 0.7 * this.chargeP));
      tSize = Math.max(this.gear > 1 ? L.size : 0, C.size * (0.65 + 0.35 * this.chargeP));
      tLight = Math.max(tLight, C.lightI * this.chargeP);
      this.colorGear = this.chargeGear;
      this.chargeGear = 0;
    } else if (this.gear > 1) {
      this.colorGear = this.gear;
    }
    if (k.ultimate.active) {
      // the ultimate keeps its own crimson look; the aura dips so the cinematic reads cleanly
      tAura *= 0.5;
      tLight *= 0.4;
    }
    this.intensity = damp(this.intensity, tAura, 5, dt);
    this.size = damp(this.size, tSize, 4, dt);
    this.lightI = damp(this.lightI, tLight, 5, dt);
    this.eyes = damp(this.eyes, L.eyes, 6, dt);
    this.applyColors(this.colorGear, 1 - Math.exp(-6 * dt));

    // aura planes face the camera; the back one sits behind Kairo so his body frames it
    const show = this.intensity > 0.02;
    const cam = game.camera;
    cam.getWorldPosition(_cam);
    _v.set(_cam.x - k.position.x, 0, _cam.z - k.position.z);
    if (_v.lengthSq() < 1e-6) _v.set(0, 0, 1);
    _v.normalize();
    const yaw = Math.atan2(_v.x, _v.z);
    const s = this.size * (1 + 0.035 * Math.sin(this.time * 6.5));
    const flick = 0.9 + 0.1 * Math.sin(this.time * 9) * Math.sin(this.time * 5.3);
    for (const m of this.flames) {
      m.visible = show;
      if (!show) continue;
      const off = m === this.back ? -0.3 : 0.42;
      m.position.set(k.position.x + _v.x * off, k.position.y, k.position.z + _v.z * off);
      m.rotation.set(0, yaw, 0);
      m.scale.set(s, s * (1 + 0.05 * Math.sin(this.time * 4.3)), 1);
      const u = m.material.uniforms;
      u.uTime.value = this.time * (L.speed || 1);
      u.uIntensity.value = Math.min(1.6, this.intensity * flick) * (m === this.front ? 0.8 : 1);
    }
    this.ground.visible = show;
    if (show) {
      const gs = (L.groundSize || 2) * Math.max(0.6, this.size / (L.size || 1));
      this.ground.position.set(k.position.x, 0.03, k.position.z);
      this.ground.scale.setScalar(gs);
      this.ground.rotation.y += dt * 0.6;
      const gu = this.groundMat.uniforms;
      gu.uTime.value = this.time;
      gu.uIntensity.value = Math.min(1.4, this.intensity) * clamp(1.6 - k.position.y * 0.5, 0, 1);
    }
    // low and behind him (from the camera's view): lights the floor and rims his silhouette
    this.light.position.set(k.position.x - _v.x * 0.8, k.position.y + 0.45, k.position.z - _v.z * 0.8);
    this.light.intensity = this.lightI * Math.min(1.5, this.intensity / Math.max(0.3, L.aura || 1)) * flick;

    // pillar of light
    if (this.pillarT < this.pillarLife) {
      this.pillarT += dt;
      const u = Math.min(1, this.pillarT / this.pillarLife);
      this.pillar.visible = u < 1;
      const r = (0.35 + 2.1 * (1 - Math.pow(1 - u, 3))) * this.pillarPower;
      this.pillar.position.set(k.position.x, 0, k.position.z);
      this.pillar.scale.set(r, 18 * Math.min(1, u * 6), r);
      this.pillarMat.uniforms.uAlpha.value = (1 - u) * (1 - u) * 1.2;
      this.pillarMat.uniforms.uTime.value = this.time;
    } else {
      this.pillar.visible = false;
    }

    for (const sp of this.eyeSprites) {
      sp.visible = this.eyes > 0.02;
      sp.material.opacity = Math.min(1, this.eyes) * (0.85 + 0.15 * Math.sin(this.time * 12));
      sp.scale.setScalar(0.07 * Math.max(1, this.eyes));
    }
    // hair tint + markings + blade colour ease towards the gear's look
    const m = k.model.materials;
    this.hairColor.lerp(_c.set(L.hair), 1 - Math.exp(-4 * dt));
    this.hairGlow.lerp(_c.set(L.hairGlow), 1 - Math.exp(-4 * dt));
    m.hair.color.copy(this.hairColor);
    if (m.hair.emissive) m.hair.emissive.copy(this.hairGlow);
    if (!k.ultimate.active) {
      this.blade.lerp(_c.set(L.blade), 1 - Math.exp(-6 * dt));
      const sw = k.sword;
      if (sw.auraMat) sw.auraMat.uniforms.uColor.value.copy(this.blade);
      if (sw.energyMat) sw.energyMat.color.copy(this.blade);
      k.swordLight.color.copy(this.blade);
    }

    if (this.gear >= 2 && !k.swordSheathed) this.ambient(dt, L);
    this.bolts.update(dt, cam);
    this.rocks.update(dt, (p) => game.fx.dust(p, { count: 3, radius: 0.2, speed: 1.5, alpha: 0.3, size: 0.3 }));
  }

  /** Per-gear ambient effects; each Gear adds more on top of the last. */
  ambient(dt, L) {
    const k = this.k;
    const fx = k.game.fx;
    const p = k.position;
    this.particleT -= dt;
    if (this.particleT <= 0) {
      this.particleT = this.gear === 4 ? 0.02 : this.gear === 3 ? 0.03 : 0.045;
      if (this.gear === 2) {
        fx.swirl(p, { count: 1, radius: 0.9, radiusVel: 0.4, angVel: 8, rise: 2.2, life: 0.6, size: 0.05, yRange: 0.4, colors: [0xd8f6ff, COLORS.blue] });
      } else {
        _v.set(p.x + rand(-0.55, 0.55), p.y + rand(0.1, 1.6), p.z + rand(-0.55, 0.55));
        fx.motes(_v, { count: 1, spread: 0.1, rise: this.gear === 4 ? 3.4 : 2.2, colors: [L.mid, L.edge, L.core], size: 0.06, life: 0.6 });
        if (this.gear === 4) {
          fx.swirl(p, { count: 1, radius: 1.4, radiusVel: 0.6, angVel: 6, rise: 3, life: 0.7, size: 0.05, yRange: 0.3, colors: [L.alt, L.core] });
        }
      }
    }
    if (this.gear >= 3) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = this.gear === 4 ? rand(0.05, 0.14) : rand(0.14, 0.32);
        this.bodyBolt(L);
        if (Math.random() < 0.5) {
          _v.set(p.x + rand(-0.6, 0.6), p.y + rand(0.3, 1.8), p.z + rand(-0.6, 0.6));
          fx.sparks(_v, { count: 4, speed: 5, spread: 1.5, colors: [0xffffff, L.mid], size: 0.035, life: 0.18, gravity: 0, stretch: 0.08 });
        }
        if (Math.random() < 0.15) k.game.audio.play('zap', { gear: this.gear });
      }
    }
    if (this.gear === 4) {
      // the pressure of the aura: bolts into the floor, floating rocks, dust and pulse rings
      this.strikeT -= dt;
      if (this.strikeT <= 0) {
        this.strikeT = rand(0.35, 0.8);
        const a = rand(0, Math.PI * 2);
        const r = rand(1.4, 2.8);
        _a.set(p.x + rand(-0.2, 0.2), p.y + rand(0.8, 1.6), p.z + rand(-0.2, 0.2));
        _b.set(p.x + Math.cos(a) * r, 0.04, p.z + Math.sin(a) * r);
        this.bolts.spawn(_a, _b, { color: Math.random() < 0.5 ? L.mid : L.alt, width: 0.06, life: 0.16, jag: 0.3 });
        fx.sparks(_b, { dir: UP, count: 8, speed: 5, spread: 1.2, colors: [0xffffff, L.mid, L.alt], size: 0.05, life: 0.3 });
      }
      this.rockT -= dt;
      if (this.rockT <= 0) {
        this.rockT = 0.35;
        this.rocks.spawn(p);
      }
      this.pulseT -= dt;
      if (this.pulseT <= 0) {
        this.pulseT = 1.2;
        fx.ring({ position: p, radius: 3.2, life: 0.6, width: 0.06, inner: L.mid, outer: L.core });
        fx.dust(p, { count: 6, radius: 0.8, speed: 3.5, alpha: 0.22, size: 0.5 });
      }
    }
  }
}

export { LOOKS as GEAR_LOOKS };
