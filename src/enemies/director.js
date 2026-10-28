// Wave director: spawns waves, enforces attack tokens, separates crowds,
// removes finished corpses, and handles the training-grounds dummies.
import * as THREE from 'three';
import { RiftGhoul } from './riftGhoul.js';
import { ShadeCaster } from './shadeCaster.js';
import { RiftWarden } from './boss.js';
import { Fighter } from '../npcs/fighter.js';
import { CLANS, LINES, pickLine } from '../npcs/clans.js';
import { COLORS } from '../fx/fx.js';
import { rand } from '../core/mathutils.js';

const BRAWL_INTRO = 5.2; // seconds of standoff before the gong

export const WAVES = [
  { name: 'WAVE 1', title: 'The Rift Opens', spawns: [['ghoul', 3]], tokens: 2 },
  { name: 'WAVE 2', title: 'Shadows Gather', spawns: [['ghoul', 3], ['caster', 2]], tokens: 2 },
  { name: 'FINAL WAVE', title: 'The Warden Awakens', spawns: [['boss', 1], ['ghoul', 2]], tokens: 2, boss: true },
];

const TRAINING_SLOTS = [
  [0, 6.5],
  [-4.5, 9],
  [4.5, 9],
];

const _v = new THREE.Vector3();

export class WaveDirector {
  constructor(game) {
    this.game = game;
    this.enemies = [];
    this.queue = [];
    this.tokens = 0;
    this.maxTokens = 2;
    this.mode = 'assault';
    this.state = 'idle';
    this.timer = 0;
    this.wave = -1;
    this.boss = null;
    this.slots = [];
    this.kills = 0;
    this.playerKos = 0;
    this.fighters = [];
    this.brawlSize = 3; // fighters per clan
    this.script = [];
    this.lastStand = false;
    this.nextSpeechAt = 0; // one voice at a time, so bubbles stay readable
    game.events.on('fighterDown', (e) => this.onFighterDown(e));
  }

  reset() {
    for (const e of this.enemies) {
      this.game.combat.unregister(e);
      e.dispose();
    }
    this.enemies.length = 0;
    this.queue.length = 0;
    this.tokens = 0;
    this.boss = null;
    this.state = 'idle';
    this.wave = -1;
    this.slots = [];
    this.kills = 0;
    this.playerKos = 0;
    this.fighters = [];
    this.script = [];
    this.lastStand = false;
  }

  start(mode) {
    this.reset();
    this.mode = mode;
    if (mode === 'training') {
      this.state = 'training';
      this.slots = TRAINING_SLOTS.map(([x, z]) => ({ x, z, enemy: null, respawn: 0.3 }));
    } else if (mode === 'brawl') {
      this.state = 'brawlIntro';
      this.timer = BRAWL_INTRO;
      this.maxTokens = 3;
      this.spawnBrawl();
    } else {
      this.state = 'intro';
      this.timer = 1.4;
    }
  }

  get totalWaves() {
    return WAVES.length;
  }

  get aliveCount() {
    let n = this.queue.length;
    for (const e of this.enemies) if (!e.isDefeated()) n++;
    return n;
  }

  takeToken() {
    if (this.tokens >= this.maxTokens) return false;
    this.tokens++;
    return true;
  }

  releaseToken() {
    this.tokens = Math.max(0, this.tokens - 1);
  }

  spawn(type, x, z, opts = {}) {
    let e;
    if (type === 'caster') e = new ShadeCaster(this.game);
    else if (type === 'boss') e = new RiftWarden(this.game);
    else e = new RiftGhoul(this.game, opts);
    e.position.set(x, e.cfg.hover || 0, z);
    e.facing = Math.atan2(this.game.player.position.x - x, this.game.player.position.z - z);
    e.object.rotation.y = e.facing;
    e.object.scale.setScalar(0.01);
    this.game.scene.add(e.object);
    this.game.combat.register(e);
    this.enemies.push(e);
    if (type === 'boss') this.boss = e;
    // rift portal
    const fx = this.game.fx;
    _v.set(x, 0, z);
    fx.ring({ position: _v, radius: type === 'boss' ? 5 : 2.2, life: 0.7, width: 0.12, inner: 0x5a2a99, outer: COLORS.riftPink });
    fx.swirl(_v, { count: type === 'boss' ? 60 : 24, radius: type === 'boss' ? 2.5 : 1, radiusVel: -0.8, angVel: 6, rise: 2.5, colors: [COLORS.violet, COLORS.riftPink, 0xffffff], size: 0.08, life: 0.9, yRange: 0.3 });
    fx.light(_v.setY(1), COLORS.violet, 20, 5);
    this.game.events.emit('enemySpawned', e);
    return e;
  }

  spawnPoint(minFromPlayer = 9) {
    const p = this.game.player.position;
    for (let i = 0; i < 24; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(9, 18);
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (Math.hypot(x - p.x, z - p.z) < minFromPlayer) continue;
      let ok = true;
      for (const c of this.game.arena.colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + 1.5) ok = false;
      for (const e of this.enemies) if (!e.isDefeated() && Math.hypot(x - e.position.x, z - e.position.z) < e.radius + 1.5) ok = false;
      if (ok) return [x, z];
    }
    return [-p.x * 0.5 + 10, -p.z * 0.5];
  }

  startWave(i) {
    const w = WAVES[i];
    this.wave = i;
    this.maxTokens = w.tokens;
    this.queue.length = 0;
    for (const [type, n] of w.spawns) for (let k = 0; k < n; k++) this.queue.push(type);
    // boss first so it gets the dramatic entrance
    this.queue.sort((a, b) => (a === 'boss' ? -1 : b === 'boss' ? 1 : 0));
    this.spawnT = 0.2;
    this.state = 'fighting';
    this.game.events.emit('waveStart', { index: i, total: WAVES.length, name: w.name, title: w.title, boss: !!w.boss });
  }

  summonAdds(boss, n) {
    for (let i = 0; i < n; i++) {
      const a = boss.facing + (i ? 2.2 : -2.2);
      const x = boss.position.x + Math.sin(a) * 4;
      const z = boss.position.z + Math.cos(a) * 4;
      const r = Math.hypot(x, z);
      const k = r > 20 ? 20 / r : 1;
      this.spawn('ghoul', x * k, z * k);
    }
  }

  update(dt) {
    const g = this.game;
    // spawn queue
    if (this.queue.length) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        const type = this.queue.shift();
        const [x, z] = type === 'boss' ? this.bossPoint() : this.spawnPoint();
        this.spawn(type, x, z);
        this.spawnT = type === 'boss' ? 1.2 : 0.45;
      }
    }
    for (const e of this.enemies) e.update(dt);
    this.separate();
    if (this.state === 'brawlIntro' || this.state === 'brawl') this.updateBrawl(dt);
    // corpse cleanup
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.removed) {
        g.combat.unregister(e);
        e.dispose();
        this.enemies.splice(i, 1);
        if (e === this.boss) this.boss = null;
      }
    }

    if (this.state === 'intro') {
      this.timer -= dt;
      if (this.timer <= 0) this.startWave(0);
    } else if (this.state === 'fighting') {
      if (this.aliveCount === 0 && !g.player.isDefeated()) {
        if (this.wave >= WAVES.length - 1) {
          this.state = 'victory';
          g.events.emit('victory', {});
        } else {
          this.state = 'cleared';
          this.timer = 3.2;
          g.events.emit('waveClear', { index: this.wave });
        }
      }
    } else if (this.state === 'cleared') {
      this.timer -= dt;
      if (this.timer <= 0) this.startWave(this.wave + 1);
    } else if (this.state === 'training') {
      for (const s of this.slots) {
        if (s.enemy && s.enemy.isDefeated()) s.enemy = null;
        if (!s.enemy) {
          s.respawn -= dt;
          if (s.respawn <= 0) {
            s.enemy = this.spawn('ghoul', s.x, s.z, { passive: true, hp: 900 });
            s.respawn = 2;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ clan brawl
  /** Three clans gather in groups around Kairo, trade words, then fight everyone. */
  spawnBrawl() {
    const g = this.game;
    // ahead and to either side of Kairo, so the camera sees every clan gather
    const homes = [0, 1.35, -1.35];
    CLANS.forEach((clan, ci) => {
      const a = homes[ci];
      const cx = Math.sin(a) * 14;
      const cz = Math.cos(a) * 14 - 3;
      clan.members.slice(0, this.brawlSize).forEach((member, mi) => {
        const f = new Fighter(g, clan, member);
        const off = (mi - (this.brawlSize - 1) / 2) * 1.7;
        f.position.set(cx + Math.cos(a) * off, 0, cz - Math.sin(a) * off);
        f.facing = Math.atan2(-f.position.x, -3 - f.position.z) + rand(-0.25, 0.25);
        f.object.rotation.y = f.facing;
        g.scene.add(f.object);
        g.combat.register(f);
        this.enemies.push(f);
        this.fighters.push(f);
      });
    });
    // the standoff: each clan speaks up, someone notices Kairo
    const leaders = CLANS.map((c) => this.fighters.find((f) => f.clan === c));
    this.script = [
      [BRAWL_INTRO - 0.4, leaders[0], pickLine(CLANS[0].lines.greet)],
      [BRAWL_INTRO - 1.5, leaders[1], pickLine(CLANS[1].lines.greet)],
      [BRAWL_INTRO - 2.6, leaders[2], pickLine(CLANS[2].lines.greet)],
      [BRAWL_INTRO - 3.6, this.fighters[(Math.random() * this.fighters.length) | 0], pickLine(LINES.kairo)],
    ];
  }

  updateBrawl(dt) {
    const g = this.game;
    if (this.state === 'brawlIntro') {
      const before = this.timer;
      this.timer -= dt;
      for (const s of this.script) {
        if (before > s[0] && this.timer <= s[0] && s[1]) {
          s[1].say(s[2], 1.7, true);
          for (const f of this.fighters) if (f !== s[1]) f.lookTarget = s[1];
        }
      }
      for (const n of [3, 2, 1]) if (before > n && this.timer <= n) g.events.emit('brawlCount', n);
      if (this.timer <= 0) {
        this.state = 'brawl';
        for (const f of this.fighters) f.live = true;
        g.events.emit('brawlStart', {});
      }
    } else if (this.state === 'brawl') {
      const alive = this.fighters.filter((f) => !f.isDefeated());
      if (!alive.length && !g.player.isDefeated()) {
        this.state = 'victory';
        g.events.emit('victory', {});
        return;
      }
      // when one clan is all that is left, they square up to Kairo
      if (!this.lastStand && alive.length && alive.every((f) => f.team === alive[0].team)) {
        this.lastStand = true;
        alive[0].say(pickLine(LINES.last), 2, true);
        for (const f of alive) f.target = g.player;
        g.events.emit('lastClan', { clan: alive[0].clan });
      }
    }
  }

  onFighterDown({ fighter, by }) {
    if (by === this.game.player) this.playerKos++;
    // a clan-mate reacts to the loss
    const near = this.fighters
      .filter((f) => f !== fighter && f.team === fighter.team && !f.isDefeated())
      .sort((a, b) => a.position.distanceTo(fighter.position) - b.position.distanceTo(fighter.position))[0];
    if (near) {
      near.say(pickLine(LINES.allyDown, { name: fighter.name }), 1.6, true);
      if (by && !by.isDefeated()) {
        near.grudge.set(by, (near.grudge.get(by) || 0) + 120);
        near.retargetT = 0;
      }
    }
    // whoever is close and saw Kairo's Gear aura lose their nerve
    const k = this.game.player;
    if (by === k && k.gear >= 3) {
      const watcher = this.fighters.find((f) => !f.isDefeated() && f !== near && f.position.distanceTo(k.position) < 12);
      if (watcher) watcher.say(pickLine(LINES.power), 1.6, true);
    }
  }

  get fightersLeft() {
    return this.fighters.filter((f) => !f.isDefeated()).length;
  }

  bossPoint() {
    const p = this.game.player.position;
    const l = Math.hypot(p.x, p.z);
    if (l < 2) return [0, -12];
    return [(-p.x / l) * 12, (-p.z / l) * 12];
  }

  /** Pushes overlapping enemies apart and out of the player. */
  separate() {
    const list = this.enemies;
    const player = this.game.player;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.isDefeated()) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.isDefeated()) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d = Math.hypot(dx, dz);
        const min = a.radius + b.radius;
        if (d < min && d > 1e-4) {
          const push = (min - d) / d;
          const wa = b.radius / min;
          const wb = a.radius / min;
          a.position.x -= dx * push * wa;
          a.position.z -= dz * push * wa;
          b.position.x += dx * push * wb;
          b.position.z += dz * push * wb;
        }
      }
      if (!player.isDefeated()) {
        const dx = a.position.x - player.position.x;
        const dz = a.position.z - player.position.z;
        const d = Math.hypot(dx, dz);
        const min = a.radius + player.radius;
        if (d < min && d > 1e-4 && Math.abs(a.position.y - player.position.y) < 1.5) {
          a.position.x = player.position.x + (dx / d) * min;
          a.position.z = player.position.z + (dz / d) * min;
        }
      }
    }
  }
}
