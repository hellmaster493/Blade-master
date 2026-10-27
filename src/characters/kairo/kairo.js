// KAIRO — THE BLADE MASTER: player controller.
// State machine: move | action | dash | hurt | defeated | victory
// Implements the shared Combatant interface (see combat/combat.js).
import * as THREE from 'three';
import { buildKairo, DIMS } from './kairoModel.js';
import { KairoAnimator } from './kairoAnimator.js';
import { STANCE, F, createPose, lerpPose, sampleKeys, setPose } from './pose.js';
import { COMBO, CRESCENT_SLASH, CYCLONE_CUT, HURT, DEFEAT, DASH_POSES } from './kairoMoves.js';
import { CrimsonTempest } from './kairoUltimate.js';
import { KAIRO, ARENA, SOFT_TARGET } from '../../config.js';
import { Cooldowns } from '../../core/cooldowns.js';
import { HitTracker } from '../../combat/combat.js';
import { COLORS } from '../../fx/fx.js';
import { clamp, damp, approachAngle, angleDiff, wrapAngle, Ease, lerp, rand } from '../../core/mathutils.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _left = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _base = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _point = new THREE.Vector3();
const _Fp = new THREE.Vector3();
const _Sp = new THREE.Vector3();

const ACTION_KEYS = [
  ['attack', ['Mouse0', 'KeyJ']],
  ['crescent', ['KeyQ']],
  ['cyclone', ['KeyE']],
  ['ultimate', ['KeyR']],
  ['dash', ['ShiftLeft', 'ShiftRight']],
  ['jump', ['Space']],
];

const DASH_DIRS = ['forward', 'back', 'left', 'right'];

export class Kairo {
  constructor(game) {
    this.game = game;
    this.team = 'player';
    this.name = KAIRO.name;
    this.radius = KAIRO.radius;
    this.height = KAIRO.height;

    this.object = new THREE.Object3D();
    this.object.name = 'Kairo';
    this.model = buildKairo();
    this.object.add(this.model.root);
    this.position = this.object.position;
    this.animator = new KairoAnimator(this.model);
    this.sword = this.model.sword;

    // Faint blue light that rides the blade when energy is active.
    this.swordLight = new THREE.PointLight(0x5ec8ff, 0, 3.5, 2);
    this.swordLight.position.set(0, 0.6, 0);
    this.sword.group.add(this.swordLight);

    this.velocity = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.cooldowns = new Cooldowns(KAIRO.cooldowns);
    this.ultimate = new CrimsonTempest(this);

    this.act = {
      move: null, t: 0, prevT: 0, trackers: [], fxDone: [], trailOn: [], targetFacing: 0, turning: false,
      from: createPose(STANCE), pose: createPose(STANCE), sample: createPose(STANCE),
    };
    for (let i = 0; i < 8; i++) this.act.trackers.push(new HitTracker());
    this.dash = { t: 0, dir: new THREE.Vector3(), perfect: false, ghostT: 0, from: createPose(STANCE), target: createPose(STANCE), air: false };
    this.exitPose = createPose(STANCE);
    this.actionPose = createPose(STANCE);
    this.buffer = { name: null, time: 0 };
    this.prevTip = new THREE.Vector3();
    this.tipVel = new THREE.Vector3();
    this.reset(new THREE.Vector3(0, 0, 0), 0);
  }

  reset(spawn, facing = 0) {
    if (this.ultimate.active) this.ultimate.abort();
    this.position.copy(spawn);
    this.facing = facing;
    this.object.rotation.set(0, facing, 0);
    this.velocity.set(0, 0, 0);
    this.knock.set(0, 0, 0);
    this.state = 'move';
    this.stateT = 0;
    this.hp = KAIRO.maxHealth;
    this.maxHp = KAIRO.maxHealth;
    this.energy = 0;
    this.grounded = true;
    this.landT = 0;
    this.airDashUsed = false;
    this.invulnT = 0;
    this.hurtInvulnT = 0;
    this.comboStep = 0;
    this.comboGraceT = 0;
    this.hitCount = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.damageDealt = 0;
    this.perfectDodges = 0;
    this.lockTarget = null;
    this.glow = 0.15;
    this.glowTarget = 0.15;
    this.exitT = 0;
    this.buffer.name = null;
    this.buffer.time = 0;
    this.act.move = null;
    this.pendingVictory = false;
    this.victoryT = 0;
    this.swordSheathed = false;
    this.sheatheBlend = 0;
    this.attachSwordToHand();
    this.cooldowns.reset();
    this.animator.reset();
    this.model.root.rotation.set(0, 0, 0);
    this.applyGlow();
    this.updateAnimation(1 / 60);
    this.prevTip.copy(this.swordTipWorld(_tip));
  }

  // ------------------------------------------------------------------ Combatant
  isDefeated() {
    return this.state === 'defeated';
  }

  isInvulnerable() {
    return this.invulnT > 0 || this.hurtInvulnT > 0 || this.state === 'victory';
  }

  receiveDamage(hit) {
    if (this.state === 'defeated' || this.state === 'victory') return { applied: false, killed: false, damage: 0 };
    if (this.invulnT > 0) {
      // Dodged through i-frames. Reward a precisely timed dodge once per dash.
      let perfect = false;
      if (this.state === 'dash' && this.dash.t <= KAIRO.dash.perfectWindow && !this.dash.perfect) {
        this.dash.perfect = true;
        perfect = true;
        this.perfectDodges++;
        this.addEnergy(KAIRO.dash.perfectEnergy);
        this.game.onPerfectDodge(this);
      }
      return { applied: false, killed: false, damage: 0, dodged: true, perfect };
    }
    if (this.hurtInvulnT > 0) return { applied: false, killed: false, damage: 0 };
    const dmg = Math.max(0, hit.damage);
    this.hp = Math.max(0, this.hp - dmg);
    this.addEnergy(dmg * KAIRO.ultimate.onDamageTaken);
    this.resetHitCombo();
    if (this.hp <= 0) {
      this.defeat();
      return { applied: true, killed: true, damage: dmg };
    }
    this.hurtInvulnT = 0.4; // brief grace so groups can't stun-lock
    this.enterHurt();
    return { applied: true, killed: false, damage: dmg };
  }

  applyKnockback(dir, force, lift = 0) {
    if (this.state === 'defeated') return;
    this.knock.addScaledVector(dir, force);
    if (lift > 0 && this.grounded) {
      this.velocity.y = lift;
      this.grounded = false;
    }
  }

  // ------------------------------------------------------------------ helpers
  get facingDir() {
    return _fwd.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  addEnergy(v) {
    const before = this.energy;
    this.energy = clamp(this.energy + v, 0, KAIRO.ultimate.max);
    if (before < KAIRO.ultimate.max && this.energy >= KAIRO.ultimate.max) this.game.events.emit('ultimateReady', this);
  }

  get ultimateReady() {
    return this.energy >= KAIRO.ultimate.max;
  }

  resetHitCombo() {
    if (this.hitCount > 0) this.game.events.emit('comboEnd', { count: this.hitCount });
    this.hitCount = 0;
    this.comboTimer = 0;
  }

  registerHit() {
    this.hitCount++;
    this.comboTimer = KAIRO.comboHitWindow;
    if (this.hitCount > this.maxCombo) this.maxCombo = this.hitCount;
    this.game.events.emit('combo', { count: this.hitCount });
  }

  swordTipWorld(out) {
    return out.copy(DIMS.swordTip).applyMatrix4(this.sword.group.matrixWorld);
  }

  swordBaseWorld(out) {
    return out.copy(DIMS.swordBase).applyMatrix4(this.sword.group.matrixWorld);
  }

  chestWorld(out) {
    return out.set(this.position.x, this.position.y + 1.25, this.position.z);
  }

  /** Direction from movement keys, camera-relative or target-relative when locked on. */
  readMoveInput(out) {
    const input = this.game.input;
    let ix = 0;
    let iz = 0;
    if (this.game.controllable) {
      if (input.isDown('KeyW')) iz += 1;
      if (input.isDown('KeyS')) iz -= 1;
      if (input.isDown('KeyD')) ix += 1;
      if (input.isDown('KeyA')) ix -= 1;
    }
    this.inputZ = iz;
    this.inputX = ix;
    if (ix === 0 && iz === 0) return out.set(0, 0, 0);
    let fx;
    let fz;
    const t = this.validLockTarget();
    if (t) {
      fx = t.position.x - this.position.x;
      fz = t.position.z - this.position.z;
      const l = Math.hypot(fx, fz) || 1;
      fx /= l;
      fz /= l;
    } else {
      const yaw = this.game.cameraRig.yaw;
      fx = Math.sin(yaw);
      fz = Math.cos(yaw);
    }
    // right = forward x up
    const rx = -fz;
    const rz = fx;
    out.set(fx * iz + rx * ix, 0, fz * iz + rz * ix);
    return out.normalize();
  }

  validLockTarget() {
    const t = this.lockTarget;
    if (t && !t.isDefeated()) return t;
    return null;
  }

  pollInput() {
    if (!this.game.controllable) return;
    const input = this.game.input;
    for (const [name, codes] of ACTION_KEYS) {
      for (const c of codes) {
        if (input.wasPressed(c)) {
          this.buffer.name = name;
          this.buffer.time = KAIRO.inputBuffer;
        }
      }
    }
  }

  consumeBuffer() {
    const n = this.buffer.name;
    this.buffer.name = null;
    return n;
  }

  /** Tries to start whatever is buffered. `allowed` filters by current state window. */
  tryBuffered(allowed) {
    const name = this.buffer.name;
    if (!name || !allowed(name)) return false;
    switch (name) {
      case 'attack':
        this.consumeBuffer();
        this.startCombo();
        return true;
      case 'crescent':
      case 'cyclone':
        this.consumeBuffer();
        if (!this.cooldowns.ready(name)) {
          this.game.events.emit('denied', name);
          return false;
        }
        this.startAction(name === 'crescent' ? CRESCENT_SLASH : CYCLONE_CUT);
        this.cooldowns.start(name);
        this.game.events.emit('abilityUsed', name);
        return true;
      case 'ultimate':
        this.consumeBuffer();
        if (!this.ultimateReady) {
          this.game.events.emit('denied', 'ultimate');
          return false;
        }
        this.startUltimate();
        return true;
      case 'dash':
        if (!this.cooldowns.ready('dash') || (this.airDashUsed && !this.grounded)) return false;
        this.consumeBuffer();
        this.startDash();
        return true;
      case 'jump':
        if (!this.grounded) {
          this.consumeBuffer();
          return false;
        }
        this.consumeBuffer();
        // jumping cancels an attack's recovery or the tail of a dash
        if (this.state === 'action' && this.act.move) this.endAction();
        else if (this.state === 'dash') this.endDash(true);
        this.jump();
        return true;
      default:
        return false;
    }
  }

  jump() {
    this.velocity.y = KAIRO.jumpVelocity;
    this.grounded = false;
    this.game.audio.play('jump');
    this.game.fx.dust(this.position, { count: 6, radius: 0.3, speed: 1.6, alpha: 0.25 });
  }

  // ------------------------------------------------------------------ main update
  update(dt) {
    this.stateT += dt;
    this.pollInput();
    if (this.buffer.time > 0) {
      this.buffer.time -= dt;
      if (this.buffer.time <= 0) this.buffer.name = null;
    }
    const readied = this.cooldowns.update(dt);
    for (const id of readied) this.game.events.emit('cooldownReady', id);
    if (this.invulnT > 0) this.invulnT = Math.max(0, this.invulnT - dt);
    if (this.hurtInvulnT > 0) this.hurtInvulnT = Math.max(0, this.hurtInvulnT - dt);
    if (this.comboGraceT > 0) this.comboGraceT -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.resetHitCombo();
    }
    if (this.landT > 0) this.landT = Math.max(0, this.landT - dt);
    if (this.exitT > 0) this.exitT = Math.max(0, this.exitT - dt);
    if (this.lockTarget && this.lockTarget.isDefeated()) this.game.onLockTargetLost();
    if (this.game.trainingCharge && this.state !== 'defeated') this.addEnergy(dt * 9);

    this.readMoveInput(_wish);

    switch (this.state) {
      case 'move':
        this.updateMove(dt);
        break;
      case 'action':
        if (this.ultimate.active) this.ultimate.update(dt);
        else this.updateAction(dt);
        break;
      case 'dash':
        this.updateDash(dt);
        break;
      case 'hurt':
        this.updateHurt(dt);
        break;
      case 'defeated':
        this.updateDefeated(dt);
        break;
      case 'victory':
        this.updateVictory(dt);
        break;
    }

    this.integrate(dt);
    this.glow = damp(this.glow, this.glowTarget, 9, dt);
    this.applyGlow();
    this.updateAnimation(dt);
    this.updateSwordFx(dt);
  }

  updateMove(dt) {
    if (this.pendingVictory) {
      this.startVictory();
      return;
    }
    this.glowTarget = this.game.state === 'title' ? 0.5 : 0.15;
    this.tryBuffered(() => true);
    if (this.state !== 'move') return;

    const locked = this.validLockTarget();
    const speed = locked ? KAIRO.lockSpeed * (this.inputZ < 0 ? KAIRO.backpedalMul : 1) : KAIRO.runSpeed;
    this.accelerate(_wish, speed, dt);
    if (locked) {
      const yaw = Math.atan2(locked.position.x - this.position.x, locked.position.z - this.position.z);
      this.facing = approachAngle(this.facing, yaw, 14 * dt);
    } else if (_wish.lengthSq() > 0.01) {
      this.facing = approachAngle(this.facing, Math.atan2(_wish.x, _wish.z), KAIRO.turnSpeed * dt);
    }
  }

  accelerate(wish, speed, dt) {
    const tx = wish.x * speed;
    const tz = wish.z * speed;
    const dx = tx - this.velocity.x;
    const dz = tz - this.velocity.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-5) return;
    const speeding = tx * tx + tz * tz > this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z;
    const rate = this.grounded ? (speeding ? KAIRO.groundAccel : KAIRO.groundDecel) : KAIRO.airAccel;
    const step = Math.min(d, rate * dt);
    this.velocity.x += (dx / d) * step;
    this.velocity.z += (dz / d) * step;
  }

  integrate(dt) {
    const p = this.position;
    // vertical
    let gScale = 1;
    if (this.state === 'dash') gScale = 0;
    else if (this.state === 'action' && !this.grounded) gScale = this.velocity.y > 0 ? 0.6 : 0.3;
    if (this.ultimate.active) gScale = this.ultimate.gravityScale;
    if (!this.grounded) {
      const g = KAIRO.gravity * (this.velocity.y < 0 ? KAIRO.fallGravityMul : 1) * gScale;
      this.velocity.y -= g * dt;
    }
    // knockback decays quickly
    p.x += (this.velocity.x + this.knock.x) * dt;
    p.z += (this.velocity.z + this.knock.z) * dt;
    p.y += this.velocity.y * dt;
    this.knock.multiplyScalar(Math.exp(-9 * dt));
    if (p.y <= 0) {
      p.y = 0;
      if (!this.grounded) this.onLand();
      this.grounded = true;
      this.velocity.y = 0;
    } else if (this.grounded && p.y > 0.001) {
      this.grounded = false;
    }
    this.constrain();
    this.object.rotation.y = this.facing;
  }

  constrain() {
    const p = this.position;
    const maxR = ARENA.radius - this.radius;
    const r = Math.hypot(p.x, p.z);
    if (r > maxR) {
      const nx = p.x / r;
      const nz = p.z / r;
      p.x = nx * maxR;
      p.z = nz * maxR;
      const out = this.velocity.x * nx + this.velocity.z * nz;
      if (out > 0) {
        this.velocity.x -= out * nx;
        this.velocity.z -= out * nz;
      }
      const ko = this.knock.x * nx + this.knock.z * nz;
      if (ko > 0) {
        this.knock.x -= ko * nx;
        this.knock.z -= ko * nz;
      }
    }
    const cols = this.game.arena ? this.game.arena.colliders : [];
    for (const c of cols) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + this.radius;
      if (d < min && d > 1e-4) {
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
      }
    }
  }

  onLand() {
    const impactSpeed = -this.velocity.y;
    if (impactSpeed > 4) {
      this.landT = 0.22;
      this.game.audio.play('land');
      this.game.fx.dust(this.position, { count: 10, radius: 0.5, speed: 2.4, alpha: 0.3 });
      this.game.fx.ring({ position: this.position, radius: 1.3, life: 0.35, width: 0.12, inner: 0x6a8cff, outer: 0xd8f3ff });
    }
    this.airDashUsed = false;
  }

  // ------------------------------------------------------------------ actions
  chooseAttackFacing() {
    const locked = this.validLockTarget();
    if (locked) return Math.atan2(locked.position.x - this.position.x, locked.position.z - this.position.z);
    const hasInput = _wish.lengthSq() > 0.01;
    const baseYaw = hasInput ? Math.atan2(_wish.x, _wish.z) : this.facing;
    // soft targeting: snap to the closest enemy near the intended direction
    const combat = this.game.combat;
    let best = null;
    let bestScore = Infinity;
    const cone = hasInput ? SOFT_TARGET.halfAngle * 0.6 : SOFT_TARGET.halfAngle;
    for (const c of combat.combatants) {
      if (c.team === this.team || c.isDefeated()) continue;
      const dx = c.position.x - this.position.x;
      const dz = c.position.z - this.position.z;
      const d = Math.hypot(dx, dz) - c.radius;
      if (d > SOFT_TARGET.range) continue;
      const a = Math.abs(angleDiff(baseYaw, Math.atan2(dx, dz)));
      if (a > cone) continue;
      const score = d + a * 2;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best) return Math.atan2(best.position.x - this.position.x, best.position.z - this.position.z);
    return baseYaw;
  }

  snapshotPose(out) {
    out.set(this.animator.final);
    out[F.spin] = wrapAngle(out[F.spin]);
    return out;
  }

  startCombo() {
    let idx = 0;
    if (this.state === 'action' && this.act.move && this.act.move.type === 'combo') {
      idx = (this.act.move.comboIndex + 1) % COMBO.length;
    } else if (this.comboGraceT > 0) {
      idx = this.comboStep;
    }
    this.startAction(COMBO[idx]);
  }

  startAction(move) {
    if (this.state === 'dash') this.endDash(false);
    const a = this.act;
    if (a.move) this.stopTrail();
    a.move = move;
    a.t = 0;
    a.prevT = 0;
    for (const tr of a.trackers) tr.reset();
    a.fxDone.length = 0;
    a.trailOn.length = 0;
    this.snapshotPose(a.from);
    a.targetFacing = this.chooseAttackFacing();
    a.turning = true;
    this.state = 'action';
    this.stateT = 0;
    this.exitT = 0;
    this.glowTarget = move.glow || 0.2;
    // keep a little momentum into the swing
    this.velocity.x *= 0.3;
    this.velocity.z *= 0.3;
  }

  endAction() {
    const a = this.act;
    const move = a.move;
    this.stopTrail();
    this.exitPose.set(this.actionPose);
    this.exitPose[F.spin] = wrapAngle(this.exitPose[F.spin]);
    this.exitT = 0.14;
    if (move && move.type === 'combo') {
      this.comboStep = (move.comboIndex + 1) % COMBO.length;
      this.comboGraceT = move.comboIndex === COMBO.length - 1 ? 0 : KAIRO.comboChainGrace;
    }
    a.move = null;
    this.state = 'move';
    this.stateT = 0;
  }

  stopTrail() {
    this.game.fx.trail.stop();
  }

  updateAction(dt) {
    const a = this.act;
    const move = a.move;
    a.prevT = a.t;
    a.t += dt;
    const t = a.t;

    // face the chosen direction quickly during the wind-up, then commit
    const firstHit = move.hits && move.hits.length ? move.hits[0].t0 : 0.1;
    if (t <= firstHit + 0.02) {
      const locked = this.validLockTarget();
      if (locked) a.targetFacing = Math.atan2(locked.position.x - this.position.x, locked.position.z - this.position.z);
      this.facing = approachAngle(this.facing, a.targetFacing, 32 * dt);
    }

    // pose: blend in from the pose we had when the action started
    sampleKeys(move.keys, t, a.sample);
    const w = Ease.outQuad(clamp(t / 0.06, 0, 1));
    lerpPose(a.pose, a.from, a.sample, w);
    this.actionPose.set(a.pose);

    // root motion
    let moved = false;
    if (move.lunges) {
      for (const l of move.lunges) {
        if (t < l.t0 || a.prevT > l.t1) continue;
        const u0 = Ease.outQuad(clamp((a.prevT - l.t0) / (l.t1 - l.t0), 0, 1));
        const u1 = Ease.outQuad(clamp((t - l.t0) / (l.t1 - l.t0), 0, 1));
        let dist = l.dist * (u1 - u0);
        const blocker = this.frontBlocker();
        if (blocker && blocker.gap < 0.9) dist = Math.min(dist, Math.max(0, blocker.gap - 0.5));
        const f = this.facingDir;
        this.velocity.x = (f.x * dist) / Math.max(dt, 1e-4);
        this.velocity.z = (f.z * dist) / Math.max(dt, 1e-4);
        moved = true;
      }
    }
    if (!moved) {
      const mc = move.moveControl;
      if (mc && t >= mc.t0 && t <= mc.t1) {
        this.accelerate(_wish, mc.speed, dt);
      } else {
        this.velocity.x = damp(this.velocity.x, 0, 14, dt);
        this.velocity.z = damp(this.velocity.z, 0, 14, dt);
      }
    }

    // trails
    if (move.trails) {
      move.trails.forEach((tr, i) => {
        if (!a.trailOn[i] && t >= tr.t0 && t < tr.t1) {
          a.trailOn[i] = true;
          this.game.fx.trail.start(tr.style);
        }
        if (a.trailOn[i] === true && t >= tr.t1) {
          a.trailOn[i] = 'done';
          this.stopTrail();
        }
      });
    }

    // fx events
    if (move.fx) {
      move.fx.forEach((e, i) => {
        if (e.t1 !== undefined) {
          if (t >= e.t && a.prevT <= e.t1) this.fireFx(e, dt);
          return;
        }
        if (!a.fxDone[i] && t >= e.t) {
          a.fxDone[i] = true;
          this.fireFx(e, dt);
        }
      });
    }

    // hit windows: a window counts if it overlapped this step (robust at any frame rate)
    if (move.hits) {
      move.hits.forEach((h, i) => {
        if (a.prevT <= h.t1 && t >= h.t0) this.performHit(h, a.trackers[i], t);
      });
    }

    // buffered follow-ups
    if (t >= move.dashCancel && this.buffer.name === 'dash') {
      if (this.tryBuffered((n) => n === 'dash')) return;
    }
    if (t >= move.cancel) {
      if (this.tryBuffered((n) => n !== 'dash')) return;
    }
    if (t >= move.duration) this.endAction();
  }

  /** Closest enemy directly in front, with the surface gap. */
  frontBlocker() {
    const f = this.facingDir;
    let best = null;
    for (const c of this.game.combat.combatants) {
      if (c.team === this.team || c.isDefeated()) continue;
      const dx = c.position.x - this.position.x;
      const dz = c.position.z - this.position.z;
      const along = dx * f.x + dz * f.z;
      if (along <= 0) continue;
      const lateral = Math.abs(dx * f.z - dz * f.x);
      if (lateral > c.radius + this.radius) continue;
      const gap = Math.hypot(dx, dz) - c.radius - this.radius;
      if (!best || gap < best.gap) best = { target: c, gap };
    }
    return best;
  }

  performHit(h, tracker, t) {
    const combat = this.game.combat;
    let range = h.range;
    if (h.wave) {
      const u = clamp((t - h.wave.t0) / (h.wave.t1 - h.wave.t0), 0, 1);
      range = lerp(h.wave.r0, h.wave.r1, Ease.outQuad(u));
    }
    const f = this.facingDir;
    const yMin = -0.7;
    const yMax = 2.7;
    const hits = combat.querySector({ origin: this.position, forward: f, range, halfAngle: h.halfAngle, team: this.team, yMin, yMax });
    // copy because applyHit can trigger events that run new queries
    const targets = hits.map((x) => x.target);
    for (const target of targets) {
      if (tracker.has(target)) continue;
      _point.set(target.position.x, target.position.y + Math.min(1.2, target.height * 0.55), target.position.z);
      let dir;
      if (h.halfAngle >= Math.PI) {
        dir = _v.set(target.position.x - this.position.x, 0, target.position.z - this.position.z).normalize();
      } else {
        dir = _v.copy(f);
      }
      const hit = {
        damage: h.damage,
        knockback: h.knockback || 0,
        lift: h.lift || 0,
        stagger: h.stagger || 0,
        kind: h.kind || 'light',
        crimson: !!h.crimson,
        source: this,
        dir: dir.clone(),
        point: _point.clone(),
      };
      const result = combat.applyHit(this, target, hit, tracker);
      if (result && result.applied) this.onHitLanded(h, target, result, hit);
    }
  }

  onHitLanded(h, target, result, hit) {
    this.damageDealt += result.damage;
    if (h.energy) this.addEnergy(h.energy);
    this.registerHit();
    const game = this.game;
    game.hitstop(h.hitstop || 0);
    game.shake(h.shake || 0);
    const heavy = h.kind === 'heavy';
    _v2.copy(this.tipVel);
    if (_v2.lengthSq() < 1e-3) _v2.copy(hit.dir);
    _v2.normalize();
    game.fx.impact(hit.point, _v2, { heavy, crimson: h.crimson });
    if (h.burst) {
      game.fx.sparks(hit.point, { count: 30, speed: 12, colors: [COLORS.crimson, 0xff6a7a, COLORS.blue, COLORS.white], size: 0.07, life: 0.55 });
      game.fx.ring({ position: _v.set(target.position.x, target.position.y + 1.0, target.position.z), radius: 2.2, life: 0.3, width: 0.16, normal: hit.dir });
    }
    game.audio.play(heavy ? 'hitHeavy' : h.kind === 'medium' ? 'hitMedium' : 'hit');
  }

  fireFx(e, dt) {
    const fx = this.game.fx;
    switch (e.type) {
      case 'sfx':
        this.game.audio.play(e.name, e);
        break;
      case 'arc':
        this.spawnArc(e);
        break;
      case 'spinArc': {
        const p = this.actionPose;
        this.spawnArc({ tilt: p[F.sTilt] * 0.6, pitch: 0.08, phi0: p[F.sPhi], phi1: p[F.sPhi] + Math.PI * 1.15, radius: 1.75, thickness: 0.5, life: 0.24, sweep: 0.55, opacity: 0.8, accent: 0.2 });
        break;
      }
      case 'swirl': {
        const n = Math.max(1, Math.round(140 * dt));
        fx.swirl(this.position, { count: n, radius: 1.2, radiusVel: 2.8, angVel: 11, rise: 1.6, life: 0.55, yRange: 1.6, colors: [COLORS.blue, COLORS.white, 0x9ad8ff] });
        break;
      }
      case 'wind': {
        const f = this.facingDir;
        for (let i = 0; i < e.count; i++) {
          const a = rand(-1.2, 1.2) + this.facing;
          const r = rand(1.2, 2.6);
          _v.set(this.position.x + Math.sin(a) * r, this.position.y + rand(0.6, 1.6), this.position.z + Math.cos(a) * r);
          fx.sparks(_v, { dir: f, count: 1, speed: 14, spread: 0.3, colors: [COLORS.white, COLORS.blue], size: 0.05, life: 0.35, gravity: 0, stretch: 0.05, drag: 2 });
        }
        break;
      }
      case 'cycloneBurst': {
        const c = this.chestWorld(_v);
        fx.ring({ position: this.position, radius: 5.6, life: 0.55, width: 0.14, inner: COLORS.crimson, outer: 0xd8f3ff });
        fx.ring({ position: this.position, radius: 3.6, life: 0.4, width: 0.22, inner: COLORS.blue, outer: 0xffffff });
        fx.flash({ position: c, color: COLORS.crimson, size: 4.2, life: 0.25, kind: 'glow', opacity: 0.8 });
        fx.flash({ position: c, color: 0xffe0e6, size: 2.6, life: 0.16, kind: 'star' });
        fx.swirl(this.position, { count: 50, radius: 0.8, radiusVel: 9, angVel: 8, rise: 1, life: 0.6, colors: [COLORS.crimson, COLORS.white, COLORS.blue] });
        fx.dust(this.position, { count: 14, radius: 1.4, speed: 6, alpha: 0.3 });
        fx.debris(this.position, { count: 10, power: 5 });
        fx.light(c, 0xff3050, 50, 6);
        this.game.audio.play('burst');
        this.game.shake(0.25);
        break;
      }
      default:
        break;
    }
  }

  /** Arc FX in the swing plane of the current pose (pivot + plane angles in model space). */
  spawnArc(e) {
    const p = this.actionPose;
    _e.set(e.pitch || 0, e.yaw || 0, e.tilt || 0, 'YXZ');
    _q.setFromEuler(_e);
    this.model.root.updateWorldMatrix(true, false);
    const mq = this.model.root.getWorldQuaternion(new THREE.Quaternion());
    _Fp.set(0, 0, 1).applyQuaternion(_q).applyQuaternion(mq);
    _Sp.set(1, 0, 0).applyQuaternion(_q).applyQuaternion(mq);
    if (e.wave) {
      _v.set(this.position.x, this.position.y + 1.05, this.position.z);
    } else {
      _v.set(p[F.sPx], p[F.sPy], p[F.sPz]);
      this.model.root.localToWorld(_v);
    }
    this.game.fx.slash({
      origin: _v, F: _Fp, S: _Sp, a0: e.phi0, a1: e.phi1, radius: e.radius, thickness: e.thickness, life: e.life,
      sweep: e.sweep, grow: e.grow || 0, accent: e.accent || 0, opacity: e.opacity, body: e.body, core: e.core, accentColor: e.accentColor,
    });
  }

  // ------------------------------------------------------------------ dash
  startDash() {
    const d = this.dash;
    if (this.state === 'action') {
      this.stopTrail();
      this.act.move = null;
    }
    const hasInput = _wish.lengthSq() > 0.01;
    if (hasInput) d.dir.copy(_wish);
    else d.dir.copy(this.facingDir);
    d.t = 0;
    d.perfect = false;
    d.ghostT = 0;
    d.air = !this.grounded;
    if (d.air) this.airDashUsed = true;
    this.velocity.y = 0;
    this.snapshotPose(d.from);
    const locked = this.validLockTarget();
    if (!locked) this.facing = Math.atan2(d.dir.x, d.dir.z);
    // pose leans into the dash direction relative to facing
    const rel = angleDiff(this.facing, Math.atan2(d.dir.x, d.dir.z));
    const weights = {
      forward: Math.max(0, Math.cos(rel)),
      back: Math.max(0, -Math.cos(rel)),
      left: Math.max(0, Math.sin(rel)),
      right: Math.max(0, -Math.sin(rel)),
    };
    const target = d.target;
    target.set(createPose(STANCE));
    const stance = createPose(STANCE);
    for (const dirName of DASH_DIRS) {
      const wgt = weights[dirName];
      if (wgt <= 0) continue;
      const partial = DASH_POSES[dirName];
      for (const k in partial) target[F[k]] += (partial[k] - stance[F[k]]) * wgt;
    }
    this.state = 'dash';
    this.stateT = 0;
    this.invulnT = KAIRO.dash.iframes;
    this.cooldowns.start('dash');
    this.game.audio.play('dash');
    this.game.fx.trail.start('dash');
    this.game.fx.dust(this.position, { count: 8, radius: 0.4, speed: 3, alpha: 0.28 });
    this.game.cameraRig.kick(5);
    this.glowTarget = 0.5;
    this.game.events.emit('dash', this);
  }

  updateDash(dt) {
    const d = this.dash;
    d.t += dt;
    const dur = KAIRO.dash.duration;
    const u = clamp(d.t / dur, 0, 1);
    const speed = KAIRO.dash.speed * (1 - Ease.inQuad(clamp((u - 0.55) / 0.45, 0, 1)) * 0.75);
    this.velocity.x = d.dir.x * speed;
    this.velocity.z = d.dir.z * speed;
    this.velocity.y = 0;
    const locked = this.validLockTarget();
    if (locked) {
      const yaw = Math.atan2(locked.position.x - this.position.x, locked.position.z - this.position.z);
      this.facing = approachAngle(this.facing, yaw, 20 * dt);
    }
    d.ghostT -= dt;
    if (d.ghostT <= 0) {
      d.ghostT = 0.04;
      this.game.fx.afterimage(this.model, { color: d.perfect ? COLORS.crimson : COLORS.blue, life: 0.3, opacity: 0.38 });
    }
    const w = Ease.outQuad(clamp(d.t / 0.05, 0, 1));
    lerpPose(this.actionPose, d.from, d.target, w);
    if (d.t >= dur * 0.6 && this.buffer.name && this.buffer.name !== 'dash') {
      if (this.tryBuffered((n) => n !== 'dash')) return;
    }
    if (d.t >= dur) this.endDash(true);
  }

  endDash(toMove) {
    this.stopTrail();
    if (toMove) {
      const carry = KAIRO.runSpeed * 0.85;
      this.velocity.x = this.dash.dir.x * carry;
      this.velocity.z = this.dash.dir.z * carry;
      this.exitPose.set(this.actionPose);
      this.exitT = 0.14;
      this.state = 'move';
      this.stateT = 0;
    }
  }

  // ------------------------------------------------------------------ hurt / defeat
  enterHurt() {
    if (this.ultimate.active) return; // super armour during the ultimate
    if (this.state === 'action') {
      this.stopTrail();
      this.act.move = null;
    }
    if (this.state === 'dash') this.stopTrail();
    this.snapshotPose(this.act.from);
    this.state = 'hurt';
    this.stateT = 0;
    this.glowTarget = 0.1;
    this.game.audio.play('hurt');
  }

  updateHurt(dt) {
    const t = this.stateT;
    sampleKeys(HURT.keys, t, this.act.sample);
    lerpPose(this.actionPose, this.act.from, this.act.sample, Ease.outQuad(clamp(t / 0.05, 0, 1)));
    this.velocity.x = damp(this.velocity.x, 0, 10, dt);
    this.velocity.z = damp(this.velocity.z, 0, 10, dt);
    if (t >= 0.22 && this.buffer.name === 'dash') {
      if (this.tryBuffered((n) => n === 'dash')) return;
    }
    if (t >= HURT.duration) {
      this.exitPose.set(this.actionPose);
      this.exitT = 0.12;
      this.state = 'move';
      this.stateT = 0;
    }
  }

  defeat() {
    if (this.ultimate.active) this.ultimate.abort();
    this.stopTrail();
    this.act.move = null;
    this.snapshotPose(this.act.from);
    this.state = 'defeated';
    this.stateT = 0;
    this.glowTarget = 0;
    this.velocity.x *= 0.2;
    this.velocity.z *= 0.2;
    this.game.cameraRig.setCinematic('defeat');
    this.game.events.emit('playerDefeated', this);
  }

  updateDefeated(dt) {
    const t = Math.min(this.stateT, DEFEAT.duration);
    sampleKeys(DEFEAT.keys, t, this.act.sample);
    lerpPose(this.actionPose, this.act.from, this.act.sample, Ease.outQuad(clamp(this.stateT / 0.08, 0, 1)));
    this.velocity.x = damp(this.velocity.x, 0, 6, dt);
    this.velocity.z = damp(this.velocity.z, 0, 6, dt);
  }

  // ------------------------------------------------------------------ ultimate
  startUltimate() {
    if (this.ultimate.active || !this.ultimateReady) return false;
    if (this.state === 'dash') this.endDash(false);
    if (this.state === 'action' && this.act.move) {
      this.stopTrail();
      this.act.move = null;
    }
    this.energy = 0;
    this.snapshotPose(this.act.from);
    this.state = 'action';
    this.stateT = 0;
    this.ultimate.start(this.act.from);
    this.game.events.emit('ultimateUsed', this);
    return true;
  }

  onUltimateFinished() {
    this.exitPose.set(this.actionPose);
    this.exitT = 0.2;
    this.state = 'move';
    this.stateT = 0;
  }

  // ------------------------------------------------------------------ victory (sheathe)
  celebrate() {
    if (this.state === 'defeated' || this.state === 'victory') return;
    this.pendingVictory = true;
    if (this.state === 'move') this.startVictory();
  }

  startVictory() {
    this.pendingVictory = false;
    if (this.state === 'dash') this.endDash(false);
    this.stopTrail();
    this.snapshotPose(this.act.from);
    this.state = 'victory';
    this.stateT = 0;
    this.victoryT = 0;
    this.glowTarget = 0.6;
    this.game.cameraRig.setCinematic('victory');
  }

  updateVictory(dt) {
    this.victoryT += dt;
    this.velocity.x = damp(this.velocity.x, 0, 10, dt);
    this.velocity.z = damp(this.velocity.z, 0, 10, dt);
    const t = this.victoryT;
    const p = this.actionPose;
    // 0.0-0.45 chiburi (blade flick), 0.45-1.25 bring blade to the saya, 1.25-1.6 slide home
    p.set(createPose(STANCE));
    const flick = Ease.outCubic(clamp(t / 0.25, 0, 1)) - Ease.inOutQuad(clamp((t - 0.25) / 0.2, 0, 1)) * 0.6;
    setPose(p, { sPhi: lerp(-0.3, -1.5, flick), sPitch: lerp(0.42, 0.95, flick), sReach: 0.46, hipsY: -0.06 });
    const bring = Ease.inOutCubic(clamp((t - 0.45) / 0.8, 0, 1));
    this.sheatheBlend = bring;
    if (t > 1.25 && !this.swordSheathed) {
      this.sheatheSword();
    }
    if (t > 1.6) this.glowTarget = 0.1;
    const relax = Ease.inOutQuad(clamp((t - 1.6) / 0.6, 0, 1));
    setPose(p, {
      hipsY: lerp(-0.06, -0.02, relax), spinePitch: lerp(0.1, 0.02, relax), headPitch: lerp(-0.04, 0.08, relax),
      fRx: lerp(-0.12, -0.1, relax), fRz: lerp(0.17, 0.02, relax), fLx: lerp(0.16, 0.11, relax), fLz: lerp(-0.16, -0.02, relax),
      hLx: lerp(0.14, 0.2, bring), hLy: lerp(1.18, 1.0, bring), hLz: lerp(0.26, 0.12, bring),
    });
    const w = Ease.outQuad(clamp(t / 0.08, 0, 1));
    lerpPose(p, this.act.from, p, w);
  }

  attachSwordToHand() {
    const g = this.sword.group;
    this.model.joints.get('handR').add(g);
    g.position.set(0, 0.055, 0);
    g.rotation.set(0, 0, 0);
    this.swordSheathed = false;
  }

  sheatheSword() {
    const g = this.sword.group;
    this.model.sheathedSlot.add(g);
    g.position.set(0, 0, 0);
    g.rotation.set(0, 0, 0);
    this.swordSheathed = true;
    this.game.audio.play('sheathe');
    this.game.fx.flash({ position: this.chestWorld(_v).setY(this.position.y + 1.0), color: COLORS.crimson, size: 1.4, life: 0.25, kind: 'glow', opacity: 0.6 });
  }

  // ------------------------------------------------------------------ animation + fx
  updateAnimation(dt) {
    let action = null;
    let weight = 0;
    if (this.state === 'action' || this.state === 'dash' || this.state === 'hurt' || this.state === 'defeated' || this.state === 'victory') {
      action = this.actionPose;
      weight = 1;
    } else if (this.exitT > 0) {
      action = this.exitPose;
      weight = Ease.inOutQuad(this.exitT / 0.14);
    }
    this.animator.sheathe = this.state === 'victory' ? this.sheatheBlend || 0 : 0;
    this.animator.update(dt, {
      root: this.object,
      vel: this.velocity,
      grounded: this.grounded,
      landT: this.landT,
      locked: !!this.validLockTarget(),
      action,
      weight,
    });
  }

  applyGlow() {
    const g = this.glow;
    const m = this.model.materials;
    m.mark.color.setRGB(0.45 + g * 2.6, 0.04 + g * 0.1, 0.08 + g * 0.2);
    m.emblem.color.setRGB(0.5 + g * 1.6, 0.06, 0.12);
    const s = this.sword;
    const drawn = this.swordSheathed ? 0 : 1;
    if (s.energyMat) s.energyMat.opacity = (0.25 + Math.min(1, g) * 0.75) * drawn;
    if (s.auraMat) {
      s.auraMat.uniforms.uIntensity.value = (0.05 + g * 0.6) * drawn;
      s.auraMat.uniforms.uTime.value = this.animator.time;
    }
    this.swordLight.intensity = this.swordSheathed ? 0 : g * 4;
  }

  updateSwordFx(dt) {
    this.swordTipWorld(_tip);
    if (dt > 0) this.tipVel.subVectors(_tip, this.prevTip).divideScalar(dt);
    this.prevTip.copy(_tip);
    this.swordBaseWorld(_base);
    this.game.fx.trail.push(_base, _tip, this.game.simTime);
  }
}
