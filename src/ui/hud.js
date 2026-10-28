// In-game HUD for Kairo: portrait, health/ultimate bars, ability slots with cooldown sweeps,
// dash indicator, combo counter, lock-on reticle, enemy/boss health bars, damage numbers and messages.
import * as THREE from 'three';
import { PORTRAIT, ICONS } from './icons.js';
import { KAIRO, ABILITIES, GEARS, GEAR_GAUGE, MAX_GEAR } from '../config.js';
import { damp, clamp } from '../core/mathutils.js';

const _v = new THREE.Vector3();

const RANKS = [
  [50, 'TEMPEST!!'],
  [35, 'RELENTLESS!'],
  [20, 'BRUTAL!'],
  [10, 'STYLISH'],
  [5, 'NICE'],
];

const COMBO_MILESTONES = [10, 25, 50, 100];

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

export class HUD {
  constructor(root, game) {
    this.game = game;
    this.root = root;
    this.build();
    this.enemyBars = new Map();
    this.numbers = [];
    for (let i = 0; i < 28; i++) {
      const n = el('div', 'dmg', this.numLayer);
      n.style.display = 'none';
      this.numbers.push({ el: n, active: false, pos: new THREE.Vector3(), life: 0, max: 0.9, vx: 0 });
    }
    this.hpGhost = 1;
    this.bossGhost = 1;
    this.slotReady = {};
    this.lastMilestone = 0;
  }

  build() {
    const r = this.root;
    const player = el('div', 'player-panel', r);
    el('div', 'portrait', player, PORTRAIT);
    const info = el('div', 'player-info', player);
    el('div', 'name-row', info, `<span class="pname">${KAIRO.name}</span><span class="ptitle">${KAIRO.title}</span>`);
    this.hpBar = el('div', 'bar hp', info, '<div class="ghost"></div><div class="fill"></div><span class="val"></span>');
    this.ultBar = el('div', 'bar ult', info, '<div class="fill"></div><span class="val"></span>');
    this.gearRow = el('div', 'gear-row', info, '<span class="gear-label">GEAR 1</span><div class="gear-gauge"><i><b></b></i><i><b></b></i><i><b></b></i></div><span class="gear-hint">G</span>');
    this.gearSegs = [...this.gearRow.querySelectorAll('.gear-gauge b')];
    this.gearLabel = this.gearRow.querySelector('.gear-label');
    this.gearHint = this.gearRow.querySelector('.gear-hint');

    this.wavePanel = el('div', 'wave-panel', r, '<div class="wave-name"></div><div class="wave-sub"></div>');
    this.bossBar = el('div', 'boss-bar hidden', r, '<div class="boss-name"></div><div class="bar"><div class="ghost"></div><div class="fill"></div></div>');

    const ab = el('div', 'abilities', r);
    this.slots = {};
    const mk = (id, key, name, icon, extra = '') => {
      const s = el('div', 'slot slot-' + id, ab);
      s.dataset.id = id;
      s.innerHTML = `<div class="icon">${icon}</div><div class="cd"></div><div class="cd-text"></div>${extra}<div class="key">${key}</div><div class="slot-name">${name}</div>`;
      this.slots[id] = { root: s, cd: s.querySelector('.cd'), text: s.querySelector('.cd-text') };
      return s;
    };
    mk('combo', 'LMB', ABILITIES.combo.name, ICONS.combo, '<div class="pips"><i></i><i></i><i></i></div>');
    mk('crescent', ABILITIES.crescent.key, ABILITIES.crescent.name, ICONS.crescent);
    mk('cyclone', ABILITIES.cyclone.key, ABILITIES.cyclone.name, ICONS.cyclone);
    mk('ultimate', ABILITIES.ultimate.key, ABILITIES.ultimate.name, ICONS.ultimate);
    mk('dash', ABILITIES.dash.key, ABILITIES.dash.name, ICONS.dash, '<div class="dash-ready">READY</div>');
    mk('gear', ABILITIES.gear.key, ABILITIES.gear.name, ICONS.gear);
    this.pips = [...this.slots.combo.root.querySelectorAll('.pips i')];

    this.combo = el('div', 'combo hidden', r, '<div class="count">0</div><div class="label">HITS</div><div class="timer"><div></div></div><div class="rank"></div>');
    this.comboCount = this.combo.querySelector('.count');
    this.comboTimer = this.combo.querySelector('.timer div');
    this.comboRank = this.combo.querySelector('.rank');

    this.messages = el('div', 'messages', r);
    this.banner = el('div', 'banner', r, '<div class="b-name"></div><div class="b-title"></div>');
    this.reticle = el('div', 'lock-reticle hidden', r, '<i></i><i></i><i></i><i></i>');
    this.lockLabel = el('div', 'lock-label hidden', r);
    this.barLayer = el('div', 'enemy-bars', r);
    this.numLayer = el('div', 'damage-numbers', r);
    el('div', 'hint', r, '<b>WASD</b> move · <b>Mouse</b> camera · <b>LMB</b> attack · <b>Q/E</b> skills · <b>R</b> ultimate · <b>Shift</b> dash · <b>Space</b> jump · <b>F</b> lock · <b>Esc</b> pause');
  }

  reset() {
    for (const [, b] of this.enemyBars) b.remove();
    this.enemyBars.clear();
    for (const n of this.numbers) {
      n.active = false;
      n.el.style.display = 'none';
    }
    this.messages.innerHTML = '';
    this.banner.classList.remove('show');
    this.combo.classList.add('hidden');
    this.bossBar.classList.add('hidden');
    this.hpGhost = 1;
    this.bossGhost = 1;
    this.lastMilestone = 0;
    this.slotReady = {};
    for (const id in this.slots) this.slots[id].root.classList.remove('pulse', 'denied');
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
  }

  message(text, cls = '', duration = 1.3) {
    while (this.messages.children.length > 3) this.messages.firstChild.remove();
    const m = el('div', 'msg ' + cls, this.messages, text);
    m.style.animationDuration = duration + 's';
    setTimeout(() => m.remove(), duration * 1000);
  }

  /** Removes queued messages whose class matches, e.g. the previous Gear's title. */
  dropMessages(pattern) {
    for (const m of [...this.messages.children]) if (pattern.test(m.className)) m.remove();
  }

  showBanner(name, title) {
    this.banner.querySelector('.b-name').textContent = name;
    this.banner.querySelector('.b-title').textContent = title;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth; // restart animation
    this.banner.classList.add('show');
  }

  pulseSlot(id) {
    const s = this.slots[id];
    if (!s) return;
    s.root.classList.remove('pulse');
    void s.root.offsetWidth;
    s.root.classList.add('pulse');
  }

  denied(id) {
    const s = this.slots[id];
    if (!s) return;
    s.root.classList.remove('denied');
    void s.root.offsetWidth;
    s.root.classList.add('denied');
  }

  comboHit(count) {
    for (const m of COMBO_MILESTONES) {
      if (count >= m && this.lastMilestone < m) {
        this.lastMilestone = m;
        this.message(`${m} HIT COMBO!`, 'combo-msg', 1.2);
      }
    }
    this.combo.classList.remove('bump');
    void this.combo.offsetWidth;
    this.combo.classList.add('bump');
  }

  comboEnd() {
    this.lastMilestone = 0;
  }

  damageNumber(pos, amount, { crimson = false, heavy = false, player = false, gear = 1, small = false } = {}) {
    let n = this.numbers.find((x) => !x.active);
    if (!n) n = this.numbers.reduce((a, b) => (a.life < b.life ? a : b));
    n.active = true;
    n.pos.copy(pos);
    n.pos.y += 0.3;
    n.life = n.max = heavy ? 1.0 : 0.8;
    n.vx = (Math.random() - 0.5) * 40;
    n.el.textContent = Math.round(amount);
    n.el.className = 'dmg' + (crimson ? ' crimson' : '') + (heavy ? ' heavy' : '') + (player ? ' player' : '') + (gear >= 3 ? ' g' + gear : '') + (small ? ' aura' : '');
    n.el.style.display = 'block';
  }

  project(pos, camera, w, h) {
    _v.copy(pos).project(camera);
    if (_v.z > 1 || _v.z < -1) return null;
    return [((_v.x + 1) / 2) * w, ((1 - _v.y) / 2) * h];
  }

  update(dt) {
    const g = this.game;
    const k = g.player;
    const camera = g.camera;
    camera.updateMatrixWorld();
    const w = window.innerWidth;
    const h = window.innerHeight;

    // health + ultimate
    const hpK = k.hp / k.maxHp;
    this.hpGhost = this.hpGhost > hpK ? damp(this.hpGhost, hpK, 3, dt) : hpK;
    this.hpBar.querySelector('.fill').style.width = (hpK * 100).toFixed(1) + '%';
    this.hpBar.querySelector('.ghost').style.width = (this.hpGhost * 100).toFixed(1) + '%';
    this.hpBar.querySelector('.val').textContent = `${Math.ceil(k.hp)} / ${k.maxHp}`;
    this.hpBar.classList.toggle('low', hpK < 0.3);
    const ultK = k.energy / KAIRO.ultimate.max;
    this.ultBar.querySelector('.fill').style.width = (ultK * 100).toFixed(1) + '%';
    const touch = g.input.touchMode;
    this.ultBar.querySelector('.val').textContent = ultK >= 1 ? (touch ? 'CRIMSON TEMPEST READY' : 'CRIMSON TEMPEST READY — R') : `ULTIMATE ${Math.floor(ultK * 100)}%`;
    this.ultBar.classList.toggle('full', ultK >= 1);

    // ability slots
    const cds = k.cooldowns;
    for (const id of ['crescent', 'cyclone', 'dash']) {
      const s = this.slots[id];
      const rem = cds.remaining(id);
      const frac = cds.fraction(id);
      s.cd.style.setProperty('--cd', frac.toFixed(3));
      s.text.textContent = rem > 0 ? (rem >= 1 ? rem.toFixed(1) : rem.toFixed(1)) : '';
      const ready = rem <= 0;
      s.root.classList.toggle('ready', ready);
      if (ready && this.slotReady[id] === false) this.pulseSlot(id);
      this.slotReady[id] = ready;
    }
    // Gear gauge: three segments; label shows the active gear or that the next one is ready
    const gear = k.gear;
    const gearNext = k.nextGear;
    const seg = GEAR_GAUGE.max / 3;
    this.gearSegs.forEach((b, i) => (b.style.width = (clamp((k.gearGauge - i * seg) / seg, 0, 1) * 100).toFixed(1) + '%'));
    for (let i = 2; i <= MAX_GEAR; i++) this.gearRow.classList.toggle('g' + i, gear === i);
    this.gearRow.classList.toggle('ready', !!gearNext);
    this.gearLabel.textContent = gear > 1 ? `GEAR ${gear} · ${GEARS[gear].name} · ×${GEARS[gear].damageMul}` : gearNext ? `GEAR ${gearNext} READY` : 'GEAR 1';
    const key = touch ? 'TAP GEAR' : 'G';
    this.gearHint.textContent = gearNext ? (gear > 1 ? `${key} › GEAR ${gearNext}` : key) : gear >= MAX_GEAR ? `${key}: RELEASE` : key;
    const gs = this.slots.gear;
    const nextCost = gear < MAX_GEAR ? GEARS[gear + 1].cost : 0;
    gs.cd.style.setProperty('--cd', gearNext || gear >= MAX_GEAR ? '0' : (1 - clamp(k.gearGauge / nextCost, 0, 1)).toFixed(3));
    gs.text.textContent = gear > 1 ? Math.ceil(k.gearGauge / GEARS[gear].drain) + 's' : '';
    gs.root.classList.toggle('ready', !!gearNext);
    gs.root.classList.toggle('active', gear > 1);
    gs.root.classList.toggle('g3', gear === 3);
    gs.root.classList.toggle('g4', gear === 4);
    if (gearNext && this.slotReady.gear === false) this.pulseSlot('gear');
    this.slotReady.gear = !!gearNext;

    const us = this.slots.ultimate;
    us.cd.style.setProperty('--cd', (1 - ultK).toFixed(3));
    us.text.textContent = ultK >= 1 ? '' : Math.floor(ultK * 100) + '%';
    const ultReady = ultK >= 1;
    us.root.classList.toggle('ready', ultReady);
    us.root.classList.toggle('active', !!k.ultimate.active);
    if (ultReady && this.slotReady.ultimate === false) this.pulseSlot('ultimate');
    this.slotReady.ultimate = ultReady;
    // combo step pips: highlight the attack that the next click performs
    let next = 0;
    if (k.state === 'action' && k.act.move && k.act.move.type === 'combo') next = (k.act.move.comboIndex + 1) % 3;
    else if (k.comboGraceT > 0) next = k.comboStep;
    const current = k.state === 'action' && k.act.move && k.act.move.type === 'combo' ? k.act.move.comboIndex : -1;
    this.pips.forEach((p, i) => {
      p.classList.toggle('next', i === next);
      p.classList.toggle('on', i === current);
    });

    // combo counter
    if (k.hitCount >= 2) {
      this.combo.classList.remove('hidden');
      this.comboCount.textContent = k.hitCount;
      this.comboTimer.style.width = clamp((k.comboTimer / KAIRO.comboHitWindow) * 100, 0, 100).toFixed(1) + '%';
      let rank = '';
      for (const [n, label] of RANKS) {
        if (k.hitCount >= n) {
          rank = label;
          break;
        }
      }
      this.comboRank.textContent = rank;
    } else {
      this.combo.classList.add('hidden');
    }

    // wave panel
    const d = g.director;
    if (g.mode === 'training') {
      this.wavePanel.querySelector('.wave-name').textContent = 'TRAINING GROUNDS';
      this.wavePanel.querySelector('.wave-sub').textContent = touch
        ? `Dummies attack: ${g.trainingAggro ? 'ON' : 'OFF'} (change in pause menu)`
        : `T: dummies attack ${g.trainingAggro ? 'ON' : 'OFF'} · ultimate charges automatically`;
    } else {
      const wv = Math.max(0, d.wave) + 1;
      this.wavePanel.querySelector('.wave-name').textContent = d.wave >= 0 ? `WAVE ${wv} / ${d.totalWaves}` : 'GET READY';
      this.wavePanel.querySelector('.wave-sub').textContent = d.wave >= 0 ? `ENEMIES REMAINING: ${d.aliveCount}` : '';
    }

    // lock-on reticle
    const lt = k.validLockTarget();
    if (lt) {
      lt.anchor(_v);
      _v.y -= lt.height * 0.45 + 0.35;
      const p = this.project(_v, camera, w, h);
      if (p) {
        this.reticle.classList.remove('hidden');
        this.reticle.style.transform = `translate(${p[0]}px, ${p[1]}px) translate(-50%, -50%)`;
      } else {
        this.reticle.classList.add('hidden');
      }
      this.lockLabel.classList.remove('hidden');
      this.lockLabel.textContent = 'LOCKED · ' + lt.name;
    } else {
      this.reticle.classList.add('hidden');
      this.lockLabel.classList.add('hidden');
    }

    // floating enemy health bars
    const seen = new Set();
    for (const e of d.enemies) {
      if (e.isBoss) continue;
      seen.add(e.id);
      let bar = this.enemyBars.get(e.id);
      if (!bar) {
        bar = el('div', 'ebar', this.barLayer, '<div class="fill"></div>');
        this.enemyBars.set(e.id, bar);
      }
      const visible = !e.isDefeated() && e.state !== 'spawn';
      const p = visible ? this.project(e.anchor(_v), camera, w, h) : null;
      if (!p) {
        bar.style.display = 'none';
        continue;
      }
      bar.style.display = 'block';
      bar.style.transform = `translate(${p[0]}px, ${p[1]}px) translate(-50%, -50%)`;
      bar.firstChild.style.width = ((e.hp / e.maxHp) * 100).toFixed(1) + '%';
      bar.classList.toggle('locked', e === lt);
      bar.classList.toggle('winding', e.state === 'windup');
    }
    for (const [id, bar] of this.enemyBars) {
      if (!seen.has(id)) {
        bar.remove();
        this.enemyBars.delete(id);
      }
    }

    // boss bar
    const boss = d.boss;
    if (boss && boss.state !== 'spawn' && (!boss.isDefeated() || boss.deathT < 1.5)) {
      this.bossBar.classList.remove('hidden');
      this.bossBar.querySelector('.boss-name').textContent = boss.name + (boss.phase === 2 ? ' — ENRAGED' : '');
      const bk = boss.hp / boss.maxHp;
      this.bossGhost = this.bossGhost > bk ? damp(this.bossGhost, bk, 2.5, dt) : bk;
      this.bossBar.querySelector('.fill').style.width = (bk * 100).toFixed(1) + '%';
      this.bossBar.querySelector('.ghost').style.width = (this.bossGhost * 100).toFixed(1) + '%';
      this.bossBar.classList.toggle('enraged', boss.phase === 2);
    } else {
      this.bossBar.classList.add('hidden');
    }

    // damage numbers
    for (const n of this.numbers) {
      if (!n.active) continue;
      n.life -= dt;
      if (n.life <= 0) {
        n.active = false;
        n.el.style.display = 'none';
        continue;
      }
      const t = 1 - n.life / n.max;
      _v.copy(n.pos);
      _v.y += t * 0.9;
      const p = this.project(_v, camera, w, h);
      if (!p) {
        n.el.style.display = 'none';
        continue;
      }
      n.el.style.display = 'block';
      const scale = t < 0.12 ? 0.6 + t * 6 : 1.3 - Math.min(0.3, t * 0.4);
      n.el.style.opacity = (n.life / n.max < 0.35 ? (n.life / n.max) / 0.35 : 1).toFixed(2);
      n.el.style.transform = `translate(${p[0] + n.vx * t}px, ${p[1]}px) translate(-50%, -50%) scale(${scale.toFixed(2)})`;
    }
  }
}
