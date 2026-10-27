// GORVATH, THE RIFT WARDEN — boss with poise, three telegraphed attacks and an enraged phase 2.
import * as THREE from 'three';
import { Enemy, enemyPart, joint } from './enemyBase.js';
import { mergeStaticParts } from '../characters/meshMerge.js';
import { COLORS } from '../fx/fx.js';
import { clamp, damp, lerp, Ease } from '../core/mathutils.js';

const TAU = Math.PI * 2;

function makeAttacks(speedMul = 1) {
  return {
    cleave: {
      name: 'Rift Cleave', windup: 0.9 * speedMul, active: 0.18, recover: 0.75 * speedMul, range: 5.0, halfAngle: 1.3,
      damage: 120, knockback: 9, shape: 'sector', trackSpeed: 3,
      onActive: (e) => e.cleaveFx(),
    },
    slam: {
      name: 'Ground Slam', windup: 1.1 * speedMul, active: 0.12, recover: 1.0 * speedMul, shape: 'circle', radius: 4.2, offset: 3.0,
      damage: 150, knockback: 10, lift: 5, trackSpeed: 2.5, trackUntil: 0.6,
      onActive: (e) => e.slamFx(),
    },
    charge: {
      name: 'Rift Charge', windup: 0.85 * speedMul, active: 0.7, recover: 0.85 * speedMul, range: 2.8, halfAngle: 1.1,
      damage: 110, knockback: 12, lift: 3, shape: 'sector', telegraphRange: 13, trackUntil: 0.75, trackSpeed: 4,
      onActive: (e) => e.game.audio.play('dash'),
      onActiveUpdate: (e, dt) => e.chargeStep(dt),
    },
  };
}

export class RiftWarden extends Enemy {
  constructor(game) {
    super(game, {
      type: 'boss', name: 'GORVATH, THE RIFT WARDEN', isBoss: true, hp: 3200, radius: 1.25, height: 4.2,
      speed: 3.6, scale: 2.2, poise: 320, breakStagger: 1.6, kbResist: 0.85, cdMin: 1.1, cdMax: 2.1,
      engageRange: 3.4, attackRange: 12, spawnTime: 1.6, deathTime: 2.4,
    });
    this.attacks = makeAttacks(1);
    this.phase = 1;
    this.roarT = 0;
    this.build();
  }

  build() {
    const armor = this.mat(0x2b2634);
    const plate = this.mat(0x433c52);
    const hide = this.mat(0x1b1522);
    const bone = this.mat(0xcfc4b0);
    const blade = this.mat(0x5a5468);
    this.coreMat = this.glowMat(0xff2a6a);
    const eye = this.glowMat(0xff4060);
    const glow = this.glowMat(0xc54bff);
    const o = this.object;
    const j = (this.j = {});
    j.hips = joint(o, 0, 0.92, 0);
    enemyPart(j.hips, new THREE.CylinderGeometry(0.3, 0.38, 0.35, 8), armor, { p: [0, -0.05, 0], outline: 0.015 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      enemyPart(j.hips, new THREE.BoxGeometry(0.2, 0.38, 0.04), plate, { p: [Math.sin(a) * 0.36, -0.28, Math.cos(a) * 0.36], r: [0.25, a, 0], outline: 0.012 });
    }
    j.torso = joint(j.hips, 0, 0.12, 0);
    j.torso.rotation.x = 0.12;
    enemyPart(j.torso, new THREE.CapsuleGeometry(0.34, 0.36, 4, 12), hide, { p: [0, 0.4, 0], s: [1.25, 1, 0.85] });
    enemyPart(j.torso, new THREE.BoxGeometry(0.62, 0.42, 0.18), armor, { p: [0, 0.5, 0.2], r: [-0.1, 0, 0], outline: 0.015 });
    this.core = enemyPart(j.torso, new THREE.IcosahedronGeometry(0.1, 1), this.coreMat, { p: [0, 0.5, 0.31], outline: 0 });
    this.core.userData.noMerge = true;
    // rift crystals on the back
    for (let i = 0; i < 4; i++) {
      enemyPart(j.torso, new THREE.ConeGeometry(0.08, 0.45 - i * 0.06, 5), glow, { p: [(i % 2 ? 1 : -1) * 0.12, 0.75 - i * 0.15, -0.28], r: [-0.8, 0, (i % 2 ? 1 : -1) * 0.3], outline: 0.012 });
    }
    j.head = joint(j.torso, 0, 0.88, 0.05);
    enemyPart(j.head, new THREE.BoxGeometry(0.3, 0.28, 0.32), armor, { p: [0, 0.08, 0], outline: 0.014 });
    enemyPart(j.head, new THREE.BoxGeometry(0.22, 0.04, 0.02), eye, { p: [0, 0.1, 0.165], outline: 0 });
    for (const sx of [1, -1]) {
      enemyPart(j.head, new THREE.ConeGeometry(0.07, 0.55, 6), bone, { p: [sx * 0.2, 0.28, -0.02], r: [0.5, 0, sx * -0.7], outline: 0.012 });
    }
    for (const side of [1, -1]) {
      const sh = joint(j.torso, side * 0.5, 0.68, 0);
      enemyPart(sh, new THREE.SphereGeometry(0.22, 10, 8), plate, { p: [side * 0.04, 0.05, 0], s: [1.2, 0.9, 1.1], outline: 0.015 });
      enemyPart(sh, new THREE.ConeGeometry(0.05, 0.3, 5), bone, { p: [side * 0.12, 0.25, 0], r: [0, 0, side * -0.4], outline: 0.01 });
      enemyPart(sh, new THREE.CapsuleGeometry(0.12, 0.3, 4, 8), hide, { p: [0, -0.25, 0] });
      const el = joint(sh, 0, -0.5, 0);
      enemyPart(el, new THREE.CapsuleGeometry(0.11, 0.3, 4, 8), armor, { p: [0, -0.22, 0], outline: 0.014 });
      enemyPart(el, new THREE.BoxGeometry(0.2, 0.16, 0.2), plate, { p: [0, -0.48, 0], outline: 0.012 });
      j[side > 0 ? 'armL' : 'armR'] = sh;
      j[side > 0 ? 'elbowL' : 'elbowR'] = el;
      const th = joint(j.hips, side * 0.2, -0.1, 0);
      enemyPart(th, new THREE.CapsuleGeometry(0.14, 0.3, 4, 8), hide, { p: [0, -0.22, 0] });
      const kn = joint(th, 0, -0.42, 0);
      enemyPart(kn, new THREE.CapsuleGeometry(0.12, 0.28, 4, 8), armor, { p: [0, -0.2, 0], outline: 0.014 });
      enemyPart(kn, new THREE.BoxGeometry(0.22, 0.1, 0.34), plate, { p: [0, -0.4, 0.06], outline: 0.012 });
      j[side > 0 ? 'thighL' : 'thighR'] = th;
      j[side > 0 ? 'kneeL' : 'kneeR'] = kn;
    }
    // the Rift Cleaver, held in the right hand pointing forward/down
    const cleaver = joint(j.elbowR, 0, -0.5, 0.0);
    enemyPart(cleaver, new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), hide, { p: [0, 0, 0], r: [Math.PI / 2, 0, 0], outline: 0.01 });
    enemyPart(cleaver, new THREE.BoxGeometry(0.06, 0.42, 1.5), blade, { p: [0, -0.12, 0.95], outline: 0.014 });
    enemyPart(cleaver, new THREE.BoxGeometry(0.07, 0.06, 1.45), glow, { p: [0, -0.34, 0.95], outline: 0 });
    for (let i = 0; i < 4; i++) {
      enemyPart(cleaver, new THREE.ConeGeometry(0.05, 0.16, 4), blade, { p: [0, 0.12, 0.45 + i * 0.32], r: [0, 0, 0], outline: 0.008 });
    }
    j.cleaver = cleaver;
    o.traverse((m) => {
      if (m.isMesh) m.castShadow = !m.userData.isOutline;
    });
    mergeStaticParts(o);
  }

  receiveDamage(hit) {
    if (this.roarT > 0 && this.state !== 'dead') {
      // roaring: still takes damage, ignores stagger
      hit = { ...hit, stagger: 0 };
    }
    const res = super.receiveDamage(hit);
    if (res.applied && !res.killed && this.phase === 1 && this.hp <= this.maxHp * 0.5) this.enterPhase2();
    return res;
  }

  enterPhase2() {
    this.phase = 2;
    this.attacks = makeAttacks(0.8);
    this.cfg.cdMin = 0.8;
    this.cfg.cdMax = 1.6;
    this.speed = 4.2;
    this.cancelAttack();
    this.state = 'chase';
    this.roarT = 1.4;
    this.game.audio.play('roar');
    this.game.shake(0.5);
    this.game.fx.ring({ position: this.position, radius: 9, life: 0.9, width: 0.1, inner: COLORS.violet, outer: COLORS.riftPink });
    this.game.events.emit('bossPhase', { boss: this, phase: 2 });
    this.game.director.summonAdds(this, 2);
  }

  think(dt) {
    if (this.roarT > 0) {
      this.roarT -= dt;
      this.idle(dt);
      this.faceTarget(2, dt);
      return;
    }
    const d = this.distToPlayer();
    this.faceTarget(3.2, dt);
    let speed = 0;
    if (d > this.cfg.engageRange + 0.4) speed = this.speed;
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    this.velocity.x = damp(this.velocity.x, fx * speed, 5, dt);
    this.velocity.z = damp(this.velocity.z, fz * speed, 5, dt);
    this.moveSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.attackCd > 0) return;
    const r = Math.random();
    if (d < 5.2) this.startAttack(r < 0.55 ? this.attacks.cleave : this.attacks.slam);
    else if (d < 7.5 && r < 0.4) this.startAttack(this.attacks.slam);
    else if (d < 14 && r < 0.6) this.startAttack(this.attacks.charge);
    else this.attackCd = 0.4;
  }

  startAttack(def) {
    super.startAttack(def);
    if (def === this.attacks.charge && this.telegraph) {
      // long lane telegraph for the charge
      this.telegraph.mesh.scale.setScalar(def.telegraphRange);
      this.telegraph.mat.uniforms.uHalf.value = 0.12;
    }
  }

  updateAttack(dt) {
    super.updateAttack(dt);
    if (this.telegraph && this.attack === this.attacks.charge) {
      this.telegraph.mesh.scale.setScalar(this.attacks.charge.telegraphRange);
    }
  }

  chargeStep() {
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    this.velocity.x = fx * 17;
    this.velocity.z = fz * 17;
    if (Math.random() < 0.5) this.game.fx.dust(this.position, { count: 2, radius: 0.8, speed: 2, alpha: 0.3 });
    // stop at the arena edge
    const r = Math.hypot(this.position.x, this.position.z);
    if (r > 23.5 && this.position.x * fx + this.position.z * fz > 0) {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
  }

  cleaveFx() {
    const f = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    const s = new THREE.Vector3(f.z, 0, -f.x).negate();
    const origin = new THREE.Vector3(this.position.x, this.position.y + 2.2, this.position.z);
    this.game.fx.slash({ origin, F: f, S: s, a0: -1.3, a1: 1.3, radius: 4.4, thickness: 1.0, life: 0.3, sweep: 0.35, body: 0xa04bff, core: 0xffd8ff, accent: 1, accentColor: 0xff3a6a, opacity: 0.85 });
    this.game.shake(0.2);
  }

  slamFx() {
    const c = this.attackCenter(new THREE.Vector3(), this.attack);
    const fx = this.game.fx;
    fx.ring({ position: c, radius: 5.2, life: 0.55, width: 0.18, inner: COLORS.violet, outer: COLORS.riftPink });
    fx.debris(c, { count: 18, power: 8, size: 0.14 });
    fx.dust(c, { count: 18, radius: 1.8, speed: 6, alpha: 0.4, size: 0.7 });
    fx.sparks(c, { dir: new THREE.Vector3(0, 1, 0), count: 24, speed: 9, colors: [COLORS.violet, COLORS.riftPink], size: 0.08 });
    this.game.audio.play('slam');
    this.game.shake(0.45);
  }

  animate(dt) {
    const j = this.j;
    const t = this.anim.t;
    const spd = clamp(this.moveSpeed / 4, 0, 1.6);
    this.walkPhase += dt * (0.7 + this.moveSpeed * 0.35);
    const ph = this.walkPhase * TAU;
    let armR = 0.55 + Math.sin(ph) * 0.25 * spd;
    let armRz = 0;
    let armL = 0.2 - Math.sin(ph) * 0.4 * spd;
    let armLz = 0.15;
    let elbowR = -0.9;
    let elbowL = -0.4;
    let torsoX = 0.12 + Math.sin(t * 1.6) * 0.03;
    let torsoY = 0;
    let hipsY = 0.92 + Math.abs(Math.sin(ph)) * 0.04 * spd;
    let thighR = Math.sin(ph) * 0.5 * spd;
    let thighL = -Math.sin(ph) * 0.5 * spd;
    let kneeR = Math.max(0, Math.sin(ph + 1.2)) * 0.7 * spd;
    let kneeL = Math.max(0, Math.sin(ph + 1.2 + Math.PI)) * 0.7 * spd;
    const def = this.attack;
    const A = this.attacks;
    if (def && (this.state === 'windup' || this.state === 'active' || this.state === 'recover')) {
      const wk = Ease.outCubic(clamp(this.attackT / def.windup, 0, 1));
      const ak = Ease.outExpo(clamp((this.attackT - def.windup) / def.active, 0, 1));
      const rk = Ease.inOutQuad(clamp((this.attackT - def.windup - def.active) / def.recover, 0, 1));
      const shake = this.state === 'windup' ? Math.sin(t * 45) * 0.03 * wk : 0;
      if (def === A.cleave) {
        const wind = { armR: 2.0, armRz: -1.2, torsoY: 0.8, elbowR: -0.3 };
        const hitP = { armR: 1.5, armRz: 0.9, torsoY: -0.9, elbowR: -0.1 };
        const k = this.state === 'windup' ? 0 : this.state === 'active' ? ak : 1;
        armR = lerp(lerp(armR, wind.armR, wk), hitP.armR, k);
        armRz = lerp(lerp(0, wind.armRz, wk), hitP.armRz, k);
        torsoY = lerp(lerp(0, wind.torsoY, wk), hitP.torsoY, k) + shake;
        elbowR = lerp(lerp(elbowR, wind.elbowR, wk), hitP.elbowR, k);
        if (this.state === 'recover') {
          armR = lerp(hitP.armR, 0.55, rk);
          armRz = lerp(hitP.armRz, 0, rk);
          torsoY = lerp(hitP.torsoY, 0, rk);
        }
      } else if (def === A.slam) {
        const k = this.state === 'windup' ? 0 : this.state === 'active' ? ak : 1;
        armR = lerp(lerp(armR, 3.0, wk), 5.0, k);
        armL = lerp(lerp(armL, 3.0, wk), 5.0, k);
        elbowR = lerp(-0.9, -0.2, wk);
        torsoX = lerp(lerp(torsoX, -0.25, wk), 0.55, k) + shake;
        hipsY -= 0.2 * k;
        if (this.state === 'recover') {
          armR = lerp(5.0 - TAU, 0.55, rk);
          armL = lerp(5.0 - TAU, 0.2, rk);
          torsoX = lerp(0.55, 0.12, rk);
        }
      } else if (def === A.charge) {
        torsoX = lerp(torsoX, 0.55, wk);
        armR = lerp(armR, -0.9, wk);
        elbowR = lerp(elbowR, -0.4, wk);
        armL = lerp(armL, 1.1, wk);
        hipsY -= 0.12 * wk;
        if (this.state === 'active') {
          thighR = Math.sin(t * 22) * 0.8;
          thighL = -thighR;
          kneeR = Math.max(0, Math.sin(t * 22 + 1.2)) * 1.0;
          kneeL = Math.max(0, Math.sin(t * 22 + 1.2 + Math.PI)) * 1.0;
        }
        if (this.state === 'recover') {
          torsoX = lerp(0.55, 0.12, rk);
          armR = lerp(-0.9, 0.55, rk);
        }
      }
    } else if (this.state === 'stagger') {
      torsoX = -0.25 + Math.sin(t * 6) * 0.05;
      armR = 0.2;
      armL = 0.1;
      hipsY -= 0.12;
      kneeR = kneeL = 0.4;
      thighR = thighL = -0.2;
    } else if (this.roarT > 0) {
      torsoX = -0.35;
      armR = armL = 1.8;
      armRz = -0.8;
      armLz = 0.8;
    } else if (this.state === 'dead') {
      const k = Ease.inOutQuad(clamp(this.deathT / 1.4, 0, 1));
      hipsY = lerp(0.92, 0.35, k);
      torsoX = lerp(0.12, 1.1, k);
      kneeR = kneeL = lerp(0, 2.0, k);
      thighR = thighL = lerp(0, -1.1, k);
      armR = armL = lerp(0.4, -0.8, k);
      const sink = clamp((this.deathT - 1.4) / 1.0, 0, 1);
      this.object.position.y = -sink * 1.2;
      if (Math.random() < 0.4) this.game.fx.motes(this.position.clone().setY(1.5), { count: 2, spread: 1.2, rise: 2.5, colors: [COLORS.violet, COLORS.riftPink], size: 0.1, life: 1.2 });
    }
    j.hips.position.y = hipsY;
    j.torso.rotation.set(torsoX, torsoY, 0);
    j.armR.rotation.set(armR, 0, armRz);
    j.armL.rotation.set(armL, 0, armLz);
    j.elbowR.rotation.x = elbowR;
    j.elbowL.rotation.x = elbowL;
    j.thighR.rotation.x = thighR;
    j.thighL.rotation.x = thighL;
    j.kneeR.rotation.x = kneeR;
    j.kneeL.rotation.x = kneeL;
    // pulsing core, brighter when enraged
    const pulse = 0.6 + 0.4 * Math.sin(t * (this.phase === 2 ? 9 : 4));
    this.coreMat.color.setRGB(1.6 * pulse + 0.4, 0.2 * pulse, 0.6 * pulse);
    this.core.scale.setScalar(1 + pulse * 0.25);
    if (this.state !== 'dead' && this.state !== 'spawn') {
      const sq = this.squash * 0.05;
      const s = this.cfg.scale;
      this.object.scale.set(s * (1 + sq), s * (1 - sq), s * (1 + sq));
    }
  }
}
