// Shade Caster: floating ranged enemy that keeps its distance and fires rift bolts.
import * as THREE from 'three';
import { Enemy, enemyPart, joint } from './enemyBase.js';
import { mergeStaticParts } from '../characters/meshMerge.js';
import { glowTexture } from '../world/materials.js';
import { COLORS } from '../fx/fx.js';
import { clamp, damp, lerp, Ease, rand } from '../core/mathutils.js';

const BOLT = {
  name: 'Rift Bolt', windup: 0.8, active: 0.1, recover: 0.75, range: 13, halfAngle: 0.05,
  damage: 65, knockback: 5, shape: 'sector', color: 0xb05cff, trackUntil: 0.9, trackSpeed: 8, noMeleeHit: true,
  windupSfx: 'enemyWindup', activeSfx: 'orb',
  onActive: (e) => e.fireBolt(),
};

export class ShadeCaster extends Enemy {
  constructor(game) {
    super(game, {
      type: 'caster', name: 'SHADE CASTER', hp: 140, radius: 0.45, height: 1.8, speed: 3.4, scale: 1,
      cdMin: 2.2, cdMax: 3.6, hover: 0.35,
    });
    this.position.y = 0.35;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = rand(1.5, 3);
    this.build();
  }

  build() {
    const robe = this.mat(0x1e1830);
    const trim = this.mat(0x6a2a9a);
    const glow = this.glowMat(0xd77bff);
    const o = this.object;
    const j = (this.j = {});
    j.body = joint(o, 0, 0, 0);
    enemyPart(j.body, new THREE.ConeGeometry(0.48, 1.25, 10, 1, true), robe, { p: [0, 0.62, 0] });
    enemyPart(j.body, new THREE.TorusGeometry(0.46, 0.03, 6, 16), trim, { p: [0, 0.05, 0], r: [Math.PI / 2, 0, 0], outline: 0 });
    enemyPart(j.body, new THREE.CapsuleGeometry(0.2, 0.3, 4, 10), robe, { p: [0, 1.15, 0], s: [1.1, 1, 0.85] });
    j.head = joint(j.body, 0, 1.52, 0);
    enemyPart(j.head, new THREE.SphereGeometry(0.2, 12, 10), robe, { s: [1, 1.1, 1] });
    enemyPart(j.head, new THREE.ConeGeometry(0.16, 0.35, 8), robe, { p: [0, 0.18, -0.12], r: [-0.9, 0, 0] });
    enemyPart(j.head, new THREE.SphereGeometry(0.13, 10, 8), this.mat(0x050308), { p: [0, -0.02, 0.1], s: [1, 1, 0.6], outline: 0 });
    for (const sx of [1, -1]) {
      enemyPart(j.head, new THREE.SphereGeometry(0.025, 6, 6), glow, { p: [sx * 0.05, 0.0, 0.17], s: [1.4, 0.6, 0.5], outline: 0 });
    }
    for (const side of [1, -1]) {
      const sh = joint(j.body, side * 0.24, 1.32, 0);
      enemyPart(sh, new THREE.ConeGeometry(0.1, 0.55, 8, 1, true), robe, { p: [0, -0.25, 0], r: [Math.PI, 0, 0] });
      j[side > 0 ? 'armL' : 'armR'] = sh;
    }
    // the orb it channels
    j.orb = enemyPart(j.body, new THREE.IcosahedronGeometry(0.12, 1), glow, { p: [0, 1.0, 0.42], outline: 0 });
    j.orb.userData.noMerge = true;
    this.orbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: COLORS.violet, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.ownMats.push(this.orbGlow.material);
    this.orbGlow.scale.setScalar(0.9);
    j.orb.add(this.orbGlow);
    o.traverse((m) => {
      if (m.isMesh) m.castShadow = !m.userData.isOutline;
    });
    mergeStaticParts(o);
  }

  think(dt) {
    const d = this.distToPlayer();
    this.faceTarget(5, dt);
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    let fwd = 0;
    if (d < 7) fwd = -1;
    else if (d > 13) fwd = 1;
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = rand(1.5, 3.2);
      this.strafeDir *= -1;
    }
    const side = this.strafeDir * 0.6;
    const vx = fx * fwd + -fz * side;
    const vz = fz * fwd + fx * side;
    const l = Math.hypot(vx, vz) || 1;
    this.velocity.x = damp(this.velocity.x, (vx / l) * this.speed, 4, dt);
    this.velocity.z = damp(this.velocity.z, (vz / l) * this.speed, 4, dt);
    this.moveSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.attackCd <= 0 && d < 16) this.startAttack(BOLT);
  }

  // ranged attacks don't consume melee tokens
  requestToken() {
    return true;
  }

  releaseToken() {}

  fireBolt() {
    const g = this.game;
    const from = new THREE.Vector3();
    this.j.orb.getWorldPosition(from);
    const p = g.player.position;
    // light lead on the player's movement
    const target = new THREE.Vector3(p.x + g.player.velocity.x * 0.25, p.y + 1.1, p.z + g.player.velocity.z * 0.25);
    const dir = target.sub(from).normalize();
    g.projectiles.fire(this, from, dir, 12.5, BOLT.damage);
  }

  animate(dt) {
    const j = this.j;
    const t = this.anim.t;
    this.position.y = damp(this.position.y, this.state === 'dead' ? 0 : 0.35 + Math.sin(t * 2.2) * 0.08, 6, dt);
    let arm = 0.6;
    let orbScale = 1;
    let lean = 0;
    if (this.state === 'windup' && this.attack) {
      const k = Ease.outCubic(clamp(this.attackT / this.attack.windup, 0, 1));
      arm = lerp(0.6, 1.4, k);
      orbScale = 1 + k * 1.2;
      lean = -0.15 * k;
    } else if (this.state === 'active' || this.state === 'recover') {
      arm = 1.2;
      orbScale = 0.4;
      lean = 0.12;
    } else if (this.state === 'stagger') {
      lean = -0.35;
    } else if (this.state === 'dead') {
      const k = clamp(this.deathT / 1.0, 0, 1);
      lean = -0.6 * k;
      this.object.scale.setScalar(this.cfg.scale * (1 - Ease.inQuad(k) * 0.95));
    }
    j.body.rotation.x = lean + this.moveSpeed * 0.02;
    j.armL.rotation.x = -arm;
    j.armR.rotation.x = -arm;
    j.orb.scale.setScalar(orbScale);
    j.orb.position.y = 1.0 + Math.sin(t * 4) * 0.04;
    if (this.state !== 'dead' && this.state !== 'spawn') {
      const sq = this.squash * 0.12;
      this.object.scale.set(1 + sq, 1 - sq, 1 + sq);
    }
  }
}
