// Visual transformation for Kairo's awakened Gears: an anime flame aura, glowing eyes,
// recoloured markings, hair tint, blade colour and per-gear ambient particles.
import * as THREE from 'three';
import { glowTexture } from '../../world/materials.js';
import { COLORS } from '../../fx/fx.js';
import { damp, rand } from '../../core/mathutils.js';

// Per-gear look: aura colours, eye glow, hair tint and the blade's energy colour.
const LOOKS = [
  null,
  { aura: 0, inner: 0x5ec8ff, outer: 0x2f7dff, eyes: 0, eyeColor: 0xff4060, hair: 0x1d2029, hairGlow: 0x000000, blade: 0x5ec8ff, mark: 'crimson' },
  { aura: 0.75, inner: 0xd8f6ff, outer: 0x2f8dff, eyes: 0.8, eyeColor: 0x7fdcff, hair: 0x1b2333, hairGlow: 0x06203a, blade: 0x7fdcff, mark: 'blue' },
  { aura: 1, inner: 0xffd0d8, outer: 0xff1a3c, eyes: 1, eyeColor: 0xff2440, hair: 0x2c0c14, hairGlow: 0x3a0612, blade: 0xff2440, mark: 'crimson' },
];

const AURA_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

// Rising flame tongues around the body; brighter at the base, ragged at the top.
const AURA_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uInner;
  uniform vec3 uOuter;
  varying vec2 vUv;
  void main() {
    float x = vUv.x * 6.2831853;
    float y = vUv.y;
    float tongues = 0.5 + 0.5 * sin(x * 5.0 + uTime * 2.6) * sin(x * 3.0 - uTime * 1.7 + y * 4.0);
    float flicker = 0.5 + 0.5 * sin(x * 13.0 - uTime * 7.0 + y * 11.0);
    float top = 0.45 + 0.45 * tongues;
    float shape = 1.0 - smoothstep(top - 0.25, top, y);
    float streak = 0.6 + 0.4 * fract(y * 3.0 - uTime * 2.2 + sin(x * 7.0) * 0.2);
    float a = shape * smoothstep(0.0, 0.06, y) * (0.35 + 0.65 * flicker) * streak * uIntensity;
    vec3 col = mix(uInner, uOuter, smoothstep(0.0, 0.8, y));
    gl_FragColor = vec4(col, a * 0.55);
  }`;

const _v = new THREE.Vector3();
const _c = new THREE.Color();

export class GearVisuals {
  constructor(kairo) {
    this.k = kairo;
    this.gear = 1;
    this.intensity = 0;
    this.eyes = 0;
    this.time = 0;
    this.particleT = 0;
    this.boltT = 0;
    this.hairColor = new THREE.Color(LOOKS[1].hair);
    this.hairGlow = new THREE.Color(0, 0, 0);
    this.blade = new THREE.Color(LOOKS[1].blade);

    // aura shell rides on the logical root (follows position, not the spin of the model)
    this.auraMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uInner: { value: new THREE.Color(LOOKS[2].inner) },
        uOuter: { value: new THREE.Color(LOOKS[2].outer) },
      },
      vertexShader: AURA_VERT,
      fragmentShader: AURA_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const geo = new THREE.CylinderGeometry(0.34, 0.66, 2.5, 28, 1, true);
    geo.translate(0, 1.2, 0);
    this.aura = new THREE.Mesh(geo, this.auraMat);
    this.aura.renderOrder = 8;
    this.aura.visible = false;
    this.aura.frustumCulled = false;
    kairo.object.add(this.aura);

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

  setGear(g) {
    this.gear = g;
    const L = LOOKS[g];
    if (L.aura > 0) {
      this.auraMat.uniforms.uInner.value.set(L.inner);
      this.auraMat.uniforms.uOuter.value.set(L.outer);
    }
    for (const s of this.eyeSprites) s.material.color.set(L.eyeColor);
  }

  /** The awakening explosion. */
  burst(g) {
    const k = this.k;
    const fx = k.game.fx;
    const L = LOOKS[g];
    const c = k.chestWorld(_v);
    const main = g === 3 ? COLORS.crimson : COLORS.blue;
    fx.ring({ position: k.position, radius: 6.5, life: 0.7, width: 0.12, inner: main, outer: 0xffffff });
    fx.ring({ position: k.position, radius: 3.8, life: 0.5, width: 0.22, inner: L.outer, outer: L.inner });
    fx.ring({ position: c, radius: 3.2, life: 0.45, width: 0.12, normal: new THREE.Vector3(0, 1, 0).cross(k.facingDir).normalize(), inner: main, outer: 0xffffff });
    fx.flash({ position: c, color: 0xffffff, size: 2.6, life: 0.2, kind: 'star', opacity: 0.7 });
    fx.flash({ position: c, color: main, size: 4.5, life: 0.4, kind: 'glow', opacity: 0.45 });
    fx.sparks(c, { dir: new THREE.Vector3(0, 1, 0), count: 70, speed: 15, spread: 1.6, colors: g === 3 ? [COLORS.crimson, 0xff7080, 0xffffff] : [COLORS.blue, 0xd8f6ff, 0xffffff], size: 0.08, life: 0.8, gravity: 6 });
    fx.swirl(k.position, { count: 60, radius: 0.6, radiusVel: 8, angVel: 9, rise: 2.5, life: 0.7, colors: g === 3 ? [COLORS.crimson, 0xffd0d8] : [COLORS.blue, 0xffffff] });
    fx.dust(k.position, { count: 18, radius: 1.5, speed: 7, alpha: 0.35, size: 0.6 });
    fx.debris(k.position, { count: 14, power: 7 });
    fx.light(c, main, 40, 3.5);
    this.intensity = 1.3; // overshoot, settles to the gear's level
  }

  /** Gathering energy before the burst. */
  charge(dt, g) {
    const k = this.k;
    const L = LOOKS[g];
    if (Math.random() < dt * 60) {
      k.game.fx.swirl(k.position, { count: 2, radius: 2.4, radiusVel: -3.2, angVel: 7, rise: 1.2, life: 0.5, size: 0.06, colors: [L.inner, L.outer] });
    }
  }

  reset() {
    this.gear = 1;
    this.intensity = 0;
    this.eyes = 0;
    this.aura.visible = false;
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
    const L = LOOKS[this.gear];
    this.time += dt;
    // the ultimate keeps its own crimson look; the aura dips so the cinematic reads cleanly
    const target = k.ultimate.active ? L.aura * 0.5 : L.aura;
    this.intensity = damp(this.intensity, target, 5, dt);
    this.eyes = damp(this.eyes, L.eyes, 6, dt);
    const show = this.intensity > 0.02;
    this.aura.visible = show;
    if (show) {
      const u = this.auraMat.uniforms;
      u.uTime.value = this.time;
      u.uIntensity.value = Math.min(1.4, this.intensity * (0.9 + 0.1 * Math.sin(this.time * 9)));
      const pulse = 1 + 0.04 * Math.sin(this.time * 6);
      this.aura.scale.set(pulse, 1 + 0.06 * Math.sin(this.time * 4.3), pulse);
    }
    for (const s of this.eyeSprites) {
      s.visible = this.eyes > 0.02;
      s.material.opacity = this.eyes * (0.85 + 0.15 * Math.sin(this.time * 12));
    }
    // hair tint + markings + blade colour ease towards the gear's look
    const m = k.model.materials;
    this.hairColor.lerp(_c.set(L.hair), 1 - Math.exp(-4 * dt));
    this.hairGlow.lerp(_c.set(L.hairGlow), 1 - Math.exp(-4 * dt));
    m.hair.color.copy(this.hairColor);
    if (m.hair.emissive) m.hair.emissive.copy(this.hairGlow);
    if (!k.ultimate.active) {
      this.blade.lerp(_c.set(L.blade), 1 - Math.exp(-6 * dt));
      const s = k.sword;
      if (s.auraMat) s.auraMat.uniforms.uColor.value.copy(this.blade);
      if (s.energyMat) s.energyMat.color.copy(this.blade);
      k.swordLight.color.copy(this.blade);
    }

    // ambient particles: wind spirals (Gale Drive) or rising crimson embers and bolts (Overdrive)
    if (this.gear >= 2 && !k.swordSheathed) {
      this.particleT -= dt;
      if (this.particleT <= 0) {
        this.particleT = this.gear === 3 ? 0.03 : 0.045;
        const fx = k.game.fx;
        if (this.gear === 2) {
          fx.swirl(k.position, { count: 1, radius: 0.9, radiusVel: 0.4, angVel: 8, rise: 2.2, life: 0.6, size: 0.05, yRange: 0.4, colors: [0xd8f6ff, COLORS.blue] });
        } else {
          _v.set(k.position.x + rand(-0.5, 0.5), k.position.y + rand(0.1, 1.6), k.position.z + rand(-0.5, 0.5));
          fx.motes(_v, { count: 1, spread: 0.1, rise: 2.2, colors: [COLORS.crimson, 0xff7080], size: 0.06, life: 0.6 });
        }
      }
      if (this.gear === 3) {
        this.boltT -= dt;
        if (this.boltT <= 0) {
          this.boltT = rand(0.12, 0.3);
          _v.set(k.position.x + rand(-0.6, 0.6), k.position.y + rand(0.3, 1.8), k.position.z + rand(-0.6, 0.6));
          k.game.fx.sparks(_v, { count: 4, speed: 5, spread: 1.5, colors: [0xffffff, COLORS.crimson], size: 0.035, life: 0.18, gravity: 0, stretch: 0.08 });
        }
      }
    }
  }
}

export { LOOKS as GEAR_LOOKS };
