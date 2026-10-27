// Base enemy: implements the shared Combatant interface, telegraphed attacks with
// wind-up / active / recovery phases, stagger + poise, knockback, spawn and death states.
import * as THREE from 'three';
import { HitTracker } from '../combat/combat.js';
import { ARENA } from '../config.js';
import { COLORS } from '../fx/fx.js';
import { toon, addOutline } from '../world/materials.js';
import { clamp, damp, approachAngle, rand, Ease } from '../core/mathutils.js';

let NEXT_ID = 1;
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();

/** Mesh helper shared by enemy builders (scale baked into geometry so outlines stay even). */
export function enemyPart(parent, geo, mat, { p = [0, 0, 0], r = [0, 0, 0], s = null, outline = 0.02, shadow = true } = {}) {
  if (s) geo.scale(s[0], s[1], s[2]);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(p[0], p[1], p[2]);
  m.rotation.set(r[0], r[1], r[2]);
  m.castShadow = shadow;
  if (outline > 0) addOutline(m, outline);
  parent.add(m);
  return m;
}

export function joint(parent, x = 0, y = 0, z = 0) {
  const j = new THREE.Object3D();
  j.position.set(x, y, z);
  j.rotation.order = 'YXZ';
  parent.add(j);
  return j;
}

export class Enemy {
  constructor(game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.id = NEXT_ID++;
    this.team = 'enemy';
    this.type = cfg.type;
    this.name = cfg.name;
    this.isBoss = !!cfg.isBoss;
    this.radius = cfg.radius;
    this.height = cfg.height;
    this.maxHp = cfg.hp;
    this.hp = cfg.hp;
    this.maxPoise = cfg.poise || 0;
    this.poise = this.maxPoise;
    this.kbResist = cfg.kbResist || 0;
    this.speed = cfg.speed;
    this.passive = !!cfg.passive;

    this.object = new THREE.Group();
    this.object.name = cfg.name;
    this.position = this.object.position;
    this.velocity = new THREE.Vector3();
    this.facing = 0;
    this.state = 'spawn';
    this.stateT = 0;
    this.spawnTime = cfg.spawnTime || 0.9;
    this.flash = 0;
    this.squash = 0;
    this.staggerT = 0;
    this.attack = null;
    this.attackT = 0;
    this.attackCd = rand(0.6, 1.6);
    this.tracker = new HitTracker();
    this.telegraph = null;
    this.hasToken = false;
    this.removed = false;
    this.deathT = 0;
    this.walkPhase = Math.random();
    this.moveSpeed = 0;
    this.grounded = true;
    this.flashMats = [];
    this.ownMats = [];
    this.lastHitTime = -10;
    this.anim = { t: 0 };
  }

  /** Creates a toon material whose emissive channel flashes on hit. */
  mat(color, opts = {}) {
    const m = toon(color, opts);
    m.emissive = new THREE.Color(0x000000);
    this.flashMats.push(m);
    return m;
  }

  /** Unlit glow material owned by this instance (disposed with it). */
  glowMat(color, opts = {}) {
    const m = new THREE.MeshBasicMaterial({ color, ...opts });
    this.ownMats.push(m);
    return m;
  }

  // ---------------------------------------------------------------- Combatant
  isDefeated() {
    return this.state === 'dead';
  }

  isInvulnerable() {
    return this.state === 'spawn';
  }

  receiveDamage(hit) {
    if (this.state === 'dead' || this.state === 'spawn') return { applied: false, killed: false, damage: 0 };
    const dmg = Math.max(1, Math.round(hit.damage * (0.94 + Math.random() * 0.12)));
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 1;
    this.squash = 1;
    this.lastHitTime = this.game.simTime;
    if (this.hp <= 0) {
      this.die(hit);
      return { applied: true, killed: true, damage: dmg };
    }
    this.onHurt(hit, dmg);
    return { applied: true, killed: false, damage: dmg };
  }

  applyKnockback(dir, force, lift = 0) {
    if (this.state === 'dead' && force <= 0) return;
    const k = 1 - this.kbResist;
    this.velocity.x += dir.x * force * k;
    this.velocity.z += dir.z * force * k;
    if (lift > 0) {
      this.velocity.y = Math.max(this.velocity.y, lift * k);
      if (lift * k > 0.5) this.grounded = false;
    }
  }

  onHurt(hit, dmg) {
    // Poise: light enemies stagger on every hit; heavy ones only when poise breaks.
    let stagger = hit.stagger || 0;
    if (this.maxPoise > 0) {
      this.poise -= dmg;
      if (this.poise <= 0) {
        this.poise = this.maxPoise;
        stagger = Math.max(stagger, this.cfg.breakStagger || 1.2);
        this.game.events.emit('poiseBreak', this);
      } else {
        stagger = 0;
      }
    }
    // the ultimate pins anything it cuts so the sequence reads cleanly
    if (hit.ultimate) stagger = Math.max(stagger, 0.6);
    if (stagger > 0) this.enterStagger(stagger);
  }

  enterStagger(duration) {
    this.cancelAttack();
    this.state = 'stagger';
    this.stateT = 0;
    this.staggerT = Math.max(this.staggerT, duration);
  }

  die(hit) {
    this.cancelAttack();
    this.state = 'dead';
    this.stateT = 0;
    this.deathT = 0;
    const fx = this.game.fx;
    _v.set(this.position.x, this.position.y + this.height * 0.5, this.position.z);
    fx.sparks(_v, { count: 30, speed: 8, colors: [COLORS.violet, COLORS.riftPink, 0xffffff], size: 0.08, life: 0.7 });
    fx.motes(_v, { count: 16, spread: this.radius, rise: 2, colors: [COLORS.violet, COLORS.riftPink], size: 0.08, life: 1.2 });
    this.game.audio.play('enemyDefeat');
  }

  // ---------------------------------------------------------------- attacks
  requestToken() {
    if (this.hasToken) return true;
    if (this.isBoss) return (this.hasToken = true);
    if (this.game.director.takeToken()) this.hasToken = true;
    return this.hasToken;
  }

  releaseToken() {
    if (this.hasToken && !this.isBoss) this.game.director.releaseToken();
    this.hasToken = false;
  }

  startAttack(def) {
    this.attack = def;
    this.attackT = 0;
    this.state = 'windup';
    this.stateT = 0;
    this.tracker.reset();
    this.faceTarget(100);
    if (def.telegraph !== false) {
      this.telegraph = this.game.fx.telegraphs.show({
        position: this.attackCenter(_v, def), yaw: this.facing, range: def.shape === 'circle' ? def.radius : def.range,
        halfAngle: def.shape === 'circle' ? Math.PI : def.halfAngle, duration: def.windup,
        color: def.color || 0xff3a2a,
      });
    }
    this.game.audio.play(def.windupSfx || 'enemyWindup');
    if (def.onWindup) def.onWindup(this);
  }

  cancelAttack() {
    if (this.telegraph) {
      this.game.fx.telegraphs.release(this.telegraph);
      this.telegraph = null;
    }
    if (this.attack) {
      this.attack = null;
      this.attackCd = rand(this.cfg.cdMin || 1, this.cfg.cdMax || 2);
    }
    this.releaseToken();
  }

  attackCenter(out, def) {
    _f.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    out.copy(this.position);
    if (def.shape === 'circle') out.addScaledVector(_f, def.offset || 0);
    return out;
  }

  updateAttack(dt) {
    const def = this.attack;
    this.attackT += dt;
    const t = this.attackT;
    if (this.state === 'windup') {
      if (t < def.windup * (def.trackUntil || 0.7)) {
        this.faceTarget(def.trackSpeed || 5, dt);
        if (this.telegraph) this.game.fx.telegraphs.move(this.telegraph, this.attackCenter(_v, def), this.facing);
      }
      this.velocity.x = damp(this.velocity.x, 0, 10, dt);
      this.velocity.z = damp(this.velocity.z, 0, 10, dt);
      if (t >= def.windup) {
        if (this.telegraph) {
          this.game.fx.telegraphs.release(this.telegraph);
          this.telegraph = null;
        }
        this.state = 'active';
        this.stateT = 0;
        this.game.audio.play(def.activeSfx || 'enemySwing');
        if (def.onActive) def.onActive(this);
      }
    } else if (this.state === 'active') {
      if (def.onActiveUpdate) def.onActiveUpdate(this, dt);
      if (!def.noMeleeHit) this.checkAttackHit(def);
      if (t >= def.windup + def.active) {
        this.state = 'recover';
        this.stateT = 0;
      }
    } else if (this.state === 'recover') {
      this.velocity.x = damp(this.velocity.x, 0, 8, dt);
      this.velocity.z = damp(this.velocity.z, 0, 8, dt);
      if (t >= def.windup + def.active + def.recover) {
        this.attack = null;
        this.state = 'chase';
        this.stateT = 0;
        this.attackCd = rand(this.cfg.cdMin || 1, this.cfg.cdMax || 2);
        this.releaseToken();
      }
    }
  }

  checkAttackHit(def) {
    const player = this.game.player;
    if (player.isDefeated() || this.tracker.has(player)) return;
    const combat = this.game.combat;
    let hits;
    if (def.shape === 'circle') {
      hits = combat.queryRadius(this.attackCenter(_v, def), def.radius, this.team, -1, 2.5);
    } else {
      _f.set(Math.sin(this.facing), 0, Math.cos(this.facing));
      hits = combat.querySector({ origin: this.position, forward: _f, range: def.range, halfAngle: def.halfAngle, team: this.team, yMin: -0.5, yMax: this.height + 0.3 });
    }
    for (const h of hits) {
      if (h.target !== player) continue;
      _f.set(player.position.x - this.position.x, 0, player.position.z - this.position.z).normalize();
      const hit = { damage: def.damage, knockback: def.knockback || 4, lift: def.lift || 0, stagger: 0.4, kind: 'enemy', source: this, dir: _f.clone() };
      const res = combat.applyHit(this, player, hit, this.tracker);
      if (res && res.applied) this.game.onPlayerHit(this, res, hit);
    }
  }

  faceTarget(speed, dt = 1) {
    const p = this.game.player.position;
    const yaw = Math.atan2(p.x - this.position.x, p.z - this.position.z);
    this.facing = approachAngle(this.facing, yaw, speed * dt);
  }

  distToPlayer() {
    const p = this.game.player.position;
    return Math.hypot(p.x - this.position.x, p.z - this.position.z);
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    this.stateT += dt;
    this.anim.t += dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    switch (this.state) {
      case 'spawn':
        this.updateSpawn(dt);
        break;
      case 'chase':
        if (this.game.player.isDefeated() || this.game.matchOver) this.idle(dt);
        else this.think(dt);
        break;
      case 'windup':
      case 'active':
      case 'recover':
        if (this.attack) this.updateAttack(dt);
        else this.state = 'chase';
        break;
      case 'stagger':
        this.staggerT -= dt;
        if (this.staggerT <= 0) {
          this.state = 'chase';
          this.stateT = 0;
        }
        break;
      case 'dead':
        this.deathT += dt;
        if (this.deathT > (this.cfg.deathTime || 1.3)) this.removed = true;
        break;
    }
    this.integrate(dt);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.squash = Math.max(0, this.squash - dt * 7);
    for (const m of this.flashMats) m.emissive.setScalar(this.flash * this.flash * 0.55);
    this.object.rotation.y = this.facing;
    this.animate(dt);
  }

  updateSpawn(dt) {
    const k = clamp(this.stateT / this.spawnTime, 0, 1);
    this.object.scale.setScalar(this.cfg.scale * Ease.outBack(k));
    if (this.stateT >= this.spawnTime) {
      this.object.scale.setScalar(this.cfg.scale);
      this.state = 'chase';
      this.stateT = 0;
    }
  }

  idle(dt) {
    this.velocity.x = damp(this.velocity.x, 0, 6, dt);
    this.velocity.z = damp(this.velocity.z, 0, 6, dt);
    this.moveSpeed = damp(this.moveSpeed, 0, 6, dt);
  }

  /** Default melee AI: approach, keep spacing, attack when in range and holding a token. */
  think(dt) {
    const d = this.distToPlayer();
    this.faceTarget(6, dt);
    const want = this.cfg.engageRange || 1.6;
    let speed = 0;
    if (this.passive) {
      speed = 0;
    } else if (d > want + 0.3) {
      speed = this.speed;
    } else if (d < want - 0.6) {
      speed = -this.speed * 0.4;
    }
    // without a token, circle at a respectful distance
    if (!this.passive && d < 4.5 && this.attackCd <= 0 && !this.requestToken()) {
      speed = d < 3.5 ? -this.speed * 0.3 : 0;
    }
    _f.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    this.velocity.x = damp(this.velocity.x, _f.x * speed, 6, dt);
    this.velocity.z = damp(this.velocity.z, _f.z * speed, 6, dt);
    this.moveSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (!this.passive && this.attackCd <= 0 && d <= (this.cfg.attackRange || 2.2) && this.requestToken()) {
      this.chooseAttack(d);
    }
  }

  chooseAttack() {}

  integrate(dt) {
    const p = this.position;
    p.x += this.velocity.x * dt;
    p.z += this.velocity.z * dt;
    if (!this.grounded || this.velocity.y > 0) {
      this.velocity.y -= 30 * dt;
      p.y += this.velocity.y * dt;
      if (p.y <= (this.cfg.hover || 0)) {
        p.y = this.cfg.hover || 0;
        this.velocity.y = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    }
    // friction on knockback-driven motion when not actively moving
    if (this.state === 'stagger' || this.state === 'dead' || this.state === 'spawn') {
      const f = Math.exp(-(this.grounded ? 7 : 1.5) * dt);
      this.velocity.x *= f;
      this.velocity.z *= f;
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

  animate() {}

  /** Chest-height anchor used by UI (health bars, lock reticle). */
  anchor(out) {
    return out.set(this.position.x, this.position.y + this.height + 0.35, this.position.z);
  }

  dispose() {
    this.cancelAttack();
    if (this.object.parent) this.object.parent.remove(this.object);
    for (const m of this.flashMats) m.dispose();
    for (const m of this.ownMats) m.dispose();
    // every enemy mesh owns its geometry (outline hulls share it; dispose is idempotent)
    this.object.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
  }
}
