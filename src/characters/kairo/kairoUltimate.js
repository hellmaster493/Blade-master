// ULTIMATE — CRIMSON TEMPEST.
// Stages: Focus -> Flash Step -> Thousand Cuts -> Final Sever -> Impact -> Recovery.
// Damage is applied only through timed hit windows and the normal combat rules.
// A hard watchdog guarantees the sequence always ends, and abort() cleans everything up.
import * as THREE from 'three';
import { STANCE, F, buildKeys, sampleKeys, lerpPose, createPose } from './pose.js';
import { HitTracker } from '../../combat/combat.js';
import { DAMAGE, ARENA } from '../../config.js';
import { COLORS } from '../../fx/fx.js';
import { clamp, Ease, approachAngle, rand } from '../../core/mathutils.js';

const PI = Math.PI;

export const ULT_TIMING = {
  focusEnd: 0.75,
  flashEnd: 0.98,
  cutStart: 0.98,
  cutLen: 0.15,
  cuts: 8,
  severWindup: 2.18,
  severHit: 2.46,
  severEnd: 2.58,
  impact: 2.58,
  recoverStart: 2.75,
  invulnEnd: 3.25,
  end: 3.45,
  watchdog: 5.0,
};

const T = ULT_TIMING;

// Thousand Cuts: alternating swing planes so each cut reads as a distinct slash.
const CUT_TILTS = [0.1, 0.85, -0.7, 1.35, 0.35, -1.15, 0.0, 1.0];

function buildUltimateKeys() {
  const list = [
    { t: 0 },
    // Focus: low iaido-style stance, blade drawn back, off hand forward
    {
      t: 0.32, ease: 'outCubic',
      hipsY: -0.3, spinePitch: 0.32, chestYaw: -0.5, hipsYaw: -0.6, spineYaw: -0.15,
      sPhi: -2.6, sPitch: 0.35, sTilt: -0.1, sRoll: -PI / 2, sReach: 0.36, sPy: 1.05, sPx: -0.1, sPz: 0.0,
      fRz: 0.36, fLz: -0.36, fRx: -0.2, fLx: 0.22, kneeR: 0.3, kneeL: 0.45,
      hLx: 0.08, hLy: 1.28, hLz: 0.42, eLx: 0.7, eLy: -0.3, eLz: -0.3, headPitch: -0.12,
    },
    { t: T.focusEnd, ease: 'inOutQuad', hipsY: -0.35, spinePitch: 0.38 },
    // Flash step: forward lean, blade trailing
    { t: T.focusEnd + 0.08, ease: 'outQuad', spinePitch: 0.6, hipsY: -0.2, fRz: 0.4, fLz: -0.5, fLy: 0.25, sPhi: -2.7, hLz: -0.2, hLx: 0.3 },
  ];
  for (let i = 0; i < T.cuts; i++) {
    const t0 = T.cutStart + i * T.cutLen;
    const even = i % 2 === 0;
    const tilt = CUT_TILTS[i];
    list.push({
      t: t0 + 0.035, ease: 'outQuad',
      sTilt: tilt, sPitch: 0.05, sPhi: even ? -2.0 : 2.0, sRoll: even ? -0.2 : -PI + 0.2, sReach: 0.44, sPx: -0.04, sPy: 1.28, sPz: 0.05,
      chestYaw: even ? -0.6 : 0.6, spineYaw: even ? -0.2 : 0.2, hipsYaw: even ? -0.3 : 0.25, hipsY: -0.2, spinePitch: 0.2,
      fRz: 0.3, fLz: -0.3, fLy: 0.065, fRy: 0.065, hLx: 0.3, hLy: 1.2, hLz: 0.1,
    });
    list.push({
      t: t0 + 0.11, ease: 'slash',
      sPhi: even ? 1.9 : -1.9, sRoll: even ? 0 : -PI, chestYaw: even ? 0.6 : -0.6, spineYaw: even ? 0.2 : -0.2, hipsYaw: even ? 0.25 : -0.3,
    });
  }
  list.push(
    // Final Sever wind-up: blade raised high overhead in a vertical plane
    {
      t: T.severHit - 0.06, ease: 'outCubic',
      sTilt: PI / 2, sPitch: 0.0, sPhi: 2.55, sRoll: -PI, sReach: 0.42, sPx: -0.06, sPy: 1.45, sPz: 0.05,
      hipsY: -0.1, spinePitch: -0.18, chestPitch: -0.05, chestYaw: 0.1, spineYaw: 0, hipsYaw: -0.1,
      fRz: 0.32, fLz: -0.32, hLx: 0.15, hLy: 1.55, hLz: 0.1, headPitch: 0.05,
    },
    { t: T.severHit, ease: 'linear', sPhi: 2.7 },
    // the cut: down through the target
    { t: T.severEnd, ease: 'slash', sPhi: -0.95, hipsY: -0.4, spinePitch: 0.55, chestPitch: 0.2, hLx: 0.35, hLy: 1.0, hLz: -0.2, fRz: 0.45 },
    // anime freeze-frame after the cut
    { t: 2.95, ease: 'linear', sPhi: -1.0, hipsY: -0.42, spinePitch: 0.58 },
    // chiburi flick, then back to stance
    { t: 3.1, ease: 'outQuad', sTilt: 0.0, sPhi: -1.4, sPitch: 0.7, sRoll: -PI / 2, sPy: 1.2, hipsY: -0.15, spinePitch: 0.2, chestPitch: 0.04 },
    { t: T.end, ease: 'inOutQuad', ...STANCE },
  );
  return buildKeys(STANCE, list);
}

const KEYS = buildUltimateKeys();

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _p = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _n = new THREE.Vector3();

export class CrimsonTempest {
  constructor(kairo) {
    this.k = kairo;
    this.active = false;
    this.t = 0;
    this.prevT = 0;
    this.gravityScale = 0;
    this.cutTrackers = [];
    for (let i = 0; i < T.cuts; i++) this.cutTrackers.push(new HitTracker());
    this.severTracker = new HitTracker();
    this.shockTracker = new HitTracker();
    this.from = createPose(STANCE);
    this.sample = createPose(STANCE);
    this.flashStart = new THREE.Vector3();
    this.flashEnd = new THREE.Vector3();
    this.lastTargetPos = new THREE.Vector3();
    this.events = {};
    this.stage = 'idle';
  }

  pickTarget() {
    const k = this.k;
    const locked = k.validLockTarget();
    if (locked) return locked;
    const combat = k.game.combat;
    // prefer enemies in front, then anything nearby
    const f = k.facingDir;
    let best = null;
    let bestScore = Infinity;
    for (const c of combat.combatants) {
      if (c.team === k.team || c.isDefeated()) continue;
      const dx = c.position.x - k.position.x;
      const dz = c.position.z - k.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 20) continue;
      const front = d > 1e-3 ? (dx * f.x + dz * f.z) / d : 1;
      const score = d * (1.6 - front * 0.6);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  start(fromPose) {
    const k = this.k;
    this.active = true;
    this.t = 0;
    this.prevT = 0;
    this.stage = 'focus';
    this.from.set(fromPose);
    for (const tr of this.cutTrackers) tr.reset();
    this.severTracker.reset();
    this.shockTracker.reset();
    this.events = {};
    this.target = this.pickTarget();
    if (this.target) this.lastTargetPos.copy(this.target.position);
    else this.lastTargetPos.copy(k.position).addScaledVector(k.facingDir, 3);
    this.gravityScale = 0.15;
    k.invulnT = Math.max(k.invulnT, T.invulnEnd);
    k.velocity.set(0, 0, 0);
    k.glowTarget = 1.0;
    this.setAuraColor(COLORS.crimson);
    const g = k.game;
    g.audio.play('ultCharge');
    g.cinematic.begin();
    g.cameraRig.setCinematic('ultFocus');
    g.fx.ring({ position: k.position, radius: 3.2, life: 0.8, width: 0.08, inner: COLORS.crimson, outer: 0xff8090 });
    g.events.emit('ultimateStage', 'focus');
  }

  setAuraColor(c) {
    const s = this.k.sword;
    if (s.auraMat) s.auraMat.uniforms.uColor.value.set(c);
    if (s.energyMat) s.energyMat.color.set(c === COLORS.crimson ? 0xff4a64 : 0x6fd0ff);
    this.k.swordLight.color.set(c === COLORS.crimson ? 0xff3a55 : 0x5ec8ff);
  }

  once(name) {
    if (this.events[name]) return false;
    this.events[name] = true;
    return true;
  }

  crossed(time) {
    return this.prevT < time && this.t >= time;
  }

  update(dt) {
    const k = this.k;
    const g = k.game;
    this.prevT = this.t;
    this.t += dt;
    const t = this.t;

    // track the target (or where it fell)
    const tgt = this.target && !this.target.isDefeated() ? this.target : null;
    if (tgt) this.lastTargetPos.copy(tgt.position);
    const tp = this.lastTargetPos;
    const yaw = Math.atan2(tp.x - k.position.x, tp.z - k.position.z);
    if (Math.hypot(tp.x - k.position.x, tp.z - k.position.z) > 0.3) k.facing = approachAngle(k.facing, yaw, 18 * dt);

    // pose
    sampleKeys(KEYS, t, this.sample);
    lerpPose(k.actionPose, this.from, this.sample, Ease.outQuad(clamp(t / 0.08, 0, 1)));

    k.velocity.x = 0;
    k.velocity.z = 0;

    // ---- Stage 1: Focus
    if (t < T.focusEnd) {
      g.cinematic.setDim(0.35 + 0.65 * (1 - Ease.outQuad(clamp(t / 0.45, 0, 1))));
      // crimson particles orbiting the blade
      k.swordBaseWorld(_v);
      k.swordTipWorld(_v2);
      for (let i = 0; i < 3; i++) {
        _p.lerpVectors(_v, _v2, Math.random());
        g.fx.swirl(_p, { count: 1, radius: 0.28, radiusVel: -0.2, angVel: 12, rise: 0.5, life: 0.45, yRange: 0.05, size: 0.06, colors: [COLORS.crimson, 0xff6a80, COLORS.crimson] });
      }
      if (Math.random() < dt * 30) g.fx.motes(k.position, { count: 1, spread: 1.4, rise: 1.6, colors: [COLORS.crimson, 0xff8a9a], size: 0.05, life: 0.9 });
    }

    // ---- Stage 2: Flash Step towards the target
    if (this.crossed(T.focusEnd) || (t >= T.focusEnd && this.once('flashInit'))) {
      this.events.flashInit = true;
      this.stage = 'flash';
      this.flashStart.copy(k.position);
      this.computeFlashEnd();
      g.audio.play('flashStep');
      g.cameraRig.setCinematic('ultFlash');
      g.cameraRig.kick(14);
      g.fx.trail.start('dash');
      if (g.screen) g.screen.speedLines(0.6);
      g.events.emit('ultimateStage', 'flash');
    }
    if (t >= T.focusEnd && t < T.flashEnd + 0.001) {
      this.computeFlashEnd();
      const u = Ease.inOutQuad(clamp((t - T.focusEnd) / (T.flashEnd - T.focusEnd), 0, 1));
      k.position.x = this.flashStart.x + (this.flashEnd.x - this.flashStart.x) * u;
      k.position.z = this.flashStart.z + (this.flashEnd.z - this.flashStart.z) * u;
      this.ghostT = (this.ghostT || 0) - dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.022;
        this.flip = !this.flip;
        g.fx.afterimage(k.model, { color: this.flip ? COLORS.crimson : COLORS.blue, life: 0.45, opacity: 0.5 });
      }
    }

    // ---- Stage 3: Thousand Cuts
    for (let i = 0; i < T.cuts; i++) {
      const c0 = T.cutStart + i * T.cutLen;
      const hitT = c0 + 0.06;
      if (this.crossed(c0 + 0.02)) {
        if (i === 0) {
          this.stage = 'cuts';
          g.cameraRig.setCinematic('ultCuts');
          g.events.emit('ultimateStage', 'cuts');
        }
        g.fx.trail.start(i % 2 ? 'crimson' : 'long');
        g.audio.play('ultCut');
      }
      if (this.crossed(hitT)) this.doCut(i);
      if (this.crossed(c0 + 0.13)) g.fx.trail.stop();
    }

    // ---- Stage 4: Final Sever
    if (this.crossed(T.severWindup)) {
      this.stage = 'sever';
      g.fx.trail.stop();
      g.audio.play('ability');
      g.cameraRig.setCinematic('ultSever');
      g.fx.flash({ position: k.chestWorld(_v).setY(k.position.y + 2.0), color: COLORS.crimson, size: 2.5, life: 0.35, kind: 'glow', opacity: 0.8 });
      g.events.emit('ultimateStage', 'sever');
    }
    if (this.crossed(T.severHit - 0.02)) g.fx.trail.start('crimson');
    if (this.crossed(T.severHit)) this.spawnSeverWave();
    if (this.prevT <= T.severEnd && t >= T.severHit) this.doSever();

    // ---- Stage 5: Impact
    if (this.crossed(T.impact)) this.doImpact();
    if (this.crossed(T.impact + 0.12)) g.fx.trail.stop();

    // ---- Stage 6: Recovery
    if (this.crossed(T.recoverStart)) {
      this.stage = 'recovery';
      g.cinematic.end();
      g.cameraRig.setCinematic(null);
      this.setAuraColor(COLORS.blue);
      k.glowTarget = 0.3;
      g.events.emit('ultimateStage', 'recovery');
    }
    if (t >= T.recoverStart) this.gravityScale = 1;

    if (t >= T.end || t >= T.watchdog) this.finish();
  }

  computeFlashEnd() {
    const k = this.k;
    const tp = this.lastTargetPos;
    const tr = this.target ? this.target.radius : 0.5;
    let dx = tp.x - k.position.x;
    let dz = tp.z - k.position.z;
    let d = Math.hypot(dx, dz);
    if (!this.target || d < 1e-3) {
      // no target: a short forward step
      const f = k.facingDir;
      this.flashEnd.copy(this.flashStart).addScaledVector(f, 3);
    } else {
      dx /= d;
      dz /= d;
      // stop just in front of the target; never travel more than 16 m
      const stopDist = tr + 1.35;
      const fromStart = Math.hypot(tp.x - this.flashStart.x, tp.z - this.flashStart.z);
      const travel = clamp(fromStart - stopDist, 0, 16);
      const sx = tp.x - this.flashStart.x;
      const sz = tp.z - this.flashStart.z;
      const sl = Math.hypot(sx, sz) || 1;
      this.flashEnd.set(this.flashStart.x + (sx / sl) * travel, 0, this.flashStart.z + (sz / sl) * travel);
    }
    const r = Math.hypot(this.flashEnd.x, this.flashEnd.z);
    const maxR = ARENA.radius - k.radius;
    if (r > maxR) this.flashEnd.multiplyScalar(maxR / r);
    this.flashEnd.y = k.position.y;
  }

  /** Thousand Cuts: one controlled hit window per cut, small radius in front of Kairo. */
  doCut(i) {
    const k = this.k;
    const g = k.game;
    const f = k.facingDir;
    const hits = g.combat.querySector({ origin: k.position, forward: f, range: 3.4, halfAngle: 1.2, team: k.team, yMin: -1, yMax: 3 });
    const targets = hits.map((h) => h.target);
    const tp = this.lastTargetPos;
    _p.set(tp.x + rand(-0.4, 0.4), tp.y + 1.0 + rand(-0.4, 0.5), tp.z + rand(-0.4, 0.4));
    // slash arc wrapped around the target, each with a different orientation
    // a mostly vertical cut plane around the target (never lying flat on the floor)
    const a = rand(0, PI * 2);
    _n.set(Math.cos(a), rand(-0.35, 0.35), Math.sin(a)).normalize();
    _v.set(0, 1, 0).cross(_n).normalize();
    _v2.crossVectors(_n, _v);
    const spin = rand(0, PI * 2);
    _p2.copy(_v).multiplyScalar(Math.cos(spin)).addScaledVector(_v2, Math.sin(spin));
    _v2.crossVectors(_n, _p2);
    _v.copy(_p2);
    g.fx.slash({
      origin: _p, F: _v, S: _v2, a0: -1.4, a1: 1.4, radius: rand(1.3, 2.1), thickness: 0.35, life: 0.22, sweep: 0.35,
      accent: i % 2 ? 1 : 0.3, body: i % 2 ? COLORS.crimson : COLORS.blue, opacity: 0.95,
    });
    g.fx.flash({ position: _p, color: i % 2 ? 0xffd0d8 : 0xe8f8ff, size: 1.6, life: 0.12, kind: 'star' });
    if (i % 3 === 1) g.fx.afterimage(k.model, { color: COLORS.crimson, life: 0.25, opacity: 0.35 });
    for (const target of targets) {
      const hit = {
        damage: DAMAGE.ultCut * k.damageMul, knockback: 0.3, lift: 0, stagger: 0.45, kind: 'light', crimson: i % 2 === 1,
        source: k, dir: f.clone(), point: _p.clone(), ultimate: true,
      };
      const res = g.combat.applyHit(k, target, hit, this.cutTrackers[i]);
      if (res && res.applied) {
        k.registerHit();
        k.damageDealt += res.damage;
        g.fx.sparks(_p, { count: 8, speed: 9, colors: [COLORS.white, i % 2 ? COLORS.crimson : COLORS.blue] });
        g.audio.play('hit');
      }
    }
    if (i % 2 === 0) g.hitstop(0.02);
    g.shake(0.12);
  }

  spawnSeverWave() {
    const k = this.k;
    const g = k.game;
    const f = k.facingDir;
    _v.set(k.position.x, k.position.y + 1.4, k.position.z);
    // vertical crescent energy wave travelling forward
    _p.set(0, 1, 0);
    g.fx.slash({ origin: _v, F: f, S: _p, a0: 1.9, a1: -1.2, radius: 2.4, grow: 2.3, thickness: 1.1, life: 0.55, sweep: 0.12, accent: 1, body: COLORS.crimson, core: 0xffffff, accentColor: COLORS.blue, opacity: 1 });
    g.fx.slash({ origin: _v, F: f, S: _p, a0: 1.7, a1: -1.0, radius: 2.0, grow: 2.2, thickness: 0.4, life: 0.45, sweep: 0.12, accent: 0.6, body: COLORS.blue, core: 0xffffff, opacity: 0.9 });
    // horizontal companion arc for a huge readable crescent
    _v2.set(f.z, 0, -f.x).multiplyScalar(-1);
    g.fx.slash({ origin: _v.setY(k.position.y + 1.0), F: f, S: _v2, a0: -1.5, a1: 1.5, radius: 2.2, grow: 2.4, thickness: 0.9, life: 0.5, sweep: 0.15, accent: 1, body: COLORS.crimson, opacity: 0.9 });
    g.audio.play('swing', { power: 1 });
  }

  doSever() {
    const k = this.k;
    const g = k.game;
    const f = k.facingDir;
    const hits = g.combat.querySector({ origin: k.position, forward: f, range: 9, halfAngle: 0.62, team: k.team, yMin: -1, yMax: 3.5 });
    const targets = hits.map((h) => h.target);
    for (const target of targets) {
      _p.set(target.position.x, target.position.y + 1.1, target.position.z);
      const hit = {
        damage: DAMAGE.ultSever * k.damageMul, knockback: 12, lift: 4, stagger: 0.9, kind: 'heavy', crimson: true,
        source: k, dir: f.clone(), point: _p.clone(), ultimate: true,
      };
      const res = g.combat.applyHit(k, target, hit, this.severTracker);
      if (res && res.applied) {
        k.registerHit();
        k.damageDealt += res.damage;
        g.fx.impact(_p, f, { heavy: true, crimson: true, scale: 1.6 });
        g.audio.play('hitHeavy');
      }
    }
  }

  doImpact() {
    const k = this.k;
    const g = k.game;
    this.stage = 'impact';
    const tp = this.lastTargetPos;
    _p.set(tp.x, 0, tp.z);
    g.fx.ring({ position: _p, radius: 8.5, life: 0.8, width: 0.12, inner: COLORS.crimson, outer: 0xffffff });
    g.fx.ring({ position: _p, radius: 5.5, life: 0.6, width: 0.2, inner: COLORS.blue, outer: 0xd8f3ff });
    g.fx.ring({ position: _v.set(tp.x, 1.2, tp.z), radius: 4, life: 0.4, width: 0.15, normal: k.facingDir, inner: COLORS.crimson, outer: 0xffffff });
    _v.set(tp.x, 1.2, tp.z);
    g.fx.flash({ position: _v, color: 0xffffff, size: 6, life: 0.3, kind: 'star' });
    g.fx.flash({ position: _v, color: COLORS.crimson, size: 9, life: 0.5, kind: 'glow', opacity: 0.8 });
    g.fx.sparks(_v, { dir: new THREE.Vector3(0, 1, 0), count: 90, speed: 16, spread: 1.4, colors: [COLORS.crimson, 0xff7080, COLORS.blue, COLORS.white], size: 0.08, life: 1.0, gravity: 14, drag: 1.5 });
    g.fx.motes(_v, { count: 40, spread: 2.5, rise: 2, colors: [COLORS.crimson, 0xff8a9a, COLORS.blue], size: 0.07, life: 1.4 });
    g.fx.debris(_p, { count: 24, power: 9, size: 0.12 });
    g.fx.dust(_p, { count: 22, radius: 2, speed: 7, alpha: 0.35, size: 0.6 });
    g.fx.light(_v, 0xff3050, 120, 4);
    g.hitstop(0.14);
    g.shake(0.9);
    if (g.screen) g.screen.flash('white', 0.35);
    g.audio.play('ultBoom');
    g.events.emit('ultimateStage', 'impact');
    // ground shockwave: separate controlled AoE around the impact point
    const hits = g.combat.queryRadius(_p, 6.5, k.team, -1, 4);
    const targets = hits.map((h) => h.target);
    for (const target of targets) {
      const dir = new THREE.Vector3(target.position.x - tp.x, 0, target.position.z - tp.z);
      if (dir.lengthSq() < 1e-4) dir.copy(k.facingDir);
      dir.normalize();
      const hit = {
        damage: DAMAGE.ultShockwave * k.damageMul, knockback: 9, lift: 3, stagger: 0.8, kind: 'heavy', crimson: true,
        source: k, dir, point: new THREE.Vector3(target.position.x, target.position.y + 1, target.position.z), ultimate: true,
      };
      const res = g.combat.applyHit(k, target, hit, this.shockTracker);
      if (res && res.applied) {
        k.registerHit();
        k.damageDealt += res.damage;
      }
    }
  }

  finish() {
    if (!this.active) return;
    this.cleanup();
    this.k.onUltimateFinished();
  }

  /** Ends the ultimate immediately (restart, defeat, game over). */
  abort() {
    if (!this.active) return;
    this.cleanup();
  }

  cleanup() {
    const k = this.k;
    const g = k.game;
    this.active = false;
    this.stage = 'idle';
    this.gravityScale = 1;
    k.invulnT = Math.min(k.invulnT, 0);
    g.fx.trail.stop();
    g.cinematic.end(true);
    g.cameraRig.setCinematic(null);
    this.setAuraColor(COLORS.blue);
    k.glowTarget = 0.2;
    g.events.emit('ultimateStage', 'done');
  }
}
