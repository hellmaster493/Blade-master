// Ribbon trail that follows the actual sword base/tip positions.
// Fixed-size ring buffer + Catmull-Rom subdivision so fast swings stay smooth at low frame rates.
import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

function catmull(p0, p1, p2, p3, t, out) {
  const t2 = t * t;
  const t3 = t2 * t;
  out.x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  out.y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  out.z = 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
  return out;
}

export const TRAIL_STYLES = {
  narrow: { life: 0.13, color: 0x6fc8ff, core: 0xeefaff, accent: 0x6fc8ff, accentAmt: 0, opacity: 0.85, baseCut: 0.45 },
  long: { life: 0.22, color: 0x58b8ff, core: 0xf2fbff, accent: 0x9ad8ff, accentAmt: 0.2, opacity: 0.95, baseCut: 0.2 },
  heavy: { life: 0.28, color: 0x4aa6ff, core: 0xffffff, accent: 0xff2a48, accentAmt: 0.75, opacity: 1, baseCut: 0.0 },
  crescent: { life: 0.3, color: 0x63c2ff, core: 0xffffff, accent: 0xff3150, accentAmt: 0.55, opacity: 1, baseCut: 0.0 },
  cyclone: { life: 0.34, color: 0x48b0ff, core: 0xe8f8ff, accent: 0x7fd0ff, accentAmt: 0.3, opacity: 0.9, baseCut: 0.1 },
  crimson: { life: 0.3, color: 0xff2440, core: 0xffe8ec, accent: 0x3da0ff, accentAmt: 0.6, opacity: 1, baseCut: 0.0 },
  dash: { life: 0.16, color: 0x6fc8ff, core: 0xdff4ff, accent: 0x6fc8ff, accentAmt: 0, opacity: 0.45, baseCut: 0.3 },
};

export class SwordTrail {
  constructor(scene, { maxSamples = 30, subdiv = 4 } = {}) {
    this.maxSamples = maxSamples;
    this.subdiv = subdiv;
    this.samples = [];
    for (let i = 0; i < maxSamples; i++) {
      this.samples.push({ base: new THREE.Vector3(), tip: new THREE.Vector3(), t: 0 });
    }
    this.count = 0;
    this.emitting = false;
    this.style = TRAIL_STYLES.long;

    const maxSections = (maxSamples - 1) * subdiv + 1;
    this.maxSections = maxSections;
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(maxSections * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.ageAttr = new THREE.BufferAttribute(new Float32Array(maxSections * 2), 1).setUsage(THREE.DynamicDrawUsage);
    this.sideAttr = new THREE.BufferAttribute(new Float32Array(maxSections * 2), 1);
    for (let i = 0; i < maxSections; i++) {
      this.sideAttr.array[i * 2] = 0;
      this.sideAttr.array[i * 2 + 1] = 1;
    }
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aAge', this.ageAttr);
    geo.setAttribute('aSide', this.sideAttr);
    const idx = [];
    for (let k = 0; k < maxSections - 1; k++) {
      const a = k * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color() },
        uCore: { value: new THREE.Color() },
        uAccent: { value: new THREE.Color() },
        uAccentAmt: { value: 0 },
        uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aAge;
        attribute float aSide;
        varying float vAge;
        varying float vSide;
        void main() {
          vAge = aAge;
          vSide = aSide;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uCore;
        uniform vec3 uAccent;
        uniform float uAccentAmt;
        uniform float uOpacity;
        varying float vAge;
        varying float vSide;
        void main() {
          float life = clamp(1.0 - vAge, 0.0, 1.0);
          float fade = life * life;
          vec3 col = mix(uColor, uCore, smoothstep(0.55, 1.0, vSide) * (0.4 + 0.6 * life));
          float accent = (1.0 - smoothstep(0.05, 0.35, vSide)) * uAccentAmt;
          col = mix(col, uAccent, accent);
          float a = fade * (smoothstep(0.0, 0.3, vSide) * 0.85 + accent * 0.6) * uOpacity;
          a *= 0.6 + 0.4 * smoothstep(0.3, 1.0, vSide);
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    scene.add(this.mesh);
    this.setStyle('long');
  }

  setStyle(name) {
    const s = TRAIL_STYLES[name] || TRAIL_STYLES.long;
    this.style = s;
    const u = this.material.uniforms;
    u.uColor.value.set(s.color);
    u.uCore.value.set(s.core);
    u.uAccent.value.set(s.accent);
    u.uAccentAmt.value = s.accentAmt;
    u.uOpacity.value = s.opacity;
  }

  start(styleName) {
    if (!this.emitting) this.count = 0;
    this.emitting = true;
    if (styleName) this.setStyle(styleName);
  }

  stop() {
    this.emitting = false;
  }

  /** base/tip in world space. `baseCut` of the style moves the ribbon's root towards the tip. */
  push(base, tip, now) {
    if (!this.emitting) return;
    let s;
    if (this.count < this.maxSamples) {
      s = this.samples[this.count++];
    } else {
      // recycle oldest
      s = this.samples.shift();
      this.samples.push(s);
    }
    s.base.copy(base).lerp(tip, this.style.baseCut);
    s.tip.copy(tip);
    s.t = now;
  }

  update(now) {
    const life = this.style.life;
    // drop expired samples from the front
    let drop = 0;
    while (drop < this.count && now - this.samples[drop].t > life) drop++;
    if (drop > 0) {
      const removed = this.samples.splice(0, drop);
      this.samples.push(...removed);
      this.count -= drop;
    }
    if (this.count < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    const pos = this.posAttr.array;
    const age = this.ageAttr.array;
    const S = this.samples;
    const n = this.count;
    let sec = 0;
    for (let i = 0; i < n - 1; i++) {
      const s0 = S[Math.max(0, i - 1)];
      const s1 = S[i];
      const s2 = S[i + 1];
      const s3 = S[Math.min(n - 1, i + 2)];
      const steps = i === n - 2 ? this.subdiv + 1 : this.subdiv;
      for (let k = 0; k < steps; k++) {
        const t = k / this.subdiv;
        catmull(s0.base, s1.base, s2.base, s3.base, t, _a);
        catmull(s0.tip, s1.tip, s2.tip, s3.tip, t, _b);
        const o = sec * 6;
        pos[o] = _a.x; pos[o + 1] = _a.y; pos[o + 2] = _a.z;
        pos[o + 3] = _b.x; pos[o + 4] = _b.y; pos[o + 5] = _b.z;
        const ag = (now - (s1.t + (s2.t - s1.t) * t)) / life;
        age[sec * 2] = ag;
        age[sec * 2 + 1] = ag;
        sec++;
      }
    }
    this.posAttr.needsUpdate = true;
    this.ageAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, (sec - 1) * 6);
  }

  clear() {
    this.count = 0;
    this.emitting = false;
    this.geometry.setDrawRange(0, 0);
  }

  get active() {
    return this.count > 1;
  }
}
