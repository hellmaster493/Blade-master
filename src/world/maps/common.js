// Shared building blocks for arena maps: canvas textures, sky/noise shader snippets,
// the boundary barrier, GPU-animated weather and a few prop helpers.
import * as THREE from 'three';
import { ARENA } from '../../config.js';
import { toon } from '../materials.js';

// Ground textures span the whole platform; phones get half the resolution.
export const GROUND_TEX = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches ? 1024 : 2048;
export const GROUND_PX = GROUND_TEX / (2 * (ARENA.wallRadius + 1.5)); // texture pixels per metre

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Wraps a canvas as an sRGB texture the arena disposes when the map unloads. */
export function canvasTexture(arena, c, { srgb = true, repeat = null, anisotropy = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return arena.track(t);
}

/** Small seeded RNG so every map builds the same way each time. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const NOISE_GLSL = /* glsl */ `
  float hash1(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash1(i), hash1(i + vec2(1.0, 0.0)), u.x), mix(hash1(i + vec2(0.0, 1.0)), hash1(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + 17.0;
      a *= 0.5;
    }
    return v;
  }
  float stars(vec3 d, float density, float t) {
    vec3 sp = floor(d * density);
    float s = hash3(sp);
    float twinkle = 0.6 + 0.4 * sin(t * 2.0 + s * 40.0);
    return step(0.9975, s) * twinkle;
  }`;

export const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;

/** A sky fragment shader body gets `vec3 d` (view dir), uTime and must set `col`. */
export function skyShader(body, uniforms = '') {
  return /* glsl */ `
    uniform float uTime;
    uniform float uDim;
    ${uniforms}
    varying vec3 vDir;
    ${NOISE_GLSL}
    void main() {
      vec3 d = normalize(vDir);
      float h = clamp(d.y, -1.0, 1.0);
      vec3 col = vec3(0.0);
      ${body}
      gl_FragColor = vec4(col * uDim, 1.0);
    }`;
}

const UV_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

export { UV_VERT };

const BARRIER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uDim;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float rise = smoothstep(1.0, 0.0, vUv.y);
    float bands = 0.5 + 0.5 * sin(vUv.x * 380.0 + uTime * 1.5) * sin(vUv.y * 12.0 - uTime * 2.0);
    float a = rise * (0.12 + 0.18 * bands) * uStrength;
    vec3 col = mix(uColA, uColB, vUv.y);
    gl_FragColor = vec4(col * uDim, a * uDim);
  }`;

/** The shimmering boundary wall every map shares (colours vary). */
export function addBarrier(arena, { colorA = 0x8c33ff, colorB = 0xff4073, strength = 1 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDim: { value: 1 },
      uColA: { value: new THREE.Color(colorA) },
      uColB: { value: new THREE.Color(colorB) },
      uStrength: { value: strength },
    },
    vertexShader: UV_VERT,
    fragmentShader: BARRIER_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const barrier = new THREE.Mesh(new THREE.CylinderGeometry(ARENA.wallRadius, ARENA.wallRadius, 3.2, 96, 1, true), mat);
  barrier.position.y = 1.6;
  barrier.renderOrder = 6;
  arena.add(barrier);
  arena.timed(mat);
  arena.dimmed(mat, 0.5);
  return barrier;
}

/** Ground disc covering the playable area and a little beyond the wall. */
export function addGround(arena, material, radius = ARENA.wallRadius + 1.5) {
  const ground = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), material);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  arena.add(ground);
  return ground;
}

/** Instanced copies of one geometry; `place(i, m)` fills a Matrix4 per instance (return false to skip). */
export function instanced(arena, geo, mat, count, place, { shadow = true, colors = null } = {}) {
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  let k = 0;
  for (let i = 0; i < count; i++) {
    m.identity();
    if (place(i, m) === false) continue;
    inst.setMatrixAt(k, m);
    if (colors) inst.setColorAt(k, colors(i));
    k++;
  }
  inst.count = k;
  inst.castShadow = shadow;
  inst.receiveShadow = shadow;
  arena.add(inst);
  return inst;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Matrix from position / Euler rotation / scale (helper for instanced()). */
export function compose(m, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _q.setFromEuler(_e.set(rx, ry, rz));
  return m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** Toon-shaded mesh helper that adds to the map with shadows on. */
export function prop(arena, geo, color, x, y, z, { opts = {}, rot = null, scale = null, shadow = true, parent = null } = {}) {
  const mesh = new THREE.Mesh(geo, typeof color === 'object' ? color : toon(color, opts));
  mesh.position.set(x, y, z);
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
  if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  (parent || arena.mapGroup).add(mesh);
  return mesh;
}

// ------------------------------------------------------------------ weather
const WEATHER_VERT = /* glsl */ `
  attribute vec4 aSeed;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uHeight;
  uniform float uSpeed;
  uniform float uSway;
  uniform float uSize;
  uniform float uScale;
  uniform float uRise;
  uniform vec2 uCenter;
  uniform float uBox;
  varying vec3 vColor;
  varying float vFade;
  varying float vRot;
  void main() {
    vec3 p = position;
    // a box of weather that wraps around the player: particles stay put in the world,
    // and the ones that fall too far behind reappear ahead
    p.x += floor((uCenter.x - p.x + uBox) / (2.0 * uBox)) * 2.0 * uBox;
    p.z += floor((uCenter.y - p.z + uBox) / (2.0 * uBox)) * 2.0 * uBox;
    float t = uTime * uSpeed * aSeed.y;
    p.y = uRise > 0.5 ? mod(position.y + t, uHeight) : uHeight - mod(uHeight - position.y + t, uHeight);
    p.x += sin(uTime * 0.8 * aSeed.y + aSeed.z) * uSway * (0.5 + aSeed.y);
    p.z += cos(uTime * 0.65 * aSeed.y + aSeed.z * 1.7) * uSway;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(64.0, uSize * aSeed.w * uScale / max(0.5, -mv.z));
    vFade = smoothstep(0.0, 1.5, p.y) * smoothstep(uHeight, uHeight - 3.0, p.y);
    vColor = aColor;
    vRot = aSeed.z + uTime * aSeed.y * 1.6;
  }`;

const WEATHER_FRAG = /* glsl */ `
  uniform float uOpacity;
  uniform float uDim;
  varying vec3 vColor;
  varying float vFade;
  varying float vRot;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a;
    #if KIND == 1
      // petal: a spinning ellipse with a notch
      float cs = cos(vRot), sn = sin(vRot);
      vec2 r = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
      a = smoothstep(0.5, 0.36, length(r * vec2(1.0, 2.1)));
      a *= 0.75 + 0.25 * cos(vRot * 2.0);
    #elif KIND == 2
      // rain: a thin vertical streak
      a = smoothstep(0.07, 0.0, abs(c.x)) * smoothstep(0.5, 0.1, abs(c.y));
    #else
      a = smoothstep(0.5, 0.05, length(c));
    #endif
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a * vFade * uOpacity * uDim);
  }`;

const KINDS = { soft: 0, petal: 1, rain: 2, snow: 0, ember: 0 };

/**
 * Falling (or rising) particles over the arena, animated entirely on the GPU.
 * kind: 'soft' | 'snow' | 'ember' | 'petal' | 'rain'
 */
export function addWeather(arena, { count = 600, radius = 30, height = 22, speed = 1.5, sway = 0.6, size = 0.12, colors = [0xffffff], kind = 'soft', additive = false, rise = false, opacity = 0.8, seed = 7 } = {}) {
  const rand = rng(seed);
  const pos = new Float32Array(count * 3);
  const seedA = new Float32Array(count * 4);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rand() * 2 - 1) * radius;
    pos[i * 3 + 1] = rand() * height;
    pos[i * 3 + 2] = (rand() * 2 - 1) * radius;
    seedA[i * 4] = rand();
    seedA[i * 4 + 1] = 0.6 + rand() * 0.8;
    seedA[i * 4 + 2] = rand() * 6.283;
    seedA[i * 4 + 3] = 0.6 + rand() * 0.8;
    c.set(colors[(rand() * colors.length) | 0]);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seedA, 4));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    defines: { KIND: KINDS[kind] || 0 },
    uniforms: {
      uTime: { value: 0 },
      uDim: { value: 1 },
      uHeight: { value: height },
      uSpeed: { value: speed },
      uSway: { value: sway },
      uSize: { value: size },
      uScale: { value: arena.pixelScale },
      uRise: { value: rise ? 1 : 0 },
      uOpacity: { value: opacity },
      uCenter: { value: new THREE.Vector2(arena.focus.x, arena.focus.z) },
      uBox: { value: radius },
    },
    vertexShader: WEATHER_VERT,
    fragmentShader: WEATHER_FRAG,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 15;
  arena.add(points);
  arena.timed(mat);
  arena.dimmed(mat, 0.4);
  arena.weather.push(mat);
  return points;
}
