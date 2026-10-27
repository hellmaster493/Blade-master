// Procedural animator for Kairo: locomotion synthesis, action-pose blending,
// two-bone IK for arms and legs, sword orientation from the swing plane, and springs
// for the coat panels and ponytail.
import * as THREE from 'three';
import { F, STANCE, createPose, lerpPose } from './pose.js';
import { DIMS } from './kairoModel.js';
import { solveTwoBone, quatFromYZ, Spring } from '../rig.js';
import { clamp, damp, smoothstep, wrapAngle, TAU } from '../../core/mathutils.js';

const _t = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _B = new THREE.Vector3();
const _Tg = new THREE.Vector3();
const _E = new THREE.Vector3();
const _Fp = new THREE.Vector3();
const _Sp = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qModel = new THREE.Quaternion();
const _qLower = new THREE.Quaternion();
const _qHand = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m3 = new THREE.Vector3();
const _shoulder = new THREE.Vector3();
const _sMouth = new THREE.Vector3();
const _sAxis = new THREE.Vector3();
const _sUp = new THREE.Vector3();
const _sHand = new THREE.Vector3();

const AIR_FIELDS = ['fRx', 'fRy', 'fRz', 'fRpitch', 'fLx', 'fLy', 'fLz', 'fLpitch', 'hipsY', 'spinePitch', 'sPitch', 'sPy', 'hLy', 'hLx', 'hLz'].map((k) => F[k]);

const TRAIL_POSE = Object.entries({
  sPhi: -2.45, sPitch: -0.55, sTilt: 0.1, sReach: 0.3, sRoll: Math.PI / 2, sPx: -0.15, sPy: 1.15, sPz: -0.04, eRx: -0.6, eRy: -0.6, eRz: -0.2,
}).map(([k, v]) => [F[k], v]);

export class KairoAnimator {
  constructor(model) {
    this.model = model;
    this.j = model.joints;
    this.loco = createPose(STANCE);
    this.final = createPose(STANCE);
    this.phase = 0;
    this.runW = 0;
    this.airW = 0;
    this.trailW = 0;
    this.time = 0;
    this.prevSpin = 0;
    this.spinRate = 0;
    this.panelSprings = model.panels.map(() => ({ x: new Spring(110, 11, -0.1), z: new Spring(90, 10, 0) }));
    this.tailX = new Spring(70, 8, 0.45);
    this.tailZ = new Spring(70, 8, 0);
    this.localVel = new THREE.Vector3();
    this.sheathe = 0; // 0..1: guides the blade into the saya (victory)
  }

  reset() {
    this.loco.set(createPose(STANCE));
    this.final.set(this.loco);
    this.phase = 0;
    this.runW = this.airW = this.trailW = 0;
    this.spinRate = 0;
    this.prevSpin = 0;
    for (const s of this.panelSprings) {
      s.x.reset(-0.1);
      s.z.reset(0);
    }
    this.tailX.reset(0.45);
    this.tailZ.reset(0);
  }

  /**
   * @param s.root       logical character root (position + facing yaw)
   * @param s.vel        world velocity
   * @param s.grounded   on the ground
   * @param s.landT      remaining landing-squash time
   * @param s.locked     lock-on active
   * @param s.action     Float32Array pose or null
   * @param s.weight     action blend weight 0..1
   */
  update(dt, s) {
    this.time += dt;
    const yaw = s.root.rotation.y;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    // world velocity -> model space (x = left, z = forward)
    const lv = this.localVel.set(s.vel.x * c - s.vel.z * sn, s.vel.y, s.vel.x * sn + s.vel.z * c);
    this.computeLocomotion(dt, lv, s);

    const out = this.final;
    if (s.action && s.weight > 0) {
      lerpPose(out, this.loco, s.action, clamp(s.weight, 0, 1));
    } else {
      out.set(this.loco);
    }
    this.apply(dt, out, lv);
  }

  computeLocomotion(dt, lv, s) {
    const p = this.loco;
    const speed = Math.hypot(lv.x, lv.z);
    this.runW = damp(this.runW, s.grounded ? smoothstep(0.4, 4.5, speed) : 0, 12, dt);
    this.airW = damp(this.airW, s.grounded ? 0 : 1, 14, dt);
    const fwd = speed > 0.1 ? lv.z / speed : 0;
    const side = speed > 0.1 ? lv.x / speed : 0;
    const trailTarget = this.runW * clamp(fwd * 1.4 - 0.3, 0, 1) * (s.locked ? 0.25 : 1);
    this.trailW = damp(this.trailW, trailTarget, 8, dt);

    // --- base stance + breathing
    p.set(this._stance || (this._stance = createPose(STANCE)));
    const breathe = Math.sin(this.time * 2.1);
    p[F.hipsY] += breathe * 0.006;
    p[F.chestPitch] += breathe * 0.015;
    p[F.sPy] += breathe * 0.008;

    // --- run cycle (phase locked to distance so planted feet don't slide)
    const cycleLen = 1.2 + speed * 0.18;
    if (s.grounded) this.phase = (this.phase + (speed * dt) / cycleLen) % 1;
    const rw = this.runW;
    if (rw > 0.001) {
      const dirX = speed > 0.1 ? lv.x / speed : 0;
      const dirZ = speed > 0.1 ? lv.z / speed : 1;
      const contact = 0.28;
      const half = (contact * cycleLen) / 2;
      const lift = 0.14 + Math.min(speed, 10) * 0.022;
      const lateral = 0.1 + 0.07 * Math.abs(dirX);
      const legs = [
        [F.fRx, F.fRy, F.fRz, F.fRpitch, F.fRyaw, -1, 0],
        [F.fLx, F.fLy, F.fLz, F.fLpitch, F.fLyaw, 1, 0.5],
      ];
      for (const [ix, iy, iz, ip, iyaw, sideSign, offset] of legs) {
        const ph = (this.phase + offset) % 1;
        let d;
        let h;
        let pitch;
        if (ph < contact) {
          d = half - (ph / contact) * 2 * half;
          h = 0;
          pitch = 0;
        } else {
          const u = (ph - contact) / (1 - contact);
          const e = u * u * (3 - 2 * u);
          d = -half + e * 2 * half;
          h = Math.sin(Math.PI * Math.pow(u, 0.75)) * lift;
          pitch = Math.sin(Math.PI * u) * 0.6 - 0.2;
        }
        const tx = sideSign * lateral + dirX * d;
        const tz = dirZ * d - 0.04 * fwd;
        p[ix] += (tx - p[ix]) * rw;
        p[iy] += (DIMS.ankleHeight + h - p[iy]) * rw;
        p[iz] += (tz - p[iz]) * rw;
        p[ip] += (pitch - p[ip]) * rw;
        p[iyaw] += (sideSign * 0.08 - p[iyaw]) * rw;
      }
      const bob = Math.cos(TAU * (2 * this.phase - contact));
      p[F.hipsY] += (-0.1 - 0.035 * bob - p[F.hipsY]) * rw;
      p[F.hipsYaw] += (Math.sin(TAU * this.phase) * 0.18 - p[F.hipsYaw]) * rw;
      p[F.chestYaw] += (-Math.sin(TAU * this.phase) * 0.24 - p[F.chestYaw]) * rw;
      p[F.spinePitch] += (0.1 + 0.3 * Math.max(0, fwd) * Math.min(1, speed / 8) - 0.12 * Math.max(0, -fwd) - p[F.spinePitch]) * rw;
      p[F.spineRoll] += (-0.12 * side - p[F.spineRoll]) * rw;
      p[F.kneeR] += (0.05 - p[F.kneeR]) * rw;
      p[F.kneeL] += (0.05 - p[F.kneeL]) * rw;
      // off hand swings with the stride
      const sw = Math.sin(TAU * this.phase);
      p[F.hLx] += (0.2 - p[F.hLx]) * rw;
      p[F.hLy] += (1.05 + 0.04 * Math.abs(sw) - p[F.hLy]) * rw;
      p[F.hLz] += (0.04 - 0.26 * sw - p[F.hLz]) * rw;
    }

    // --- sword trails behind while sprinting forward (classic swordsman run)
    const tw = this.trailW;
    if (tw > 0.001) {
      for (const [i, v] of TRAIL_POSE) p[i] += (v - p[i]) * tw;
    }

    // --- airborne: tuck while rising, reach down while falling
    const aw = this.airW;
    if (aw > 0.001) {
      const fall = clamp(0.5 - s.vel.y / 14, 0, 1);
      const air = this._air || (this._air = new Float32Array(16));
      const idx = AIR_FIELDS;
      air[0] = -0.12; air[1] = 0.42 - fall * 0.26; air[2] = 0.16 - fall * 0.04; air[3] = 0.35;
      air[4] = 0.13; air[5] = 0.3 - fall * 0.18; air[6] = -0.18 + fall * 0.08; air[7] = 0.5;
      air[8] = -0.02; air[9] = 0.18 - fall * 0.1; air[10] = 0.15; air[11] = 1.28;
      air[12] = 1.3; air[13] = 0.3; air[14] = 0.1;
      for (let i = 0; i < idx.length; i++) p[idx[i]] += (air[i] - p[idx[i]]) * aw;
    }

    // --- landing squash
    if (s.landT > 0) {
      const k = s.landT / 0.22;
      p[F.hipsY] -= 0.2 * k * k;
      p[F.spinePitch] += 0.18 * k * k;
      p[F.kneeR] += 0.2 * k;
      p[F.kneeL] += 0.2 * k;
    }
  }

  apply(dt, p, lv) {
    const j = this.j;
    const model = this.model.root;

    model.rotation.y = p[F.spin];
    const spin = p[F.spin];
    const spinDelta = wrapAngle(spin - this.prevSpin);
    this.prevSpin = spin;
    this.spinRate = damp(this.spinRate, dt > 0 ? spinDelta / dt : 0, 10, dt);

    // ---- FK torso
    const hips = j.get('hips');
    hips.position.set(p[F.hipsX], DIMS.hipsHeight + p[F.hipsY], p[F.hipsZ]);
    hips.rotation.set(p[F.hipsPitch], p[F.hipsYaw], p[F.hipsRoll]);
    j.get('spine').rotation.set(p[F.spinePitch], p[F.spineYaw], p[F.spineRoll]);
    j.get('chest').rotation.set(p[F.chestPitch], p[F.chestYaw], p[F.chestRoll]);
    // head keeps facing forward/target by countering torso twist and lean
    const twist = p[F.hipsYaw] + p[F.spineYaw] + p[F.chestYaw];
    const lean = p[F.hipsPitch] + p[F.spinePitch] + p[F.chestPitch];
    const hy = p[F.headYaw] - twist * 0.85;
    const hp = p[F.headPitch] - lean * 0.6;
    j.get('neck').rotation.set(hp * 0.35, hy * 0.35, p[F.headRoll] * 0.3);
    j.get('head').rotation.set(hp * 0.65, hy * 0.65, p[F.headRoll] * 0.7);

    model.updateWorldMatrix(true, true);
    model.getWorldQuaternion(_qModel);

    // ---- legs
    this.solveLeg('R', p[F.fRx], p[F.fRy], p[F.fRz], p[F.fRpitch], p[F.fRyaw], p[F.kneeR], -1);
    this.solveLeg('L', p[F.fLx], p[F.fLy], p[F.fLz], p[F.fLpitch], p[F.fLyaw], p[F.kneeL], 1);

    // ---- sword arm (swing plane)
    _e.set(p[F.sPitch], p[F.sYaw], p[F.sTilt], 'YXZ');
    _q.setFromEuler(_e);
    _Fp.set(0, 0, 1).applyQuaternion(_q);
    _Sp.set(1, 0, 0).applyQuaternion(_q);
    const phi = p[F.sPhi];
    const cphi = Math.cos(phi);
    const sphi = Math.sin(phi);
    _B.copy(_Fp).multiplyScalar(cphi).addScaledVector(_Sp, sphi);
    _Tg.copy(_Fp).multiplyScalar(-sphi).addScaledVector(_Sp, cphi);
    const roll = p[F.sRoll];
    _E.copy(_Tg).multiplyScalar(Math.cos(roll));
    _m3.crossVectors(_B, _Tg).multiplyScalar(Math.sin(roll));
    _E.add(_m3);
    // to world
    _B.applyQuaternion(_qModel);
    _E.applyQuaternion(_qModel);
    _t.set(p[F.sPx], p[F.sPy], p[F.sPz]);
    model.localToWorld(_t);
    _t.addScaledVector(_B, p[F.sReach]);
    if (this.sheathe > 0) this.applySheathe(_t, _B, _E);
    const shR = j.get('shoulderR');
    _shoulder.copy(shR.position).applyMatrix4(shR.parent.matrixWorld);
    _pole.set(p[F.eRx], p[F.eRy], p[F.eRz]).applyQuaternion(_qModel).add(_shoulder);
    solveTwoBone(shR, j.get('elbowR'), _t, _pole, DIMS.upperArm, DIMS.foreArm, _qLower);
    quatFromYZ(_B, _E, _qHand);
    j.get('handR').quaternion.copy(_qLower).invert().multiply(_qHand);

    // ---- off hand
    _t.set(p[F.hLx], p[F.hLy], p[F.hLz]);
    model.localToWorld(_t);
    const shL = j.get('shoulderL');
    _shoulder.copy(shL.position).applyMatrix4(shL.parent.matrixWorld);
    _pole.set(p[F.eLx], p[F.eLy], p[F.eLz]).applyQuaternion(_qModel).add(_shoulder);
    solveTwoBone(shL, j.get('elbowL'), _t, _pole, DIMS.upperArm, DIMS.foreArm);
    j.get('handL').rotation.set(-0.25, 0, 0.15);

    // ---- secondary motion
    this.updateSprings(dt, p, lv);
    model.updateWorldMatrix(false, true);
  }

  /** Blends the sword hand towards the saya mouth, blade aligned with the sheath, then slides it home. */
  applySheathe(hand, B, E) {
    const slot = this.model.sheathedSlot;
    slot.updateWorldMatrix(true, false);
    slot.getWorldPosition(_sMouth);
    slot.getWorldQuaternion(_q);
    _sAxis.set(0, 1, 0).applyQuaternion(_q);
    _sUp.set(0, 0, 1).applyQuaternion(_q);
    const s = this.sheathe;
    const approach = clamp(s / 0.7, 0, 1);
    const slide = clamp((s - 0.7) / 0.3, 0, 1);
    const offset = 1.12 - slide * (1.12 - 0.055);
    _sHand.copy(_sMouth).addScaledVector(_sAxis, -offset);
    hand.lerp(_sHand, approach);
    B.lerp(_sAxis, approach).normalize();
    E.lerp(_sUp, approach);
    E.addScaledVector(B, -E.dot(B)).normalize();
  }

  solveLeg(s, x, y, z, pitch, footYaw, kneeOut, sideSign) {
    const j = this.j;
    const model = this.model.root;
    const thigh = j.get('thigh' + s);
    _t.set(x, y, z);
    model.localToWorld(_t);
    // knee points forward along the foot direction, biased outward
    const fy = footYaw;
    _pole.set(x + Math.sin(fy) * 1 + sideSign * kneeOut, 0.55, z + Math.cos(fy) * 1);
    model.localToWorld(_pole);
    solveTwoBone(thigh, j.get('knee' + s), _t, _pole, DIMS.thigh, DIMS.shin, _qLower);
    _e.set(pitch, fy, 0, 'YXZ');
    _q.setFromEuler(_e).premultiply(_qModel);
    j.get('foot' + s).quaternion.copy(_qLower).invert().multiply(_q);
  }

  updateSprings(dt, p, lv) {
    const speed = Math.hypot(lv.x, lv.z);
    const spinK = Math.min(1.2, Math.abs(this.spinRate) * 0.06);
    const hipsWorldY = DIMS.hipsHeight + p[F.hipsY];
    const panels = this.model.panels;
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      const o = panel.userData.outward;
      const drag = Math.max(0, -(lv.x * o.x + lv.z * o.z));
      let target = -(0.08 + drag * 0.07 + speed * 0.018 + spinK + Math.max(0, lv.y) * 0.015);
      // keep the hem above the ground when crouching
      const len = 0.68;
      const room = (hipsWorldY + 0.07 - 0.03) / len;
      if (room < 1) target = Math.min(target, -Math.acos(clamp(room, -1, 1)));
      target = clamp(target, -1.45, 0);
      const latSpeed = lv.x * o.z - lv.z * o.x;
      const sp = this.panelSprings[i];
      panel.rotation.x = sp.x.update(target, dt);
      panel.rotation.z = sp.z.update(clamp(latSpeed * 0.03, -0.4, 0.4), dt);
      panel.rotation.y = panel.userData.yaw;
    }
    const tail = this.j.get('ponytail');
    tail.rotation.x = this.tailX.update(clamp(0.45 + lv.z * 0.06 + spinK * 0.8 + lv.y * 0.02, 0.2, 1.5), dt);
    tail.rotation.z = this.tailZ.update(clamp(-lv.x * 0.04 - this.spinRate * 0.01, -0.6, 0.6), dt);
  }
}
