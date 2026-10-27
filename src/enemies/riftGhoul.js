// Rift Ghoul: hunched melee enemy with a telegraphed claw swipe and a leaping pounce.
import * as THREE from 'three';
import { Enemy, enemyPart, joint } from './enemyBase.js';
import { mergeStaticParts } from '../characters/meshMerge.js';
import { COLORS } from '../fx/fx.js';
import { clamp, damp, lerp, Ease } from '../core/mathutils.js';

const SWIPE = {
  name: 'Claw Swipe', windup: 0.62, active: 0.14, recover: 0.55, range: 2.25, halfAngle: 0.95,
  damage: 55, knockback: 5, shape: 'sector',
  onActive: (e) => {
    const f = e.forward();
    e.velocity.x = f.x * 6;
    e.velocity.z = f.z * 6;
    e.slashFx(0.95);
  },
};

const POUNCE = {
  name: 'Pounce', windup: 0.72, active: 0.3, recover: 0.65, range: 1.9, halfAngle: 1.2,
  damage: 70, knockback: 7, lift: 4, shape: 'sector', trackUntil: 0.85,
  onActive: (e) => {
    const f = e.forward();
    const d = clamp(e.distToPlayer() - 1.2, 1, 6);
    e.velocity.x = f.x * d * 3.6;
    e.velocity.z = f.z * d * 3.6;
    e.velocity.y = 5.5;
    e.grounded = false;
  },
};

export class RiftGhoul extends Enemy {
  constructor(game, opts = {}) {
    super(game, {
      type: 'ghoul',
      name: opts.passive ? 'TRAINING SHADE' : 'RIFT GHOUL',
      hp: opts.hp || 200,
      radius: 0.5,
      height: 1.75,
      speed: 4.4,
      scale: 1,
      cdMin: 1.3,
      cdMax: 2.6,
      engageRange: 1.7,
      attackRange: 5.5,
      passive: opts.passive,
    });
    this.build();
  }

  forward() {
    return new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  build() {
    const body = this.mat(this.passive ? 0x3a3550 : 0x2a2140);
    const bone = this.mat(0xd9d0bf);
    const dark = this.mat(0x17121f);
    const glow = this.glowMat(this.passive ? 0x7fd0ff : 0xc54bff);
    const o = this.object;
    const j = (this.j = {});
    j.hips = joint(o, 0, 0.82, 0);
    enemyPart(j.hips, new THREE.SphereGeometry(0.2, 12, 10), body, { s: [1.15, 0.8, 0.95] });
    j.torso = joint(j.hips, 0, 0.08, 0);
    j.torso.rotation.x = 0.5;
    enemyPart(j.torso, new THREE.CapsuleGeometry(0.22, 0.3, 4, 12), body, { p: [0, 0.3, 0], s: [1.15, 1, 0.82] });
    // jagged rift crystals along the spine
    for (let i = 0; i < 3; i++) {
      enemyPart(j.torso, new THREE.ConeGeometry(0.06, 0.3 - i * 0.05, 4), glow, { p: [0, 0.48 - i * 0.16, -0.16], r: [-0.7, 0, 0], outline: 0.012 });
    }
    // glowing cracks
    enemyPart(j.torso, new THREE.BoxGeometry(0.04, 0.25, 0.02), glow, { p: [0.08, 0.32, 0.19], r: [0, 0, 0.4], outline: 0 });
    enemyPart(j.torso, new THREE.BoxGeometry(0.03, 0.18, 0.02), glow, { p: [-0.1, 0.25, 0.19], r: [0, 0, -0.5], outline: 0 });
    j.head = joint(j.torso, 0, 0.62, 0.08);
    j.head.rotation.x = -0.45;
    enemyPart(j.head, new THREE.SphereGeometry(0.17, 14, 12), body, { s: [1, 0.88, 1.15] });
    enemyPart(j.head, new THREE.BoxGeometry(0.2, 0.07, 0.18), dark, { p: [0, -0.1, 0.07] });
    for (const sx of [1, -1]) {
      enemyPart(j.head, new THREE.SphereGeometry(0.03, 8, 6), glow, { p: [sx * 0.07, 0.02, 0.16], s: [1.3, 0.7, 0.6], outline: 0 });
      enemyPart(j.head, new THREE.ConeGeometry(0.045, 0.32, 6), bone, { p: [sx * 0.1, 0.14, -0.04], r: [-0.9, 0, sx * -0.5], outline: 0.012 });
    }
    for (const side of [1, -1]) {
      const sh = joint(j.torso, side * 0.3, 0.45, 0);
      sh.rotation.z = side * 0.2;
      enemyPart(sh, new THREE.CapsuleGeometry(0.075, 0.28, 4, 8), body, { p: [0, -0.2, 0] });
      const el = joint(sh, 0, -0.4, 0);
      enemyPart(el, new THREE.CapsuleGeometry(0.068, 0.28, 4, 8), body, { p: [0, -0.2, 0] });
      for (let c = -1; c <= 1; c++) {
        enemyPart(el, new THREE.ConeGeometry(0.022, 0.16, 4), bone, { p: [c * 0.04, -0.45, 0.02], r: [Math.PI + 0.25, 0, c * 0.15], outline: 0.008 });
      }
      j[side > 0 ? 'armL' : 'armR'] = sh;
      j[side > 0 ? 'elbowL' : 'elbowR'] = el;
      const th = joint(j.hips, side * 0.14, -0.05, 0);
      enemyPart(th, new THREE.CapsuleGeometry(0.095, 0.26, 4, 8), body, { p: [0, -0.2, 0] });
      const kn = joint(th, 0, -0.4, 0);
      enemyPart(kn, new THREE.CapsuleGeometry(0.075, 0.26, 4, 8), dark, { p: [0, -0.18, 0] });
      enemyPart(kn, new THREE.BoxGeometry(0.12, 0.06, 0.24), dark, { p: [0, -0.38, 0.06] });
      j[side > 0 ? 'thighL' : 'thighR'] = th;
      j[side > 0 ? 'kneeL' : 'kneeR'] = kn;
    }
    this.object.traverse((m) => {
      if (m.isMesh) m.castShadow = !m.userData.isOutline;
    });
    mergeStaticParts(this.object);
  }

  chooseAttack(d) {
    if (d > 3.2) {
      if (d < 5.5 && Math.random() < 0.6) this.startAttack(POUNCE);
    } else {
      this.startAttack(SWIPE);
    }
    if (!this.attack) this.releaseToken();
  }

  think(dt) {
    if (this.passive && !this.game.trainingAggro) {
      this.idle(dt);
      this.faceTarget(3, dt);
      return;
    }
    const wasPassive = this.passive;
    if (wasPassive) this.passive = false;
    super.think(dt);
    if (wasPassive) this.passive = true;
  }

  slashFx(halfAngle) {
    const g = this.game;
    const f = this.forward();
    const s = new THREE.Vector3(f.z, 0, -f.x);
    const origin = new THREE.Vector3(this.position.x, this.position.y + 1.1, this.position.z);
    g.fx.slash({ origin, F: f, S: s.negate(), a0: halfAngle, a1: -halfAngle, radius: 1.9, thickness: 0.4, life: 0.22, sweep: 0.4, body: 0xa04bff, core: 0xffd8ff, opacity: 0.7 });
  }

  animate(dt) {
    const j = this.j;
    const t = this.anim.t;
    const spd = clamp(this.moveSpeed / this.speed, 0, 1.4);
    this.walkPhase += dt * (1.2 + this.moveSpeed * 0.9);
    const ph = this.walkPhase * Math.PI * 2;
    let armR = Math.sin(ph) * 0.5 * spd + 0.15;
    let armL = -Math.sin(ph) * 0.5 * spd + 0.15;
    let elbow = -0.5;
    let torsoX = 0.5 + Math.sin(t * 2) * 0.03;
    let torsoY = 0;
    let hipsY = 0.82 + Math.abs(Math.sin(ph)) * 0.05 * spd;
    let thighR = Math.sin(ph) * 0.65 * spd;
    let thighL = -Math.sin(ph) * 0.65 * spd;
    let kneeR = Math.max(0, Math.sin(ph + 1.2)) * 0.9 * spd;
    let kneeL = Math.max(0, Math.sin(ph + 1.2 + Math.PI)) * 0.9 * spd;
    let headX = -0.45;
    const def = this.attack;
    if (this.state === 'windup' && def) {
      const k = Ease.outCubic(clamp(this.attackT / def.windup, 0, 1));
      if (def === POUNCE) {
        hipsY -= 0.25 * k;
        torsoX = lerp(torsoX, 0.9, k);
        armR = armL = lerp(armR, 1.9, k);
        thighR = thighL = lerp(0, -0.9, k);
        kneeR = kneeL = lerp(0, 1.5, k);
      } else {
        armR = lerp(armR, 2.6, k);
        armL = lerp(armL, 0.6, k);
        torsoY = 0.5 * k;
        torsoX = lerp(torsoX, 0.25, k);
        elbow = lerp(-0.5, -1.2, k);
      }
      // trembling anticipation
      torsoY += Math.sin(t * 50) * 0.03 * k;
    } else if (this.state === 'active' && def) {
      const k = Ease.outExpo(clamp((this.attackT - def.windup) / def.active, 0, 1));
      if (def === POUNCE) {
        torsoX = 0.6;
        armR = armL = lerp(1.9, -1.4, k);
        elbow = -0.2;
      } else {
        // overhand claw: up-back, over the top, down in front
        armR = lerp(2.6, 4.9, k);
        torsoY = lerp(0.5, -0.6, k);
        elbow = lerp(-1.2, -0.1, k);
        torsoX = 0.6;
      }
    } else if (this.state === 'recover' && def) {
      const k = Ease.inOutQuad(clamp((this.attackT - def.windup - def.active) / def.recover, 0, 1));
      armR = lerp(def === POUNCE ? -1.4 : 4.9 - Math.PI * 2, armR, k);
      armL = lerp(def === POUNCE ? -1.4 : armL, armL, k);
      torsoY = lerp(-0.5, 0, k);
    } else if (this.state === 'stagger') {
      const k = Math.min(1, this.stateT / 0.08);
      torsoX = lerp(torsoX, -0.15, k);
      headX = -0.1;
      armR = armL = 0.9;
      elbow = -0.3;
    } else if (this.state === 'dead') {
      const k = Ease.inOutQuad(clamp(this.deathT / 0.7, 0, 1));
      hipsY = lerp(0.82, 0.25, k);
      torsoX = lerp(0.5, 1.4, k);
      armR = armL = lerp(0.2, -1.4, k);
      thighR = thighL = lerp(0, -1.2, k);
      kneeR = kneeL = lerp(0, 2.0, k);
      const sink = clamp((this.deathT - 0.7) / 0.6, 0, 1);
      this.object.scale.setScalar(this.cfg.scale * (1 - sink * 0.9));
      this.object.position.y = -sink * 0.6;
    }
    // hit squash
    if (this.state !== 'dead' && this.state !== 'spawn') {
      const sq = this.squash * 0.12;
      this.object.scale.set(this.cfg.scale * (1 + sq), this.cfg.scale * (1 - sq), this.cfg.scale * (1 + sq));
    }
    j.hips.position.y = hipsY;
    j.torso.rotation.set(torsoX, torsoY, 0);
    j.head.rotation.x = headX;
    j.armR.rotation.x = armR;
    j.armL.rotation.x = armL;
    j.elbowR.rotation.x = elbow;
    j.elbowL.rotation.x = elbow;
    j.thighR.rotation.x = thighR;
    j.thighL.rotation.x = thighL;
    j.kneeR.rotation.x = kneeR;
    j.kneeL.rotation.x = kneeL;
    // keep feet roughly on the ground while airborne/knocked
    if (!this.grounded) {
      j.thighR.rotation.x = j.thighL.rotation.x = -0.6;
      j.kneeR.rotation.x = j.kneeL.rotation.x = 1.0;
    }
  }
}

export const GHOUL_GLOW = COLORS.violet;
