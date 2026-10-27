// FX facade: owns every pooled effect system and exposes high-level helpers.
// Everything is capacity-bounded and cleared on restart; nothing allocates per frame.
import * as THREE from 'three';
import { ParticlePool, DebrisPool } from './particles.js';
import { SwordTrail } from './swordTrail.js';
import { SlashArcs } from './slashArcs.js';
import { Rings, Telegraphs } from './rings.js';
import { Flashes } from './flashes.js';
import { Afterimages } from './afterimages.js';
import { toon } from '../world/materials.js';
import { rand } from '../core/mathutils.js';

export const COLORS = {
  blue: 0x5ec8ff,
  blueDeep: 0x2f7dff,
  white: 0xeaf8ff,
  crimson: 0xff2440,
  crimsonDeep: 0xb0102a,
  violet: 0xa04bff,
  riftPink: 0xff4fd8,
  gold: 0xffc45e,
};

const _d = new THREE.Vector3();
const _spawn = {};
const _swirl = {};

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.sparksPool = new ParticlePool(scene, { capacity: 1800, blending: THREE.AdditiveBlending, renderOrder: 20 });
    this.dustPool = new ParticlePool(scene, { capacity: 500, blending: THREE.NormalBlending, renderOrder: 9 });
    this.debrisPool = new DebrisPool(scene, toon(0x4a4656), 140);
    this.trail = new SwordTrail(scene, { maxSamples: 30, subdiv: 4 });
    this.arcs = new SlashArcs(scene, 26);
    this.rings = new Rings(scene, 18);
    this.telegraphs = new Telegraphs(scene, 16);
    this.flashes = new Flashes(scene, 30);
    this.afterimages = null;
    this.screen = null; // ScreenFX (DOM overlay), set by the game

    this.impactLight = new THREE.PointLight(0x9fdcff, 0, 9, 2);
    this.impactLight.position.set(0, 2, 0);
    scene.add(this.impactLight);
    this.impactDecay = 10;
  }

  initAfterimages(buildGhost, capacity = 12) {
    this.afterimages = new Afterimages(this.scene, buildGhost, capacity);
  }

  // ---------- primitives ----------
  _pick(colors) {
    return Array.isArray(colors) ? colors[(Math.random() * colors.length) | 0] : colors;
  }

  sparks(point, { dir = null, count = 12, speed = 9, spread = 1, colors = [COLORS.white, COLORS.blue], size = 0.06, life = 0.35, gravity = 10, stretch = 0.035, drag = 3 } = {}) {
    for (let i = 0; i < count; i++) {
      _d.set(rand(-1, 1), rand(-1, 1), rand(-1, 1));
      if (_d.lengthSq() < 1e-4) _d.set(0, 1, 0);
      _d.normalize();
      if (dir) _d.multiplyScalar(spread).add(dir).normalize();
      const s = speed * rand(0.45, 1.15);
      const o = _spawn;
      o.x = point.x; o.y = point.y; o.z = point.z;
      o.vx = _d.x * s; o.vy = _d.y * s; o.vz = _d.z * s;
      o.life = life * rand(0.6, 1.2);
      o.size = size * rand(0.7, 1.3);
      o.sizeEnd = o.size * 0.2;
      o.color = this._pick(colors);
      o.alpha = 1;
      o.drag = drag;
      o.gravity = gravity;
      o.stretch = stretch;
      o.swirl = null;
      this.sparksPool.spawn(o);
    }
  }

  /** Particles spiralling around a vertical axis. */
  swirl(center, { count = 20, radius = 1.5, radiusVel = 2, angVel = 9, rise = 1.5, colors = [COLORS.blue, COLORS.white], size = 0.07, life = 0.6, yRange = 1.6 } = {}) {
    for (let i = 0; i < count; i++) {
      const o = _spawn;
      o.x = center.x; o.y = center.y + rand(0.05, yRange); o.z = center.z;
      o.vx = 0; o.vy = rise * rand(0.4, 1.2); o.vz = 0;
      o.life = life * rand(0.6, 1.1);
      o.size = size * rand(0.7, 1.4);
      o.sizeEnd = o.size * 0.3;
      o.color = this._pick(colors);
      o.alpha = 0.9;
      o.drag = 0;
      o.gravity = 0;
      o.stretch = 0.03;
      const sw = _swirl;
      sw.cx = center.x;
      sw.cz = center.z;
      sw.angle = rand(0, Math.PI * 2);
      sw.radius = radius * rand(0.5, 1.1);
      sw.angVel = angVel * rand(0.8, 1.2);
      sw.radVel = radiusVel * rand(0.5, 1.2);
      o.swirl = sw;
      this.sparksPool.spawn(o);
    }
  }

  /** Soft floating motes (energy, embers). */
  motes(point, { count = 8, spread = 0.5, rise = 1.2, colors = [COLORS.crimson], size = 0.05, life = 0.8, alpha = 0.9 } = {}) {
    for (let i = 0; i < count; i++) {
      const o = _spawn;
      o.x = point.x + rand(-spread, spread); o.y = point.y + rand(-spread, spread) * 0.6; o.z = point.z + rand(-spread, spread);
      o.vx = rand(-0.4, 0.4); o.vy = rise * rand(0.5, 1.3); o.vz = rand(-0.4, 0.4);
      o.life = life * rand(0.6, 1.2);
      o.size = size * rand(0.7, 1.4);
      o.sizeEnd = 0.005;
      o.color = this._pick(colors);
      o.alpha = alpha;
      o.drag = 1;
      o.gravity = 0;
      o.stretch = 0;
      o.swirl = null;
      this.sparksPool.spawn(o);
    }
  }

  dust(point, { count = 10, radius = 0.6, speed = 2.5, color = 0x8a8496, size = 0.35, life = 0.7, alpha = 0.35 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const o = _spawn;
      o.x = point.x + Math.cos(a) * radius * rand(0.2, 1);
      o.y = point.y + 0.1;
      o.z = point.z + Math.sin(a) * radius * rand(0.2, 1);
      const s = speed * rand(0.5, 1.2);
      o.vx = Math.cos(a) * s; o.vy = rand(0.3, 1.2); o.vz = Math.sin(a) * s;
      o.life = life * rand(0.7, 1.2);
      o.size = size * rand(0.5, 0.9);
      o.sizeEnd = size * rand(1.2, 1.8);
      o.color = color;
      o.alpha = alpha;
      o.drag = 3.5;
      o.gravity = -0.3;
      o.stretch = 0;
      o.swirl = null;
      this.dustPool.spawn(o);
    }
  }

  debris(point, { count = 10, power = 6, size = 0.09 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const s = power * rand(0.3, 1);
      this.debrisPool.spawn(
        point.x + rand(-0.3, 0.3), point.y + 0.1, point.z + rand(-0.3, 0.3),
        Math.cos(a) * s * 0.6, power * rand(0.5, 1.1), Math.sin(a) * s * 0.6,
        size * rand(0.5, 1.4), rand(0.9, 1.6),
      );
    }
  }

  slash(o) {
    return this.arcs.spawn(o);
  }

  ring(o) {
    return this.rings.spawn(o);
  }

  flash(o) {
    return this.flashes.spawn(o);
  }

  light(position, color = 0x9fdcff, intensity = 30, decay = 10) {
    this.impactLight.position.copy(position);
    this.impactLight.color.set(color);
    this.impactLight.intensity = Math.max(this.impactLight.intensity, intensity);
    this.impactDecay = decay;
  }

  afterimage(source, opts) {
    if (this.afterimages) this.afterimages.spawn(source, opts);
  }

  // ---------- composites ----------
  /** Sword impact: star flash + sparks + light. dir = direction of the slash through the target. */
  impact(point, dir, { heavy = false, crimson = false, scale = 1 } = {}) {
    this.flash({ position: point, color: crimson ? 0xffd0d8 : 0xe8f8ff, size: (heavy ? 1.9 : 1.15) * scale, life: heavy ? 0.2 : 0.13, kind: 'star' });
    this.flash({ position: point, color: crimson ? COLORS.crimson : COLORS.blue, size: (heavy ? 2.1 : 1.3) * scale, life: heavy ? 0.26 : 0.16, kind: 'glow', opacity: 0.45 });
    this.sparks(point, { dir, count: heavy ? 26 : 12, speed: heavy ? 13 : 9, spread: 0.9, colors: [COLORS.white, COLORS.blue, COLORS.white], size: 0.055 * scale });
    if (crimson || heavy) {
      this.sparks(point, { dir, count: heavy ? 18 : 8, speed: heavy ? 11 : 7, spread: 1.2, colors: [COLORS.crimson, 0xff6070], size: 0.06 * scale, life: 0.45 });
    }
    this.light(point, crimson ? 0xff3050 : 0x9fdcff, heavy ? 60 : 28, heavy ? 7 : 12);
  }

  update(dt) {
    this.sparksPool.update(dt);
    this.dustPool.update(dt);
    this.debrisPool.update(dt);
    this.arcs.update(dt);
    this.rings.update(dt);
    this.telegraphs.update(dt);
    this.flashes.update(dt);
    if (this.afterimages) this.afterimages.update(dt);
    if (this.impactLight.intensity > 0.01) {
      this.impactLight.intensity *= Math.exp(-this.impactDecay * dt);
    } else {
      this.impactLight.intensity = 0;
    }
  }

  /** Sword trail is rebuilt with game time so hit-stop freezes it in place. */
  updateTrail(now) {
    this.trail.update(now);
  }

  clear() {
    this.sparksPool.clear();
    this.dustPool.clear();
    this.debrisPool.clear();
    this.trail.clear();
    this.arcs.clear();
    this.rings.clear();
    this.telegraphs.clear();
    this.flashes.clear();
    if (this.afterimages) this.afterimages.clear();
    this.impactLight.intensity = 0;
    if (this.screen) this.screen.clear();
  }

  stats() {
    return {
      particles: this.sparksPool.alive,
      dust: this.dustPool.alive,
      debris: this.debrisPool.alive,
      arcs: this.arcs.activeCount,
      rings: this.rings.activeCount,
      telegraphs: this.telegraphs.activeCount,
      flashes: this.flashes.activeCount,
      afterimages: this.afterimages ? this.afterimages.activeCount : 0,
      trail: this.trail.active ? 1 : 0,
    };
  }
}
