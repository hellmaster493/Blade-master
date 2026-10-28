// End-to-end tests for Kairo, The Blade Master, run in headless Chromium against the real game.
// The game exposes window.__RIFT__ (see src/main.js) so tests can step the simulation
// deterministically and inject input through the same Input class the keyboard uses.
//
// Usage: npm test   (requires Playwright: `npm i -D playwright && npx playwright install chromium`
//                    if it is not already available globally)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../server.js';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'output');
fs.mkdirSync(OUT, { recursive: true });

// --------------------------------------------------------------------------- page helpers
// Injected into the page; every test starts from a clean training match with no enemies.
const HELPERS = `
window.T = {
  R: window.__RIFT__,
  setup(opts = {}) {
    const R = this.R;
    R.manual(true);
    R.game.startMatch(opts.mode || 'training');
    R.step(1 / 60, 20);
    R.clearEnemies();
    R.game.director.state = 'idle';
    R.game.trainingCharge = false;
    R.game.player.energy = 0;
    R.game.player.position.set(0, 0, -3);
    R.game.player.facing = 0;
    R.game.cameraRig.yaw = 0;
    R.step(1 / 60, 2);
    this.hits = [];
    this.events = [];
    if (!this._wired) {
      this._wired = true;
      const ev = R.game.events;
      ev.on('hit', (e) => this.hits.push({ attacker: e.attacker.team, target: e.target.id || 'player', dmg: e.result.damage, kind: e.hit.kind }));
      for (const n of ['perfectDodge', 'cooldownReady', 'ultimateUsed', 'ultimateStage', 'denied', 'kill', 'victory', 'playerDefeated', 'waveStart']) {
        ev.on(n, (p) => this.events.push([n, typeof p === 'string' ? p : (p && p.id) || null, R.game.simTime]));
      }
    }
  },
  dummy(x, z, hp = 5000) {
    return this.R.spawn('ghoul', x, z, { passive: true, hp });
  },
  dmgTo(id) {
    return this.hits.filter((h) => h.target === id && h.attacker === 'player').reduce((a, h) => a + h.dmg, 0);
  },
  hitsTo(id) {
    return this.hits.filter((h) => h.target === id && h.attacker === 'player').length;
  },
  run(seconds, dt = 1 / 60, each) {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) {
      this.R.step(dt, 1);
      if (each) each(i);
    }
  },
  k() {
    return this.R.game.player;
  },
};
`;

// --------------------------------------------------------------------------- tests
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('1. Kairo appears correctly (stylized multi-part model)', async (page) => {
  const r = await page.evaluate(() => {
    T.setup();
    const k = T.k();
    const THREE = T.R.THREE;
    const meshes = k.model.partCount; // modelled parts (merged per joint for rendering)
    const box = new THREE.Box3().setFromObject(k.model.root);
    const need = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderR', 'elbowR', 'handR', 'shoulderL', 'handL', 'thighR', 'kneeR', 'footR', 'thighL', 'kneeL', 'footL', 'coatBL', 'coatBR', 'ponytail', 'sheath'];
    const missing = need.filter((n) => !k.model.joints.has(n));
    return { meshes, draw: k.model.drawMeshes, height: box.max.y - box.min.y, missing, inScene: !!k.object.parent };
  });
  const ok = r.meshes > 100 && r.height > 1.6 && r.height < 2.2 && r.missing.length === 0 && r.inScene;
  return { ok, info: `parts=${r.meshes} (rendered as ${r.draw} merged meshes) height=${r.height.toFixed(2)}m missing=[${r.missing}]` };
});

test('2. Kurokaze is attached to the right hand and points/cuts correctly', async (page) => {
  const r = await page.evaluate(() => {
    T.setup();
    const k = T.k();
    const THREE = T.R.THREE;
    const id = T.dummy(0, -0.4);
    const hand = k.model.joints.get('handR');
    const tip = new THREE.Vector3();
    const hp = new THREE.Vector3();
    const edge = new THREE.Vector3();
    const samples = [];
    T.R.tap('Mouse0');
    for (let i = 0; i < 26; i++) {
      T.R.step(1 / 60, 1);
      k.swordTipWorld(tip);
      hand.getWorldPosition(hp);
      const q = k.sword.group.getWorldQuaternion(new THREE.Quaternion());
      edge.set(0, 0, 1).applyQuaternion(q);
      const fwd = tip.clone().sub(k.position).setY(0).dot(k.facingDir);
      const lead = k.tipVel.lengthSq() > 1 ? edge.dot(k.tipVel.clone().normalize()) : null;
      samples.push({ d: tip.distanceTo(hp), t: k.act.t, fwd, lead, parent: k.sword.group.parent.name });
    }
    return samples;
  });
  const dists = r.map((s) => s.d);
  const constant = Math.max(...dists) - Math.min(...dists) < 0.01;
  const parentOk = r.every((s) => s.parent === 'handR');
  // during the active cut the tip sweeps in front of Kairo and the cutting edge leads the motion
  const active = r.filter((s) => s.t >= 0.09 && s.t <= 0.15);
  const inFront = active.some((s) => s.fwd > 0.5);
  const leads = active.filter((s) => s.lead !== null);
  const edgeLeads = leads.length > 0 && leads.filter((s) => s.lead > 0.3).length >= Math.ceil(leads.length * 0.6);
  return { ok: constant && parentOk && inFront && edgeLeads, info: `tip-hand dist ${Math.min(...dists).toFixed(3)}-${Math.max(...dists).toFixed(3)}m, parent=handR:${parentOk}, inFront=${inFront}, edgeLeads=${edgeLeads} (${leads.map((s) => s.lead.toFixed(2)).join(',')})` };
});

test('3. Movement, camera-relative controls, jump/landing and lock-on strafing', async (page) => {
  const r = await page.evaluate(() => {
    T.setup();
    const k = T.k();
    const R = T.R;
    const p0 = k.position.clone();
    R.press('KeyW');
    T.run(0.5);
    const p1 = k.position.clone();
    R.release('KeyW');
    T.run(0.3);
    const stopSpeed = Math.hypot(k.velocity.x, k.velocity.z);
    // rotate the camera with the keyboard, then move: direction must follow the camera
    R.press('ArrowLeft');
    T.run(0.5);
    R.release('ArrowLeft');
    const yaw = R.game.cameraRig.yaw;
    const before = k.position.clone();
    R.press('KeyW');
    T.run(0.4);
    R.release('KeyW');
    const dir = k.position.clone().sub(before).setY(0).normalize();
    const camDot = dir.x * Math.sin(yaw) + dir.z * Math.cos(yaw);
    // jump
    T.run(0.4);
    R.tap('Space');
    let peak = 0;
    let landedAt = -1;
    T.run(1.4, 1 / 60, (i) => {
      peak = Math.max(peak, k.position.y);
      if (landedAt < 0 && i > 5 && k.grounded) landedAt = i / 60;
    });
    // lock-on strafe keeps distance and facing
    const id = T.dummy(k.position.x, k.position.z + 5);
    T.run(0.1);
    R.game.toggleLock();
    const target = R.enemy(id);
    const d0 = k.position.distanceTo(target.position);
    R.press('KeyD');
    T.run(0.8);
    R.release('KeyD');
    const d1 = k.position.distanceTo(target.position);
    const toT = Math.atan2(target.position.x - k.position.x, target.position.z - k.position.z);
    const faceErr = Math.abs(Math.atan2(Math.sin(toT - k.facing), Math.cos(toT - k.facing)));
    return { forward: p1.z - p0.z, stopSpeed, camDot, yaw, peak, landedAt, d0, d1, faceErr, locked: k.lockTarget && k.lockTarget.id === id };
  });
  const ok = r.forward > 2.5 && r.stopSpeed < 0.5 && r.camDot > 0.95 && Math.abs(r.yaw) > 0.5 && r.peak > 1.5 && r.landedAt > 0 && r.landedAt < 1.2 && Math.abs(r.d1 - r.d0) < 1.2 && r.faceErr < 0.2 && r.locked;
  return { ok, info: `fwd ${r.forward.toFixed(2)}m/0.5s, stop ${r.stopSpeed.toFixed(2)}, camDot ${r.camDot.toFixed(3)}, jump peak ${r.peak.toFixed(2)}m land ${r.landedAt.toFixed(2)}s, strafe dist ${r.d0.toFixed(2)}→${r.d1.toFixed(2)}, face err ${r.faceErr.toFixed(3)}` };
});

test('4. Three-hit combo: Quick Draw › Crosswind › Gale Breaker (timed, buffered, one hit each)', async (page) => {
  const run = (dt) => page.evaluate((dt) => {
    T.setup();
    const k = T.k();
    const id = T.dummy(0, -0.5);
    const seq = [];
    let lastMove = null;
    let clicks = 0;
    // click whenever the current swing is past its cancel point (players buffer inputs early)
    T.R.tap('Mouse0');
    clicks++;
    T.run(1.8, dt, () => {
      const m = k.act.move;
      if (m && m.id !== lastMove) {
        seq.push(m.id);
        lastMove = m.id;
      }
      if (!m) lastMove = null;
      if (m && clicks < 3 && k.act.t > m.cancel - 0.1 && !k.buffer.name && seq.length === clicks) {
        T.R.tap('Mouse0');
        clicks++;
      }
    });
    return { seq, hits: T.hits.filter((h) => h.target === id).map((h) => [h.dmg, h.kind]), hitstopSeen: true };
  }, dt);
  const a = await run(1 / 60);
  const b = await run(1 / 20);
  const c = await run(1 / 144);
  const ok = (x) => x.seq.join() === 'quickDraw,crosswind,galeBreaker' && x.hits.length === 3 && x.hits[0][0] >= 42 && x.hits[0][0] <= 48 && x.hits[1][0] >= 56 && x.hits[1][0] <= 64 && x.hits[2][0] >= 103 && x.hits[2][0] <= 117 && x.hits[2][1] === 'heavy';
  return { ok: ok(a) && ok(b) && ok(c), info: `60fps ${JSON.stringify(a.hits)} | 20fps ${JSON.stringify(b.hits)} | 144fps ${JSON.stringify(c.hits)} seq=${a.seq}` };
});

test('5. Crescent Slash: long reach, ~140 dmg, never hits behind, 4s cooldown', async (page) => {
  const r = await page.evaluate(() => {
    T.setup();
    const k = T.k();
    const front = T.dummy(0, 2.6); // 5.6 m ahead: beyond basic range (2.7 m)
    const behind = T.dummy(0, -6);
    T.R.tap('KeyQ');
    T.run(0.8);
    const cd = k.cooldowns.remaining('crescent');
    const dmgFront = T.dmgTo(front);
    const dmgBehind = T.dmgTo(behind);
    const hitsFront = T.hitsTo(front);
    T.R.tap('KeyQ');
    T.run(0.1);
    const second = k.act.move ? k.act.move.id : null;
    const denied = T.events.filter((e) => e[0] === 'denied').length;
    T.run(3.3);
    const ready = k.cooldowns.ready('crescent');
    return { dmgFront, dmgBehind, hitsFront, cd, second, denied, ready };
  });
  const ok = r.dmgFront >= 131 && r.dmgFront <= 149 && r.hitsFront === 1 && r.dmgBehind === 0 && r.cd > 3 && r.cd < 3.3 && r.second === null && r.denied >= 1 && r.ready;
  return { ok, info: `front ${r.dmgFront} (${r.hitsFront} hit), behind ${r.dmgBehind}, cd after 0.8s ${r.cd.toFixed(2)}s, recast blocked=${r.second === null}, ready after 4.2s=${r.ready}` };
});

test('6. Cyclone Cut: 360° strikes hit each nearby enemy once per strike + burst', async (page) => {
  const r = await page.evaluate(() => {
    T.setup();
    const k = T.k();
    const p = k.position;
    const ids = [T.dummy(p.x, p.z + 2.2), T.dummy(p.x, p.z - 2.2), T.dummy(p.x + 2.2, p.z), T.dummy(p.x - 2.2, p.z)];
    const far = T.dummy(p.x + 9, p.z);
    T.R.tap('KeyE');
    T.run(1.5); // 1.02 s move + hit-stop pauses
    return { per: ids.map((id) => [T.hitsTo(id), T.dmgTo(id)]), far: T.dmgTo(far), cd: k.cooldowns.remaining('cyclone'), state: k.state };
  });
  const ok = r.per.every(([n, d]) => n === 4 && d >= 195 && d <= 235) && r.far === 0 && r.cd > 6.5 && r.state === 'move';
  return { ok, info: `per enemy [hits,dmg]=${JSON.stringify(r.per)}, far=${r.far}, cd=${r.cd.toFixed(2)}` };
});

test('7. Crimson Tempest: full staged sequence, controlled damage, no re-trigger, clean exit', async (page) => {
  const r = await page.evaluate(() => {
    T.setup();
    const k = T.k();
    const id = T.dummy(0, 6);
    const tgt = T.R.enemy(id);
    T.R.tap('KeyR');
    T.run(0.05);
    const deniedEmpty = T.events.filter((e) => e[0] === 'denied' && e[1] === 'ultimate').length;
    k.energy = 100;
    T.R.tap('KeyR');
    const t0 = T.R.game.simTime;
    let end = -1;
    let minDim = 1;
    let invulnAlways = true;
    let letterbox = false;
    T.run(4.2, 1 / 60, (i) => {
      if (k.ultimate.active) {
        minDim = Math.min(minDim, T.R.game.arena.dim);
        if (!k.isInvulnerable() && k.ultimate.t < 3.2) invulnAlways = false;
        if (T.R.game.cinematic.active) letterbox = true;
        if (i === 60) T.R.tap('KeyR'); // pressing again mid-sequence must do nothing
      } else if (end < 0 && i > 2) end = T.R.game.simTime - t0;
    });
    const stages = T.events.filter((e) => e[0] === 'ultimateStage').map((e) => e[1]);
    const used = T.events.filter((e) => e[0] === 'ultimateUsed').length;
    const dist = Math.hypot(tgt.position.x - k.position.x, tgt.position.z - k.position.z);
    T.run(1.0);
    return { stages, used, end, dmg: T.dmgTo(id), hits: T.hitsTo(id), energy: k.energy, state: k.state, minDim, dimAfter: T.R.game.arena.dim, cinematic: T.R.game.cinematic.active, invulnAlways, letterbox, dist, deniedEmpty, targetAlive: !tgt.isDefeated() };
  });
  const want = ['focus', 'flash', 'cuts', 'sever', 'impact', 'recovery', 'done'];
  const ok = JSON.stringify(r.stages) === JSON.stringify(want) && r.used === 1 && r.end > 3 && r.end < 3.8 && r.dmg >= 740 && r.dmg <= 900 && r.hits === 10 && r.energy === 0 && r.state === 'move' && r.minDim < 0.5 && r.dimAfter === 1 && !r.cinematic && r.invulnAlways && r.letterbox && r.deniedEmpty === 1 && r.targetAlive;
  return { ok, info: `stages=${r.stages.join('>')} used=${r.used} duration=${r.end.toFixed(2)}s dmg=${r.dmg} over ${r.hits} hits, dim min ${r.minDim.toFixed(2)}→${r.dimAfter}, empty-energy press denied=${r.deniedEmpty}` };
});

test('8. Dash i-frames (strict), cooldown and PERFECT DODGE reward', async (page) => {
  const r = await page.evaluate(() => {
    T.setup();
    const k = T.k();
    const R = T.R;
    R.tap('ShiftLeft');
    T.run(1 / 60);
    const dashing = k.state === 'dash';
    const iframes = k.invulnT;
    R.tap('ShiftLeft');
    T.run(0.1);
    const chained = k.dash.t < 0.05; // a second dash would have restarted the timer
    T.run(0.2);
    const invAfter = k.invulnT;
    const travelled = k.position.z + 3;
    // control: an unanswered claw swipe deals damage
    T.run(1.0);
    k.position.set(0, 0, -3);
    k.facing = 0;
    const id = T.dummy(0, -1.3);
    const g = R.enemy(id);
    g.passive = false;
    T.run(0.05);
    g.chooseAttack(1.6);
    const hp0 = k.hp;
    T.run(1.4);
    const tookHit = hp0 - k.hp;
    // perfect dodge: dash right as the swipe becomes active
    T.run(2.0);
    k.hp = k.maxHp;
    k.energy = 0;
    k.position.set(0, 0, -3);
    g.position.set(0, 0, -1.3);
    g.attackCd = 0;
    g.chooseAttack(1.6);
    let dashed = false;
    T.run(1.4, 1 / 60, () => {
      if (!dashed && g.state === 'windup' && g.attackT >= g.attack.windup - 1 / 60) {
        dashed = true;
        R.press('KeyA');
        R.tap('ShiftLeft');
      }
    });
    R.release('KeyA');
    const perfect = T.events.filter((e) => e[0] === 'perfectDodge').length;
    return { dashing, iframes, chained, invAfter, travelled, tookHit, perfect, energy: k.energy, hpAfter: k.hp, maxHp: k.maxHp };
  });
  const ok = r.dashing && Math.abs(r.iframes - 0.22) < 0.02 && !r.chained && r.invAfter === 0 && r.travelled > 4 && r.tookHit > 40 && r.perfect === 1 && r.energy >= 15 && r.hpAfter === r.maxHp;
  return { ok, info: `iframes=${r.iframes.toFixed(3)}s then ${r.invAfter}, dash travel ${r.travelled.toFixed(2)}m, spam-dash blocked=${!r.chained}, undodged hit=${r.tookHit}, perfect=${r.perfect} energy+${r.energy.toFixed(0)} hp ${r.hpAfter}/${r.maxHp}` };
});

test('9. Cooldowns tick in game time and ultimate energy builds from hits', async (page) => {
  const r = await page.evaluate(() => {
    T.setup();
    const k = T.k();
    const id = T.dummy(0, -0.5);
    const g = T.R.game;
    T.R.tap('KeyE');
    T.R.step(1 / 60, 1);
    const simStart = g.simTime;
    T.run(2.0);
    // cooldowns run on game time, which hit-stop briefly freezes
    const expected = 8 - (g.simTime - simStart);
    const cdAt2 = k.cooldowns.remaining('cyclone');
    const energyAfterCyclone = k.energy;
    T.run(6.5);
    const ready = k.cooldowns.ready('cyclone');
    const readyEvents = T.events.filter((e) => e[0] === 'cooldownReady' && e[1] === 'cyclone').length;
    const dummy = T.R.enemy(id);
    dummy.position.set(k.position.x + Math.sin(k.facing) * 1.6, 0, k.position.z + Math.cos(k.facing) * 1.6);
    dummy.velocity.set(0, 0, 0);
    T.run(0.1);
    const e0 = k.energy;
    T.R.tap('Mouse0');
    T.run(0.5);
    return { cdAt2, expected, ready, readyEvents, energyAfterCyclone, gain: k.energy - e0 };
  });
  const ok = Math.abs(r.cdAt2 - r.expected) < 0.02 && r.cdAt2 > 5.8 && r.ready && r.readyEvents === 1 && r.energyAfterCyclone > 10 && r.gain === 3;
  return { ok, info: `cyclone cd after 2s=${r.cdAt2.toFixed(2)} (game-time expected ${r.expected.toFixed(2)}), ready event=${r.readyEvents}, energy from cyclone=${r.energyAfterCyclone}, +${r.gain} per Quick Draw hit` };
});

test('10. Kairo can defeat an enemy (death state, removal, kill event)', async (page) => {
  const r = await page.evaluate(() => {
    T.setup();
    const k = T.k();
    const id = T.dummy(0, -0.6, 200);
    const g = T.R.enemy(id);
    let killedAt = -1;
    T.run(4, 1 / 60, (i) => {
      if (!k.act.move && !g.isDefeated()) T.R.tap('Mouse0');
      if (killedAt < 0 && g.isDefeated()) killedAt = i;
    });
    const kills = T.events.filter((e) => e[0] === 'kill').length;
    const stillListed = T.R.game.director.enemies.includes(g);
    const registered = T.R.game.combat.combatants.has(g);
    return { killedAt, kills, stillListed, registered, hp: g.hp };
  });
  const ok = r.killedAt > 0 && r.kills === 1 && !r.stillListed && !r.registered && r.hp === 0;
  return { ok, info: `killed after ${(r.killedAt / 60).toFixed(2)}s, kill events=${r.kills}, removed=${!r.stillListed}` };
});

test('11. Restart mid-ultimate leaves no effects or broken state; pause freezes time', async (page) => {
  const r = await page.evaluate(() => {
    T.setup();
    const k = T.k();
    const g = T.R.game;
    T.dummy(0, 5);
    k.energy = 100;
    T.R.tap('KeyR');
    T.run(1.4); // mid Thousand Cuts
    const mid = T.R.snapshot();
    g.startMatch('assault');
    const after = T.R.snapshot();
    const box = document.getElementById('fx-letterbox-top').style.height;
    // pause / resume
    T.run(0.5);
    g.pause();
    const t0 = g.simTime;
    T.R.step(1 / 60, 30);
    const frozen = g.simTime === t0 && g.state === 'paused';
    g.resume();
    T.run(3.5);
    const later = T.R.snapshot();
    return { midStage: mid.kairo.ultimateStage, after, box, frozen, enemiesLater: later.enemies.length, waveLater: later.director.wave };
  });
  const a = r.after;
  const fxZero = Object.values(a.fx).every((n) => n === 0);
  const ok = r.midStage === 'cuts' && fxZero && !a.cinematic && a.dim === 1 && a.kairo.state === 'move' && !a.kairo.ultimateActive && a.kairo.invuln === 0 && a.enemies.length === 0 && a.kairo.hp === 1000 && a.kairo.energy === 0 && r.frozen && r.enemiesLater === 3 && r.waveLater === 0 && a.projectiles === 0;
  return { ok, info: `restarted from stage '${r.midStage}': fx=${JSON.stringify(a.fx)} cinematic=${a.cinematic} dim=${a.dim} letterbox='${r.box}' paused-frozen=${r.frozen}, wave 1 spawned ${r.enemiesLater}` };
});

test('12. Full Rift Assault boss fight ends in VICTORY + sheathe; defeat flow works', async (page) => {
  const r = await page.evaluate(() => {
    T.setup({ mode: 'assault' });
    const g = T.R.game;
    const k = T.k();
    g.director.state = 'cleared';
    g.director.wave = 1;
    g.director.timer = 0.1;
    let won = -1;
    let bossSeen = false;
    let phase2 = false;
    let i = 0;
    // simple bot: lock on, keep attacking, use skills when ready; Kairo is kept alive
    T.run(150, 1 / 60, () => {
      i++;
      if (won >= 0) return;
      k.hp = k.maxHp;
      if (g.director.boss) {
        bossSeen = true;
        if (g.director.boss.phase === 2) phase2 = true;
      }
      if (!k.validLockTarget()) g.player.lockTarget = g.combat.nearestOpponent('player', k.position, 40);
      const t = k.validLockTarget();
      if (t) {
        const d = Math.hypot(t.position.x - k.position.x, t.position.z - k.position.z) - t.radius;
        if (d > 1.6) T.R.press('KeyW');
        else T.R.release('KeyW');
        if (i % 8 === 0) {
          if (k.ultimateReady) T.R.tap('KeyR');
          else if (d < 4 && k.cooldowns.ready('cyclone')) T.R.tap('KeyE');
          else if (d < 6 && k.cooldowns.ready('crescent')) T.R.tap('KeyQ');
          else if (d < 2.5) T.R.tap('Mouse0');
        }
      }
      if (g.director.state === 'victory') won = g.simTime;
    });
    T.R.release('KeyW');
    const sheathed = k.swordSheathed;
    T.R.step(1 / 60, 240);
    const resultsShown = !document.getElementById('results').classList.contains('hidden');
    const title = document.querySelector('#results .res-title').textContent;
    // defeat flow
    T.setup({ mode: 'assault' });
    const k2 = T.k();
    k2.hp = 1;
    const id = T.R.spawn('ghoul', 0, -1.4);
    const e = T.R.enemy(id);
    e.attackCd = 0;
    T.run(4);
    const defeated = k2.state;
    T.R.step(1 / 60, 200);
    const title2 = document.querySelector('#results .res-title').textContent;
    const shown2 = !document.getElementById('results').classList.contains('hidden');
    // no attacks after the game ends
    T.R.tap('Mouse0');
    T.R.step(1 / 60, 5);
    const actedAfterEnd = !!k2.act.move;
    return { won, bossSeen, phase2, sheathed, resultsShown, title, defeated, title2, shown2, actedAfterEnd, damage: k.damageDealt };
  });
  const ok = r.won > 0 && r.bossSeen && r.phase2 && r.sheathed && r.resultsShown && r.title === 'VICTORY' && r.defeated === 'defeated' && r.shown2 && r.title2 === 'DEFEATED' && !r.actedAfterEnd;
  return { ok, info: `boss fight won at sim ${r.won.toFixed(1)}s (phase 2 seen=${r.phase2}), sword sheathed=${r.sheathed}, results='${r.title}'; defeat → '${r.title2}', input ignored after end=${!r.actedAfterEnd}` };
});

test('13. Performance + memory hygiene: bounded FX pools, stable scene graph, fast sim step', async (page) => {
  const r = await page.evaluate(() => {
    T.setup();
    const g = T.R.game;
    const k = T.k();
    for (let i = 0; i < 6; i++) T.dummy(Math.sin(i) * 3, Math.cos(i) * 3);
    const count = () => {
      let n = 0;
      g.scene.traverse(() => n++);
      return n;
    };
    const n0 = count();
    let maxParticles = 0;
    const t0 = performance.now();
    let steps = 0;
    for (let loop = 0; loop < 4; loop++) {
      k.energy = 100;
      T.R.tap('KeyR');
      T.run(3.6, 1 / 60, () => {
        steps++;
        maxParticles = Math.max(maxParticles, g.fx.sparksPool.alive);
      });
      k.cooldowns.reset();
      T.R.tap('KeyE');
      T.run(1.2, 1 / 60, () => steps++);
      k.cooldowns.reset();
      T.R.tap('KeyQ');
      T.run(0.8, 1 / 60, () => steps++);
    }
    const ms = (performance.now() - t0) / steps;
    T.run(3);
    const n1 = count();
    return { n0, n1, maxParticles, cap: g.fx.sparksPool.capacity, ms, fx: g.fx.stats() };
  });
  const ok = r.n1 === r.n0 && r.maxParticles <= r.cap && r.ms < 8 && Object.values(r.fx).every((n) => n === 0);
  return { ok, info: `scene objects ${r.n0}→${r.n1}, peak particles ${r.maxParticles}/${r.cap}, ${r.ms.toFixed(2)} ms per sim step (no render), fx idle=${JSON.stringify(r.fx)}` };
});

// --------------------------------------------------------------------------- runner
const server = createServer();
await new Promise((res) => server.listen(0, res));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

// ONLY=4 node tests/e2e.mjs runs a single numbered check (handy while iterating)
const only = process.env.ONLY;
let failed = 0;
let ran = 0;
const results = [];
for (const t of tests) {
  if (only && !t.name.startsWith(only + '.')) continue;
  ran++;
  await page.goto(`http://localhost:${port}/index.html?noprewarm`);
  await page.waitForFunction('!!window.__RIFT__', null, { timeout: 30000 });
  await page.evaluate(HELPERS);
  const started = Date.now();
  let res;
  try {
    res = await t.fn(page);
  } catch (e) {
    res = { ok: false, info: 'threw: ' + e.message };
  }
  const shotName = t.name.split('.')[0].padStart(2, '0') + '.png';
  try {
    await page.evaluate(() => window.__RIFT__.render());
    await page.screenshot({ path: path.join(OUT, shotName) });
  } catch {
    /* screenshot is best effort */
  }
  if (!res.ok) failed++;
  results.push(res.ok);
  console.log(`${res.ok ? 'PASS' : 'FAIL'}  ${t.name}  (${((Date.now() - started) / 1000).toFixed(1)}s)\n      ${res.info}`);
}

// --------------------------------------------------------------------------- touch controls
// A phone-sized, touch-enabled context driven with real touch events (CDP), not injected input.
if (!only || only === '15') {
  ran++;
  const name = '15. Touchscreen controls: joystick, look-drag, held SLASH combo, skill buttons, pause';
  const started = Date.now();
  let res;
  const mctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => errors.push('[touch] ' + e.message));
  mp.on('console', (m) => {
    if (m.type() === 'error') errors.push('[touch] ' + m.text());
  });
  try {
    const cdp = await mctx.newCDPSession(mp);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
    await mp.goto(`http://localhost:${port}/index.html?noprewarm`);
    await mp.waitForFunction('!!window.__RIFT__', null, { timeout: 30000 });
    const touchMode = await mp.evaluate(() => window.__RIFT__.game.input.touchMode);
    await mp.tap('button[data-mode="training"]');
    await mp.evaluate(() => {
      const R = window.__RIFT__;
      R.manual(true);
      R.step(1 / 60, 20);
      R.clearEnemies();
      R.game.director.state = 'idle';
    });
    const S = (n) => mp.evaluate((n) => window.__RIFT__.step(1 / 60, n), n);
    const center = (label) => mp.evaluate((l) => {
      const b = [...document.querySelectorAll('.tb')].find((x) => x.getAttribute('aria-label') === l);
      const r = b.getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    }, label);
    const z0 = await mp.evaluate(() => window.__RIFT__.game.player.position.z);
    await touch('touchStart', [[140, 300, 1]]);
    await touch('touchMove', [[140, 240, 1]]);
    await S(30);
    await touch('touchEnd', []);
    await S(20);
    const moved = (await mp.evaluate(() => window.__RIFT__.game.player.position.z)) - z0;
    const yaw0 = await mp.evaluate(() => window.__RIFT__.game.cameraRig.yaw);
    await touch('touchStart', [[600, 150, 2]]);
    await touch('touchMove', [[520, 150, 2]]);
    await S(2);
    await touch('touchEnd', []);
    const yawDelta = (await mp.evaluate(() => window.__RIFT__.game.cameraRig.yaw)) - yaw0;
    await mp.evaluate(() => {
      const R = window.__RIFT__;
      const k = R.game.player;
      k.position.set(0, 0, 0);
      k.facing = 0;
      R.spawn('ghoul', 0, 1.3, { passive: true, hp: 5000 });
      R.step(1 / 60, 5);
    });
    const [ax, ay] = await center('SLASH');
    await touch('touchStart', [[ax, ay, 3]]);
    const seq = [];
    for (let i = 0; i < 100; i++) {
      await S(1);
      const m = await mp.evaluate(() => (window.__RIFT__.game.player.act.move || {}).id || '-');
      if (seq[seq.length - 1] !== m) seq.push(m);
    }
    await touch('touchEnd', []);
    await S(50);
    const [qx, qy] = await center('Q');
    await touch('touchStart', [[qx, qy, 4]]);
    await S(1);
    await touch('touchEnd', []);
    await S(2);
    const qMove = await mp.evaluate(() => (window.__RIFT__.game.player.act.move || {}).id || null);
    await S(60);
    await mp.tap('.t-pause');
    await S(1);
    const paused = await mp.evaluate(() => window.__RIFT__.game.state);
    const scrollW = await mp.evaluate(() => document.documentElement.scrollWidth);
    const combo = seq.filter((m) => m !== '-');
    const ok = touchMode && moved > 2 && yawDelta > 0.15 && combo.slice(0, 3).join() === 'quickDraw,crosswind,galeBreaker' && qMove === 'crescent' && paused === 'paused' && scrollW === 844;
    res = { ok, info: `touch mode auto=${touchMode}, joystick moved ${moved.toFixed(2)} m, look-drag yaw +${yawDelta.toFixed(2)} rad, held SLASH → ${combo.join(' › ')}, Q → ${qMove}, pause → ${paused}, no sideways scroll=${scrollW === 844}` };
    await mp.screenshot({ path: path.join(OUT, '15.png') });
  } catch (e) {
    res = { ok: false, info: 'threw: ' + e.message };
  }
  await mctx.close();
  if (!res.ok) failed++;
  console.log(`${res.ok ? 'PASS' : 'FAIL'}  ${name}  (${((Date.now() - started) / 1000).toFixed(1)}s)\n      ${res.info}`);
}

// --------------------------------------------------------------------------- music
// The soundtrack must start from a real user gesture and follow the game's state.
if (!only || only === '16') {
  ran++;
  const name = '16. Futuristic soundtrack: starts on first click, follows title › training › boss › victory, muffles on pause';
  const started = Date.now();
  let res;
  try {
    await page.goto(`http://localhost:${port}/index.html?noprewarm`);
    await page.waitForFunction('!!window.__RIFT__', null, { timeout: 30000 });
    const silentBefore = await page.evaluate(() => !window.__RIFT__.game.music.playing);
    await page.mouse.click(900, 400);
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const m = window.__RIFT__.game.music;
      const a = m.ctx.createAnalyser();
      a.fftSize = 2048;
      m.out.connect(a);
      window.peakOver = (ms) => new Promise((done) => {
        let p = 0;
        const d = new Float32Array(a.fftSize);
        const t0 = performance.now();
        const id = setInterval(() => {
          a.getFloatTimeDomainData(d);
          let sum = 0;
          for (const v of d) sum += v * v;
          p = Math.max(p, Math.sqrt(sum / d.length));
          if (performance.now() - t0 > ms) {
            clearInterval(id);
            done(p);
          }
        }, 30);
      });
    });
    const probe = async (ms = 1200) => page.evaluate(async (ms) => {
      const m = window.__RIFT__.game.music;
      const peak = await window.peakOver(ms);
      return { mode: m.mode, peak, muffle: m.muffle.frequency.value };
    }, ms);
    const title = await probe(2600);
    await page.click('button[data-mode="training"]');
    const training = await probe();
    await page.evaluate(() => window.__RIFT__.game.pause());
    const paused = await probe(700);
    await page.evaluate(() => {
      const g = window.__RIFT__.game;
      g.resume();
      g.startMatch('assault');
      g.events.emit('waveStart', { index: 2, total: 3, name: 'FINAL WAVE', title: '', boss: true });
    });
    const boss = await probe();
    await page.evaluate(() => window.__RIFT__.game.onVictory());
    const victory = await probe(1800);
    const ok = silentBefore && title.mode === 'menu' && title.peak > 0.02 && training.mode === 'training' && training.peak > title.peak * 0.8
      && paused.muffle < 2000 && boss.mode === 'boss' && boss.peak > 0.05 && victory.mode === 'victory' && victory.peak > 0.02;
    res = { ok, info: `silent until click=${silentBefore}; level title ${title.peak.toFixed(3)} › training ${training.peak.toFixed(3)} › boss ${boss.peak.toFixed(3)} › victory ${victory.peak.toFixed(3)}; pause muffles to ${Math.round(paused.muffle)} Hz` };
  } catch (e) {
    res = { ok: false, info: 'threw: ' + e.message };
  }
  if (!res.ok) failed++;
  console.log(`${res.ok ? 'PASS' : 'FAIL'}  ${name}  (${((Date.now() - started) / 1000).toFixed(1)}s)\n      ${res.info}`);
}

// the main page may still be rendering in real time; stop it so later contexts get the CPU
await page.goto('about:blank');

// --------------------------------------------------------------------------- mobile audio unlock
// iOS Safari only lets audio start inside touch-end/click/key handlers (not touch-down).
// Emulate that rule so the music must survive it: first tap anywhere starts it, the chip never lies.
if (!only || only === '17') {
  ran++;
  const name = '17. Mobile audio unlock under iOS gesture rules: first tap starts music, chip state is honest, interruptions recover';
  const started = Date.now();
  let res;
  const ictx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const ip = await ictx.newPage();
  ip.on('pageerror', (e) => errors.push('[ios-audio] ' + e.message));
  try {
    await ip.addInitScript(() => {
      let gesture = false;
      for (const t of ['touchend', 'click', 'keydown', 'mouseup']) {
        window.addEventListener(t, () => {
          gesture = true;
          setTimeout(() => (gesture = false), 0);
        }, true);
      }
      const Real = window.AudioContext;
      window.AudioContext = class extends Real {
        constructor(...a) {
          super(...a);
          if (!gesture) super.suspend();
        }
        resume() {
          return gesture ? super.resume() : Promise.reject(new Error('not allowed (no gesture)'));
        }
      };
      window.webkitAudioContext = window.AudioContext;
    });
    const cdp = await ictx.newCDPSession(ip);
    const tap = async (x, y) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await ip.goto(`http://localhost:${port}/index.html?noprewarm`);
    await ip.waitForFunction('!!window.__RIFT__', null, { timeout: 30000 });
    const st = () => ip.evaluate(() => {
      const g = window.__RIFT__.game;
      return { ctx: g.audio.ctx ? g.audio.ctx.state : 'none', on: g.settings.musicOn, chip: document.querySelector('.mc-text').textContent };
    });
    // wait for each expected state rather than sleeping (CPU-starved CI can be slow)
    const until = (fn) => ip.waitForFunction(fn, null, { timeout: 15000 }).catch(() => {});
    const chipIs = (text) => `document.querySelector('.mc-text').textContent === ${JSON.stringify(text)}`;
    await tap(700, 250);
    await until(chipIs('Music on'));
    const first = await st();
    await ip.evaluate(() => window.__RIFT__.game.audio.ctx.suspend());
    await until(chipIs('Tap to start music'));
    const interrupted = await st();
    const c = await ip.evaluate(() => {
      const b = document.querySelector('.music-chip').getBoundingClientRect();
      return [b.x + b.width / 2, b.y + b.height / 2];
    });
    await tap(c[0], c[1]);
    await until(chipIs('Music on'));
    const recovered = await st();
    const ok = first.ctx === 'running' && first.chip === 'Music on' && interrupted.chip === 'Tap to start music'
      && recovered.ctx === 'running' && recovered.on && recovered.chip === 'Music on';
    res = { ok, info: `first tap → ${first.ctx}/'${first.chip}'; interrupted → '${interrupted.chip}'; chip tap → ${recovered.ctx}/'${recovered.chip}'` };
  } catch (e) {
    res = { ok: false, info: 'threw: ' + e.message };
  }
  await ictx.close();
  if (!res.ok) failed++;
  console.log(`${res.ok ? 'PASS' : 'FAIL'}  ${name}  (${((Date.now() - started) / 1000).toFixed(1)}s)\n      ${res.info}`);
}

const errOk = errors.length === 0;
ran++;
console.log(`${errOk ? 'PASS' : 'FAIL'}  18. No runtime or console errors${errOk ? '' : ':\n      ' + errors.slice(0, 10).join('\n      ')}`);
if (!errOk) failed++;
console.log(`\n${ran - failed}/${ran} checks passed. Screenshots: ${path.relative(process.cwd(), OUT)}/`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
