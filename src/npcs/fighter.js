// A human NPC swordfighter. Fighters belong to a clan (their combat team), pick their own
// opponents (other clans, Kairo, or monsters), and behave like people rather than drones:
// they size each other up, circle and keep spacing, wind up readable swings, block or
// sidestep attacks they see coming, flinch and get knocked down, retreat when badly hurt,
// help clan-mates, hold grudges against whoever hurt them, celebrate, and talk.
//
// They share Kairo's skeleton and animator, and reuse his combo swings at NPC speed.
// Implements the Combatant interface (see combat/combat.js).
import * as THREE from 'three';
import { buildFighter } from './fighterModel.js';
import { NPC_DAMAGE, LINES, pickLine } from './clans.js';
import { KairoAnimator } from '../characters/kairo/kairoAnimator.js';
import { STANCE, F, createPose, buildKeys, sampleKeys } from '../characters/kairo/pose.js';
import { QUICK_DRAW, CROSSWIND, GALE_BREAKER, HURT, DASH_POSES } from '../characters/kairo/kairoMoves.js';
import { DIMS } from '../characters/kairo/kairoModel.js';
import { HitTracker } from '../combat/combat.js';
import { ARENA } from '../config.js';
import { COLORS } from '../fx/fx.js';
import { clamp, damp, approachAngle, angleDiff, rand, Ease } from '../core/mathutils.js';

let NEXT_ID = 5000;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _f = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _Fp = new THREE.Vector3();
const _Sp = new THREE.Vector3();
const HALF = Math.PI / 2;
const BLOB_GEO = new THREE.CircleGeometry(0.55, 20);
const BLOB_MAT = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
BLOB_GEO.userData.shared = true;

// ------------------------------------------------------------------ poses
// Standing at ease before the fight: upright, blade lowered towards the ground.
const RELAXED = createPose({
  ...STANCE,
  hipsY: -0.02, hipsYaw: -0.08, hipsPitch: 0, spinePitch: 0.02, spineYaw: 0, chestPitch: 0, chestYaw: 0.05,
  fRx: -0.12, fRz: 0.06, fRyaw: -0.15, fLx: 0.13, fLz: -0.05, fLyaw: 0.2, kneeR: 0.05, kneeL: 0.08,
  sTilt: 0, sPitch: 1.1, sPhi: -0.35, sReach: 0.18, sRoll: -HALF, sPx: -0.2, sPy: 0.98, sPz: 0.14,
  eRx: -0.6, eRy: -0.9, eRz: -0.2, hLx: 0.22, hLy: 0.93, hLz: 0.04, eLx: 0.7, eLy: -0.4, eLz: -0.5,
});
// High guard: blade held across the body, edge up, off hand bracing the back of the blade.
const GUARD = createPose({
  ...STANCE,
  hipsY: -0.12, hipsYaw: -0.15, spinePitch: 0.12, chestYaw: 0.15, headPitch: 0.05,
  fRz: 0.22, fLz: -0.22, kneeR: 0.3, kneeL: 0.45,
  sTilt: 0.15, sPitch: -0.1, sYaw: 0, sPhi: 1.35, sReach: 0.22, sRoll: -0.4, sPx: -0.24, sPy: 1.42, sPz: 0.3,
  eRx: -0.9, eRy: -0.2, eRz: -0.6, hLx: 0.2, hLy: 1.42, hLz: 0.34, eLx: 0.7, eLy: -0.2, eLz: -0.4,
});
// Blade thrust to the sky after a win.
const CHEER = buildKeys(STANCE, [
  { t: 0 },
  {
    t: 0.25, ease: 'outBack',
    hipsY: 0, spinePitch: -0.12, chestPitch: -0.12, headPitch: -0.35, chestYaw: 0, spineYaw: 0, hipsYaw: 0,
    sTilt: 0, sPitch: -1.45, sPhi: 0, sReach: 0.25, sRoll: 0, sPx: -0.1, sPy: 1.72, sPz: 0.08,
    eRx: -0.3, eRy: -0.8, eRz: 0.4, hLx: 0.3, hLy: 1.05, hLz: 0.15, kneeR: 0.05, kneeL: 0.05,
  },
  { t: 0.8, ease: 'inOutQuad', sPy: 1.78, headPitch: -0.4 },
  { t: 1.3, ease: 'inOutQuad', ...STANCE },
]);
// Knocked flat on the back, then back up via a kneel.
const LYING = {
  hipsY: -0.79, hipsZ: -0.32, hipsPitch: -1.35, hipsYaw: 0, hipsRoll: 0.05,
  spinePitch: -0.12, spineYaw: 0, chestPitch: -0.08, chestYaw: 0, headPitch: -0.75, headYaw: 0.3,
  fRx: -0.16, fRy: 0.08, fRz: 0.42, fRpitch: -1.1, fRyaw: -0.2, fLx: 0.2, fLy: 0.12, fLz: 0.3, fLpitch: -1.0, fLyaw: 0.3,
  kneeR: 0.05, kneeL: 0.25,
  sTilt: 0, sPitch: 1.45, sPhi: -1.2, sReach: 0.05, sRoll: 0, sPx: -0.42, sPy: 0.14, sPz: -0.62,
  eRx: -0.6, eRy: -0.2, eRz: -0.3, hLx: 0.4, hLy: 0.12, hLz: -0.7, eLx: 0.7, eLy: 0, eLz: -0.3,
};
const KNEEL = {
  hipsY: -0.47, hipsZ: 0, hipsPitch: 0.08, hipsYaw: -0.1, hipsRoll: 0, spinePitch: 0.45, chestPitch: 0.2, headPitch: 0.1, headYaw: 0,
  fRx: -0.13, fRy: 0.065, fRz: 0.3, fRpitch: 0, fRyaw: -0.1, fLx: 0.13, fLy: 0.11, fLz: -0.42, fLpitch: 1.25, fLyaw: 0.1, kneeR: 0.2, kneeL: 0.05,
  sTilt: 0, sPitch: 1.35, sPhi: 0, sReach: 0.3, sPx: -0.14, sPy: 0.92, sPz: 0.32, sRoll: 0,
  hLx: 0.12, hLy: 0.66, hLz: 0.22, eLx: 0.6, eLy: -0.2, eLz: -0.6,
};
const FALL = buildKeys(STANCE, [
  { t: 0 },
  { t: 0.12, ease: 'outQuad', spinePitch: -0.35, chestPitch: -0.2, headPitch: -0.4, hipsY: -0.2, hipsZ: -0.1, sPitch: 0.8 },
  { t: 0.42, ease: 'inQuad', ...LYING },
]);
const GETUP = buildKeys({ ...STANCE, ...LYING }, [
  { t: 0 },
  { t: 0.35, ease: 'inOutCubic', ...KNEEL },
  { t: 0.75, ease: 'inOutQuad', ...STANCE },
]);

// Swing chains a fighter can throw, weighted by clan aggression at pick time.
const CHAINS = {
  quick: [QUICK_DRAW],
  double: [QUICK_DRAW, CROSSWIND],
  full: [QUICK_DRAW, CROSSWIND, GALE_BREAKER],
  cross: [CROSSWIND],
  heavy: [GALE_BREAKER],
  crossHeavy: [CROSSWIND, GALE_BREAKER],
};

export class Fighter {
  constructor(game, clan, member) {
    this.game = game;
    this.clan = clan;
    this.member = member;
    this.style = clan.style;
    this.id = NEXT_ID++;
    this.isNpc = true;
    this.isBoss = false;
    this.type = 'npc';
    this.team = 'clan:' + clan.id;
    this.name = member.name;
    this.radius = 0.42;
    this.height = 1.85;
    this.maxHp = clan.style.hp;
    this.hp = this.maxHp;

    this.object = new THREE.Object3D();
    this.object.name = 'Fighter:' + member.name;
    this.model = buildFighter({ ...clan.palette, ...member.look });
    this.object.add(this.model.root);
    this.position = this.object.position;
    this.sword = this.model.sword;
    this.animator = new KairoAnimator(this.model);
    // soft blob shadow (crowds skip real shadow casting)
    this.blob = new THREE.Mesh(BLOB_GEO, BLOB_MAT);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 1;
    this.object.add(this.blob);
    this.outlinesOn = true;
    this.lodT = Math.random() * 0.3;

    this.velocity = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.facing = 0;
    this.grounded = true;
    this.state = 'intro';
    this.stateT = 0;
    this.live = false; // false until the brawl's "FIGHT!"
    this.removed = false;
    this.koT = 0;
    this.flash = 0;
    this.invulnT = 0;
    this.guardMeter = 100;
    this.guardT = 0;
    this.attackCd = rand(0.6, 1.6);
    this.atk = null;
    this.target = null;
    this.retargetT = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = rand(1, 2.5);
    this.strafing = false;
    this.spacing = rand(2.0, 2.6);
    this.retreated = false;
    this.grudge = new Map();
    this.threat = null; // { key, t, done } — the attack we are watching
    this.dodgeDir = new THREE.Vector3();
    this.downT = 0;
    this.lookTarget = null;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.speech = null; // { text, t, life } — drawn by the HUD
    this.speechCd = rand(0.5, 2);
    this.kos = 0;
    this.hasToken = false;
    this.idleLook = rand(0, 6);
    this.actionPose = createPose(STANCE);
    this.actionW = 0;
    this.trackers = [new HitTracker()];
  }

  // ---------------------------------------------------------------- Combatant
  isDefeated() {
    return this.state === 'ko';
  }

  isInvulnerable() {
    return this.invulnT > 0;
  }

  receiveDamage(hit) {
    if (this.state === 'ko') return { applied: false, killed: false, damage: 0 };
    if (this.invulnT > 0) return { applied: false, killed: false, damage: 0, dodged: true };
    const src = hit.source;
    if (src && src !== this) this.lookTarget = src;
    // blocked from the front?
    let frontal = true;
    if (src && src.position) {
      const yaw = Math.atan2(src.position.x - this.position.x, src.position.z - this.position.z);
      frontal = Math.abs(angleDiff(this.facing, yaw)) < 1.25;
    }
    if (this.state === 'guard' && frontal && !hit.ultimate && !hit.aura) {
      this.guardMeter -= hit.damage * (hit.kind === 'heavy' ? 2 : 1.2);
      if (this.guardMeter > 0) {
        const chip = Math.max(1, Math.round(hit.damage * 0.1));
        this.hp = Math.max(1, this.hp - chip);
        this.onBlocked(hit);
        return { applied: true, killed: false, damage: chip, blocked: true };
      }
      // guard broken: stagger and take a good part of the blow
      this.guardMeter = 0;
      hit = { ...hit, damage: hit.damage * 0.6 };
      this.say(pickLine(LINES.guardBreak), 1.2, true);
      this.game.audio.play('guardBreak');
    }
    const dmg = Math.max(1, Math.round(hit.damage * (0.94 + Math.random() * 0.12)));
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 1;
    if (src && src !== this) this.grudge.set(src, (this.grudge.get(src) || 0) + dmg);
    if (this.hp <= 0) {
      this.ko(src);
      return { applied: true, killed: true, damage: dmg };
    }
    if (hit.aura) return { applied: true, killed: false, damage: dmg };
    // reactions: flinch, or get knocked flat by heavy blows
    this.endAttack();
    if ((hit.kind === 'heavy' && Math.random() < 0.55) || (hit.lift || 0) > 3) this.knockDown();
    else this.enterHurt(clamp(hit.ultimate ? 0.7 : (hit.stagger || 0.3) + 0.15, 0.3, 0.75));
    if (Math.random() < 0.22 * this.member.chatty) this.say(pickLine(LINES.hurt), 1.1);
    return { applied: true, killed: false, damage: dmg };
  }

  applyKnockback(dir, force, lift = 0) {
    if (this.state === 'ko' && force <= 0) return;
    this.knock.addScaledVector(dir, force * (this.state === 'guard' ? 0.4 : 1));
    if (lift > 0) {
      this.velocity.y = Math.max(this.velocity.y, lift * 0.7);
      this.grounded = false;
    }
  }

  anchor(out) {
    return out.set(this.position.x, this.position.y + 2.12, this.position.z);
  }

  chestWorld(out) {
    return out.set(this.position.x, this.position.y + 1.25, this.position.z);
  }

  get facingDir() {
    return _f.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  // ---------------------------------------------------------------- talking
  /** Shows a speech bubble (rate-limited unless forced). */
  say(text, life = 1.6, force = false) {
    const d = this.game.director;
    const now = this.game.simTime;
    if (!force && (this.speechCd > 0 || now < d.nextSpeechAt)) return;
    d.nextSpeechAt = now + (force ? 0.5 : 0.9);
    this.speech = { text, t: 0, life };
    this.speechCd = rand(2.5, 5) / Math.max(0.3, this.member.chatty);
  }

  // ---------------------------------------------------------------- states
  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  enterHurt(t) {
    this.setState('hurt');
    this.hurtT = t;
    this.guardT = 0;
  }

  knockDown() {
    this.setState('down');
    this.downT = rand(0.7, 1.3);
    this.game.audio.play('thud');
  }

  ko(by) {
    this.endAttack();
    this.setState('ko');
    this.koT = 0;
    this.target = null;
    this.say(pickLine(LINES.ko), 2, true);
    this.game.audio.play('thud');
    this.game.events.emit('fighterDown', { fighter: this, by });
  }

  endAttack() {
    if (this.atk) {
      this.atk = null;
      this.attackCd = rand(1.0, 2.2) * (1.5 - this.style.aggression);
    }
    if (this.hasToken) {
      this.game.director.releaseToken();
      this.hasToken = false;
    }
  }

  onBlocked(hit) {
    const fx = this.game.fx;
    this.swordTip(_v).lerp(this.chestWorld(_v2), 0.45);
    fx.sparks(_v, { count: 14, speed: 9, spread: 1.4, colors: [0xffffff, 0xffe6a0, this.clan.color], size: 0.05, life: 0.3 });
    fx.flash({ position: _v, color: 0xfff2c8, size: 1.1, life: 0.12, kind: 'star' });
    this.game.audio.play('block');
    if (hit.source && hit.source.position) {
      _f.set(this.position.x - hit.source.position.x, 0, this.position.z - hit.source.position.z).normalize();
      this.knock.addScaledVector(_f, 2.2);
    }
    this.guardT = Math.max(this.guardT, 0.35);
    if (Math.random() < 0.3 * this.member.chatty) this.say(pickLine(LINES.block), 1);
  }

  swordTip(out) {
    return out.copy(DIMS.swordTip).applyMatrix4(this.sword.group.matrixWorld);
  }

  // ---------------------------------------------------------------- perception
  opponents() {
    return this.game.combat.opponents(this.team);
  }

  /** Who to fight: nearest, but weighted by grudges, wounded prey, helping clan-mates and Kairo. */
  pickTarget() {
    const player = this.game.player;
    const allies = this.game.director.enemies.filter((e) => e.isNpc && e !== this && e.team === this.team && !e.isDefeated());
    let best = null;
    let bestScore = -Infinity;
    for (const c of this.opponents()) {
      if (c.isNpc && !c.live) continue;
      const d = Math.hypot(c.position.x - this.position.x, c.position.z - this.position.z);
      let s = -d;
      if (c === this.target) s += 2.5;
      s += Math.min(10, (this.grudge.get(c) || 0) * 0.05);
      s += 3 * (1 - c.hp / c.maxHp);
      for (const a of allies) {
        if (a.target === c) s -= 1.2; // spread out a little
        if (c.target === a && a.hp < a.maxHp * 0.5) s += 2.5; // help a hurt clan-mate
      }
      if (c === player) {
        // the clans came to settle scores with each other; Kairo is a stranger until he gets involved
        s += this.member.playerBias - 2.5;
        if (player.gear >= 3 && this.member.bravery < 0.6 && !this.grudge.get(c)) s -= 3; // that aura is terrifying
      }
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (best && best !== this.target) {
      const prev = this.target;
      this.target = best;
      if (best === player && Math.random() < 0.6) this.say(pickLine(LINES.kairo));
      else if (prev && !prev.isDefeated()) this.say(pickLine(LINES.help));
      else if (Math.random() < 0.5) this.say(pickLine(this.clan.lines.engage));
    }
    this.target = best;
    this.lookTarget = best;
  }

  /** An attack about to land on us that we could react to, or null. */
  incomingThreat() {
    const player = this.game.player;
    let best = null;
    for (const c of this.game.combat.combatants) {
      if (c === this || c.team === this.team || c.isDefeated()) continue;
      const dx = this.position.x - c.position.x;
      const dz = this.position.z - c.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 4.6) continue;
      let key = null;
      let range = 3;
      let half = 1.3;
      if (c.isNpc) {
        const a = c.atk;
        if (!a || a.phase === 'recover') continue;
        key = c.id + ':' + a.serial;
        const h = a.move.hits[0];
        range = h.range;
        half = h.halfAngle;
      } else if (c === player) {
        if (c.ultimate.active) continue; // nobody reads the Crimson Tempest in time
        const m = c.state === 'action' ? c.act.move : null;
        if (!m || !m.hits) continue;
        const h = m.hits.find((x) => c.act.t < x.t1);
        if (!h) continue;
        key = 'k:' + m.id + ':' + Math.round((this.game.simTime - c.act.t) * 20);
        range = h.wave ? h.wave.r1 : h.range;
        half = h.halfAngle;
      } else {
        if (c.state !== 'windup' && c.state !== 'active') continue;
        key = 'e:' + c.id + ':' + Math.round((this.game.simTime - c.attackT) * 20);
      }
      if (d > range + 0.7) continue;
      const cos = (dx * Math.sin(c.facing) + dz * Math.cos(c.facing)) / Math.max(1e-4, d);
      if (Math.acos(clamp(cos, -1, 1)) > half + 0.3) continue;
      if (!best || d < best.d) best = { attacker: c, key, d };
    }
    return best;
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    this.stateT += dt;
    if (this.invulnT > 0) this.invulnT -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.speechCd > 0) this.speechCd -= dt;
    if (this.speech) {
      this.speech.t += dt;
      if (this.speech.t > this.speech.life) this.speech = null;
    }
    this.guardMeter = Math.min(100, this.guardMeter + dt * 22);
    this.flash = Math.max(0, this.flash - dt * 6);
    const over = this.game.matchOver || this.game.player.isDefeated();

    switch (this.state) {
      case 'ko':
        this.updateKo(dt);
        break;
      case 'intro':
        this.updateIntro(dt);
        break;
      case 'hurt':
        this.brake(dt, 7);
        if (this.stateT >= this.hurtT) this.setState('engage');
        break;
      case 'down':
        this.brake(dt, 5);
        if (this.stateT >= 0.42 + this.downT + 0.75) {
          this.setState('engage');
          this.invulnT = 0.2;
        }
        break;
      case 'dodge':
        this.updateDodge(dt);
        break;
      case 'guard':
        this.updateGuard(dt);
        break;
      case 'attack':
        this.updateAttack(dt);
        break;
      case 'taunt':
        this.brake(dt, 6);
        if (this.target) this.turnTo(this.target.position, 4, dt);
        if (this.stateT > 1.3) this.setState('engage');
        break;
      case 'retreat':
        this.updateRetreat(dt);
        break;
      default:
        if (over) this.updateOver(dt);
        else this.think(dt);
    }
    this.integrate(dt);
    this.animate(dt);
  }

  brake(dt, rate) {
    this.velocity.x = damp(this.velocity.x, 0, rate, dt);
    this.velocity.z = damp(this.velocity.z, 0, rate, dt);
    this.strafing = false;
  }

  turnTo(p, speed, dt) {
    const yaw = Math.atan2(p.x - this.position.x, p.z - this.position.z);
    this.facing = approachAngle(this.facing, yaw, speed * dt);
  }

  /** Pre-fight: stand with the clan, shift weight, look around and trade words. */
  updateIntro(dt) {
    this.brake(dt, 6);
    // a respectful bow to the other clans before steel is drawn
    if (this.bowAt === undefined) this.bowAt = rand(0.6, 3.2);
    if (this.stateT >= this.bowAt && this.stateT < this.bowAt + 1.1 && this.clan.id !== 'shadow') this.bow = Math.sin(((this.stateT - this.bowAt) / 1.1) * Math.PI);
    else this.bow = 0;
    this.idleLook -= dt;
    if (this.idleLook <= 0) {
      this.idleLook = rand(1.2, 3);
      const others = this.game.combat.opponents(this.team);
      this.lookTarget = others.length ? others[(Math.random() * others.length) | 0] : null;
    }
    if (this.live) this.setState('engage');
  }

  updateOver(dt) {
    this.brake(dt, 5);
    if (this.game.player.isDefeated() && this.state !== 'taunt' && this.stateT > 0.8 && Math.random() < dt * 0.4) {
      this.setState('taunt');
      this.say(pickLine(this.clan.lines.win), 1.6);
    }
  }

  /** The main decision loop while fighting. */
  think(dt) {
    this.setStateIfNeeded('engage');
    this.retargetT -= dt;
    if (!this.target || this.target.isDefeated() || this.retargetT <= 0) {
      this.retargetT = rand(0.7, 1.4);
      this.pickTarget();
    }
    const t = this.target;
    if (!t) {
      this.brake(dt, 4);
      return;
    }
    const dx = t.position.x - this.position.x;
    const dz = t.position.z - this.position.z;
    const d = Math.hypot(dx, dz);

    // read incoming attacks and react like a person would: a beat late, sometimes not at all
    const threat = this.incomingThreat();
    if (threat) {
      if (!this.threat || this.threat.key !== threat.key) this.threat = { key: threat.key, t: 0, done: false };
      this.threat.t += dt;
      if (!this.threat.done && this.threat.t >= this.member.reaction) {
        this.threat.done = true;
        if (this.react(threat.attacker)) return;
      }
    }

    // badly hurt: fall back once and shout for help
    const retreatAt = (1 - this.member.bravery) * 0.45;
    if (!this.retreated && this.hp < this.maxHp * retreatAt && d < 6) {
      this.retreated = true;
      this.setState('retreat');
      this.retreatT = rand(2.2, 3.8);
      this.say(pickLine(LINES.retreat), 1.6, true);
      return;
    }

    // spacing: close in, then circle at sword's length, stepping in and out
    this.turnTo(t.position, 7, dt);
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = rand(0.9, 2.4);
      if (Math.random() < 0.65) this.strafeDir *= -1;
      this.spacing = rand(1.9, 2.8);
    }
    const nx = dx / Math.max(d, 1e-4);
    const nz = dz / Math.max(d, 1e-4);
    let fwd = 0;
    let side = 0;
    if (d > 4.2) {
      fwd = this.style.speed;
      this.strafing = false;
    } else {
      this.strafing = true;
      fwd = clamp((d - this.spacing) * 3, -2.5, 3.2);
      side = this.strafeDir * 2.2;
    }
    const vx = nx * fwd + nz * side;
    const vz = nz * fwd - nx * side;
    this.velocity.x = damp(this.velocity.x, vx, 6, dt);
    this.velocity.z = damp(this.velocity.z, vz, 6, dt);

    // attack when in reach, facing the target, and (against Kairo) holding an attack token
    const aim = Math.abs(angleDiff(this.facing, Math.atan2(dx, dz)));
    if (this.attackCd <= 0 && d < 3.1 && aim < 0.5) {
      if (t === this.game.player && !this.takeToken()) {
        this.attackCd = rand(0.3, 0.6);
        return;
      }
      if (Math.random() < 0.08) {
        // a feint: twitch the blade and hop back, just to see the reaction
        this.attackCd = rand(0.5, 0.9);
        this.knock.addScaledVector(_v.set(-nx, 0, -nz), 4);
        return;
      }
      this.startAttack(this.pickChain(d));
    }
  }

  setStateIfNeeded(s) {
    if (this.state !== s) this.setState(s);
  }

  takeToken() {
    if (this.hasToken) return true;
    if (this.game.director.takeToken()) this.hasToken = true;
    return this.hasToken;
  }

  pickChain(d) {
    const ag = this.style.aggression;
    const r = Math.random();
    if (d > 2.8) return r < 0.5 ? CHAINS.cross : CHAINS.heavy;
    if (r < 0.25 * ag) return CHAINS.full;
    if (r < 0.55 * ag + 0.1) return CHAINS.double;
    if (r < 0.7) return Math.random() < 0.5 ? CHAINS.quick : CHAINS.cross;
    return Math.random() < 0.5 ? CHAINS.heavy : CHAINS.crossHeavy;
  }

  /** Respond to an attack we saw coming: sidestep, raise the guard, or swing first. */
  react(attacker) {
    if (this.state === 'attack' && this.atk && this.atk.phase !== 'chamber') return false;
    const r = Math.random();
    const st = this.style;
    if (r < st.dodge) {
      this.endAttack();
      this.startDodge(attacker);
      return true;
    }
    if (r < st.dodge + st.guard) {
      this.endAttack();
      this.setState('guard');
      this.guardT = rand(0.5, 0.9);
      this.lookTarget = attacker;
      return true;
    }
    return false;
  }

  startDodge(attacker) {
    this.setState('dodge');
    this.invulnT = 0.26;
    const ax = this.position.x - attacker.position.x;
    const az = this.position.z - attacker.position.z;
    const l = Math.hypot(ax, az) || 1;
    const back = Math.random() < 0.35;
    if (back) {
      this.dodgeDir.set(ax / l, 0, az / l);
      this.dodgePose = 'back';
    } else {
      const s = Math.random() < 0.5 ? 1 : -1;
      this.dodgeDir.set((az / l) * s, 0, (-ax / l) * s);
      // which way is that relative to our facing? (+x local = left)
      const lx = this.dodgeDir.x * Math.cos(this.facing) - this.dodgeDir.z * Math.sin(this.facing);
      this.dodgePose = lx > 0 ? 'left' : 'right';
    }
    this.game.fx.dust(this.position, { count: 5, radius: 0.3, speed: 2.5, alpha: 0.25, size: 0.4 });
    this.game.audio.play('dash');
    if (Math.random() < 0.35 * this.member.chatty) this.say(pickLine(LINES.dodge), 1);
  }

  updateDodge(dt) {
    const k = 1 - clamp(this.stateT / 0.3, 0, 1);
    const sp = 9.5 * k;
    this.velocity.x = this.dodgeDir.x * sp;
    this.velocity.z = this.dodgeDir.z * sp;
    this.strafing = true;
    if (this.stateT >= 0.34) this.setState('engage');
  }

  updateGuard(dt) {
    this.guardT -= dt;
    const t = this.lookTarget && !this.lookTarget.isDefeated() ? this.lookTarget : this.target;
    if (t) {
      this.turnTo(t.position, 9, dt);
      _v.set(this.position.x - t.position.x, 0, this.position.z - t.position.z).normalize();
      this.velocity.x = damp(this.velocity.x, _v.x * 0.8, 6, dt);
      this.velocity.z = damp(this.velocity.z, _v.z * 0.8, 6, dt);
    } else {
      this.brake(dt, 6);
    }
    this.strafing = true;
    if (this.guardT <= 0 && !this.incomingThreat()) {
      this.setState('engage');
      // a counter-attack right after a good block
      if (t && Math.random() < 0.5 && Math.hypot(t.position.x - this.position.x, t.position.z - this.position.z) < 3) this.attackCd = 0;
    }
  }

  updateRetreat(dt) {
    this.retreatT -= dt;
    // run away from the nearest opponent, but stay inside the arena
    let nearest = null;
    let nd = Infinity;
    for (const c of this.opponents()) {
      const d = Math.hypot(c.position.x - this.position.x, c.position.z - this.position.z);
      if (d < nd) {
        nd = d;
        nearest = c;
      }
    }
    if (nearest) {
      _v.set(this.position.x - nearest.position.x, 0, this.position.z - nearest.position.z).normalize();
      _v.addScaledVector(_v2.set(-this.position.x, 0, -this.position.z).normalize(), Math.hypot(this.position.x, this.position.z) > ARENA.radius * 0.7 ? 0.8 : 0.2).normalize();
      const yaw = Math.atan2(_v.x, _v.z);
      this.facing = approachAngle(this.facing, yaw, 8 * dt);
      const sp = this.style.speed * 0.9;
      this.velocity.x = damp(this.velocity.x, Math.sin(this.facing) * sp, 6, dt);
      this.velocity.z = damp(this.velocity.z, Math.cos(this.facing) * sp, 6, dt);
      this.lookTarget = nearest;
    }
    this.strafing = false;
    if (this.retreatT <= 0 || nd > 12) this.setState('engage');
  }

  // ---------------------------------------------------------------- attacking
  startAttack(chain) {
    this.setState('attack');
    this.atk = { chain, i: 0, move: chain[0], t: 0, mt: 0, prevMt: 0, hold: this.style.windup * rand(0.8, 1.25), phase: 'chamber', serial: Math.random(), fxDone: new Set() };
    this.prepareTrackers();
    // the blade catches the light as they wind up: readable, and very anime
    this.game.fx.flash({ position: this.swordTip(_v), color: 0xffffff, size: 0.55, life: 0.16, kind: 'star', opacity: 0.85 });
    if (Math.random() < 0.15 * this.member.chatty) this.say(['Hyah!', 'Haaa!', 'Take this!', 'Hah!'][(Math.random() * 4) | 0], 0.8);
  }

  prepareTrackers() {
    const n = this.atk.move.hits.length;
    while (this.trackers.length < n) this.trackers.push(new HitTracker());
    for (const tr of this.trackers) tr.reset();
  }

  updateAttack(dt) {
    const a = this.atk;
    if (!a) {
      this.setState('engage');
      return;
    }
    const m = a.move;
    a.t += dt;
    const kWind = m.keys[1].t;
    let mt;
    if (a.t < a.hold) {
      mt = kWind * Ease.outQuad(a.t / a.hold);
      a.phase = 'chamber';
      if (this.target) this.turnTo(this.target.position, 6, dt);
      this.brake(dt, 8);
    } else {
      mt = kWind + (a.t - a.hold) * this.style.attackSpeed;
      a.phase = mt < m.hits[m.hits.length - 1].t1 ? 'active' : 'recover';
      this.brake(dt, 6);
    }
    a.prevMt = a.mt;
    a.mt = mt;
    sampleKeys(m.keys, mt, this.actionPose);
    // forward steps of the swing (skip if already in their face)
    const d = this.target ? Math.hypot(this.target.position.x - this.position.x, this.target.position.z - this.position.z) : 9;
    for (const l of m.lunges || []) {
      if (mt >= l.t0 && mt <= l.t1 && d > 1.3) {
        const sp = (l.dist / (l.t1 - l.t0)) * this.style.attackSpeed * 0.8;
        this.velocity.x = Math.sin(this.facing) * sp;
        this.velocity.z = Math.cos(this.facing) * sp;
      }
    }
    (m.fx || []).forEach((e, i) => {
      if (!a.fxDone.has(i) && mt >= e.t) {
        a.fxDone.add(i);
        if (e.type === 'sfx') this.game.audio.play(e.name, e);
        else if (e.type === 'arc') this.spawnArc(e);
      }
    });
    m.hits.forEach((h, i) => {
      if (a.prevMt <= h.t1 && mt >= h.t0) this.performHit(h, this.trackers[i]);
    });
    // continue the chain, or finish
    if (a.i + 1 < a.chain.length && mt >= m.cancel) {
      if (this.target && !this.target.isDefeated() && d < 3.6) {
        a.i++;
        a.move = a.chain[a.i];
        a.t = 0;
        a.mt = a.prevMt = 0;
        a.hold = rand(0.05, 0.12);
        a.serial = Math.random();
        a.fxDone.clear();
        this.prepareTrackers();
        return;
      }
    }
    if (mt >= m.duration) {
      this.endAttack();
      this.setState('engage');
    }
  }

  performHit(h, tracker) {
    const g = this.game;
    const f = this.facingDir;
    const hits = g.combat.querySector({ origin: this.position, forward: f, range: h.range, halfAngle: h.halfAngle, team: this.team, yMin: -0.6, yMax: 2.6 });
    const targets = hits.map((x) => x.target);
    for (const target of targets) {
      if (tracker.has(target)) continue;
      const point = new THREE.Vector3(target.position.x, target.position.y + Math.min(1.2, target.height * 0.55), target.position.z);
      const hit = {
        // clan-on-clan blows are softened so the brawl lasts long enough for Kairo to join in
        damage: NPC_DAMAGE[h.kind] * this.style.damage * (target === g.player ? 1 : 0.55), knockback: (h.knockback || 2) * 0.8, lift: (h.lift || 0) * 0.6, stagger: h.stagger || 0.3,
        kind: target === g.player ? 'enemy' : h.kind, source: this, dir: f.clone(), point, npc: true,
      };
      const res = g.combat.applyHit(this, target, hit, tracker);
      if (!res || !res.applied) continue;
      if (target === g.player) g.onPlayerHit(this, res, hit);
      else if (!res.blocked) g.fx.impact(point, f, { heavy: h.kind === 'heavy', scale: 0.75 });
      if (!res.blocked) g.audio.play(h.kind === 'heavy' ? 'hitHeavy' : 'hit', { pitch: 0.85 });
      if (res.killed) this.onKo(target);
    }
  }

  onKo(victim) {
    this.kos++;
    if (this.target === victim) this.target = null;
    this.retargetT = 0;
    this.endAttack();
    this.setState('taunt');
    this.say(pickLine(Math.random() < 0.6 ? this.clan.lines.win : LINES.taunt), 1.6, true);
  }

  spawnArc(e) {
    const p = this.actionPose;
    _e.set(e.pitch || 0, e.yaw || 0, e.tilt || 0, 'YXZ');
    _q.setFromEuler(_e);
    this.model.root.updateWorldMatrix(true, false);
    const mq = this.model.root.getWorldQuaternion(new THREE.Quaternion());
    _Fp.set(0, 0, 1).applyQuaternion(_q).applyQuaternion(mq);
    _Sp.set(1, 0, 0).applyQuaternion(_q).applyQuaternion(mq);
    _v.set(p[F.sPx], p[F.sPy], p[F.sPz]);
    this.model.root.localToWorld(_v);
    this.game.fx.slash({
      origin: _v, F: _Fp, S: _Sp, a0: e.phi0, a1: e.phi1, radius: e.radius * 0.95, thickness: e.thickness * 0.8, life: e.life,
      sweep: e.sweep, accent: 0, opacity: (e.opacity || 0.6) * 0.7, body: this.clan.color, core: 0xffffff,
    });
  }

  // ---------------------------------------------------------------- KO
  updateKo(dt) {
    this.koT += dt;
    this.brake(dt, 4);
    // bodies stay down for a while, then fade into the floor
    if (this.koT > 7) this.position.y = -Math.min(1, (this.koT - 7) / 1.2) * 0.6;
    if (this.koT > 8.2) this.removed = true;
  }

  // ---------------------------------------------------------------- physics
  integrate(dt) {
    const p = this.position;
    const kf = Math.exp(-6 * dt);
    p.x += (this.velocity.x + this.knock.x) * dt;
    p.z += (this.velocity.z + this.knock.z) * dt;
    this.knock.multiplyScalar(kf);
    if (!this.grounded || this.velocity.y > 0) {
      this.velocity.y -= 30 * dt;
      p.y += this.velocity.y * dt;
      if (p.y <= 0) {
        p.y = 0;
        this.velocity.y = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    }
    const maxR = ARENA.radius - this.radius;
    const r = Math.hypot(p.x, p.z);
    if (r > maxR) {
      p.x *= maxR / r;
      p.z *= maxR / r;
    }
    for (const c of this.game.arena.colliders) {
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

  // ---------------------------------------------------------------- animation
  animate(dt) {
    let act = true;
    const P = this.actionPose;
    switch (this.state) {
      case 'intro':
        P.set(RELAXED);
        // breathing and a little weight shift; gestures while talking
        P[F.hipsX] = Math.sin(this.animator.time * 0.7 + this.id) * 0.025;
        P[F.spinePitch] += Math.sin(this.animator.time * 1.6) * 0.015 + (this.bow || 0) * 0.55;
        P[F.headPitch] += (this.bow || 0) * 0.35;
        if (this.speech) {
          const s = Math.sin(this.speech.t * 7);
          P[F.hLx] = 0.32 + s * 0.04;
          P[F.hLy] = 1.18 + Math.abs(s) * 0.05;
          P[F.hLz] = 0.3;
          P[F.headPitch] = s * 0.05;
        }
        break;
      case 'attack':
        break; // sampled in updateAttack
      case 'guard':
        P.set(GUARD);
        break;
      case 'hurt':
        sampleKeys(HURT.keys, Math.min(this.stateT * (0.4 / Math.max(0.3, this.hurtT)), 0.4), P);
        break;
      case 'down':
        if (this.stateT < 0.42 + this.downT) sampleKeys(FALL, this.stateT, P);
        else sampleKeys(GETUP, this.stateT - 0.42 - this.downT, P);
        break;
      case 'ko':
        sampleKeys(FALL, this.koT, P);
        break;
      case 'taunt':
        sampleKeys(CHEER, this.stateT, P);
        break;
      case 'dodge': {
        P.set(STANCE);
        const k = Math.sin(clamp(this.stateT / 0.34, 0, 1) * Math.PI);
        const pose = DASH_POSES[this.dodgePose] || DASH_POSES.back;
        for (const key in pose) P[F[key]] = STANCE[key] + (pose[key] - STANCE[key]) * k;
        break;
      }
      default:
        act = false;
    }
    this.actionW = damp(this.actionW, act ? 1 : 0, act ? 18 : 9, dt);
    this.object.rotation.y = this.facing;
    this.animator.update(dt, {
      root: this.object, vel: this.velocity, grounded: this.grounded, landT: 0, locked: this.strafing,
      action: this.actionW > 0.001 ? P : null, weight: this.actionW,
    });
    // people look at what they care about: their opponent, whoever hit them, a speaker
    let ty = 0;
    let tp = 0;
    const lt = this.lookTarget;
    if (lt && lt.position && this.state !== 'ko' && this.state !== 'down') {
      const yaw = Math.atan2(lt.position.x - this.position.x, lt.position.z - this.position.z);
      ty = clamp(angleDiff(this.facing, yaw), -1.1, 1.1);
      tp = clamp(-((lt.position.y + 1.5) - (this.position.y + 1.6)) / 4, -0.3, 0.3);
    }
    this.lookYaw = damp(this.lookYaw, ty, 6, dt);
    this.lookPitch = damp(this.lookPitch, tp, 6, dt);
    const j = this.model.joints;
    j.get('neck').rotation.y += this.lookYaw * 0.35;
    j.get('head').rotation.y += this.lookYaw * 0.65;
    j.get('head').rotation.x += this.lookPitch;
    for (const m of this.model.flashMats) m.emissive.setScalar(this.flash * this.flash * 0.5);
    // blob shadow stays on the floor; outlines drop out at a distance (fewer draw calls)
    this.blob.position.set(0, 0.02 - this.position.y, 0);
    this.blob.scale.setScalar(this.state === 'ko' || this.state === 'down' ? 1.6 : 1);
    this.lodT -= dt;
    if (this.lodT <= 0) {
      this.lodT = 0.3;
      const cam = this.game.camera.position;
      const on = Math.hypot(cam.x - this.position.x, cam.z - this.position.z) < 17;
      if (on !== this.outlinesOn) {
        this.outlinesOn = on;
        for (const o of this.model.outlines) o.visible = on;
      }
    }
  }

  dispose() {
    this.endAttack();
    if (this.object.parent) this.object.parent.remove(this.object);
    this.object.traverse((o) => {
      if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    });
    // only this fighter's own materials (outline materials are shared app-wide)
    const s = this.sword;
    const mats = new Set([...Object.values(this.model.materials), ...this.model.flashMats, s.steel, s.edge, s.energyMat, s.auraMat]);
    for (const m of mats) if (m) m.dispose();
  }
}
