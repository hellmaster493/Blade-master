// Pooled enemy projectiles (Shade Caster rift bolts). Dodgeable with dash i-frames.
import * as THREE from 'three';
import { HitTracker } from '../combat/combat.js';
import { glowTexture } from '../world/materials.js';
import { COLORS } from '../fx/fx.js';
import { ARENA } from '../config.js';

const _v = new THREE.Vector3();

export class Projectiles {
  constructor(game, capacity = 16) {
    this.game = game;
    this.items = [];
    const geo = new THREE.IcosahedronGeometry(0.22, 1);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xf0b8ff });
    for (let i = 0; i < capacity; i++) {
      const mesh = new THREE.Mesh(geo, coreMat);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: COLORS.violet, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      glow.scale.setScalar(1.4);
      mesh.add(glow);
      mesh.visible = false;
      game.scene.add(mesh);
      this.items.push({ mesh, active: false, vel: new THREE.Vector3(), life: 0, owner: null, damage: 0, tracker: new HitTracker(), trailT: 0 });
    }
  }

  fire(owner, from, dir, speed = 12, damage = 70) {
    const it = this.items.find((x) => !x.active);
    if (!it) return null;
    it.active = true;
    it.mesh.visible = true;
    it.mesh.position.copy(from);
    it.vel.copy(dir).normalize().multiplyScalar(speed);
    it.life = 3.2;
    it.owner = owner;
    it.damage = damage;
    it.tracker.reset();
    this.game.audio.play('orb');
    return it;
  }

  update(dt) {
    const g = this.game;
    const player = g.player;
    for (const it of this.items) {
      if (!it.active) continue;
      it.life -= dt;
      it.mesh.position.addScaledVector(it.vel, dt);
      it.mesh.rotation.y += dt * 6;
      const p = it.mesh.position;
      it.trailT -= dt;
      if (it.trailT <= 0) {
        it.trailT = 0.03;
        g.fx.motes(p, { count: 1, spread: 0.08, rise: 0.2, colors: [COLORS.violet, COLORS.riftPink], size: 0.09, life: 0.35 });
      }
      if (it.life <= 0 || Math.hypot(p.x, p.z) > ARENA.wallRadius || p.y < 0) {
        this.explode(it, false);
        continue;
      }
      if (!player.isDefeated() && !it.tracker.has(player)) {
        // distance from the bolt to the player's body segment
        const py = Math.max(player.position.y + 0.3, Math.min(player.position.y + 1.6, p.y));
        const d = Math.hypot(p.x - player.position.x, p.y - py, p.z - player.position.z);
        if (d < 0.6) {
          const hit = { damage: it.damage, knockback: 5, lift: 0, stagger: 0.4, kind: 'enemy', source: it.owner, dir: _v.copy(it.vel).setY(0).normalize().clone() };
          const res = g.combat.applyHit(it.owner, player, hit, it.tracker);
          if (res && res.applied) {
            g.onPlayerHit(it.owner, res, hit);
            this.explode(it, true);
          }
        }
      }
    }
  }

  explode(it, big) {
    const fx = this.game.fx;
    fx.sparks(it.mesh.position, { count: big ? 18 : 8, speed: 6, colors: [COLORS.violet, COLORS.riftPink, 0xffffff], size: 0.06, life: 0.4 });
    fx.flash({ position: it.mesh.position, color: COLORS.violet, size: big ? 2 : 1, life: 0.2, kind: 'glow', opacity: 0.8 });
    it.active = false;
    it.mesh.visible = false;
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
