// On-screen controls for touchscreens: a floating left-thumb joystick, a drag-to-look area,
// and combat buttons arranged in an arc around a large attack button. Buttons feed the same
// Input object the keyboard uses, so gameplay code is identical for both control schemes.
import { ICONS } from './icons.js';
import { KAIRO, GEARS } from '../config.js';
import { clamp } from '../core/mathutils.js';

const JUMP_ICON = `<svg viewBox="0 0 64 64"><path d="M32 10 L52 32 H40 V54 H24 V32 H12 Z" fill="#eaf8ff"/></svg>`;
const LOCK_ICON = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="16" fill="none" stroke="#ff4a64" stroke-width="5"/>
  <path d="M32 4 V16 M32 48 V60 M4 32 H16 M48 32 H60" stroke="#ff4a64" stroke-width="5" stroke-linecap="round"/></svg>`;

const BUTTONS = [
  { id: 'combo', code: 'Mouse0', label: 'SLASH', icon: ICONS.combo, cls: 'tb-attack', repeat: true },
  { id: 'dash', code: 'ShiftLeft', label: 'DASH', icon: ICONS.dash, cd: 'dash' },
  { id: 'crescent', code: 'KeyQ', label: 'Q', icon: ICONS.crescent, cd: 'crescent' },
  { id: 'cyclone', code: 'KeyE', label: 'E', icon: ICONS.cyclone, cd: 'cyclone' },
  { id: 'jump', code: 'Space', label: 'JUMP', icon: JUMP_ICON },
  { id: 'ultimate', code: 'KeyR', label: 'ULT', icon: ICONS.ultimate, cls: 'tb-ult' },
  { id: 'gear', code: 'KeyG', label: 'GEAR', icon: ICONS.gear, cls: 'tb-gear' },
  { id: 'lock', code: 'KeyF', label: 'LOCK', icon: LOCK_ICON, cls: 'tb-lock' },
];

// Arc placement around the attack button: [angle in degrees from "left", ring].
// Three buttons per ring keeps neighbours from overlapping at every screen size.
const ARC = {
  dash: [0, 1],
  crescent: [45, 1],
  jump: [90, 1],
  cyclone: [6, 2],
  ultimate: [33, 2],
  gear: [60, 2],
  lock: [87, 2],
};

const LOOK_GAIN = 1.7;

export class TouchControls {
  constructor(root, game) {
    this.game = game;
    this.input = game.input;
    this.root = root;
    this.visible = false;
    this.stick = { id: null, ox: 0, oy: 0, r: 60 };
    this.look = { id: null, x: 0, y: 0 };
    this.held = new Map(); // pointerId -> button def
    this.repeatT = 0;
    this.build();
    this.layout();
    this.input.onClear = () => this.release();
    game.events.on('denied', (id) => this.shake(id));
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => setTimeout(() => this.layout(), 200));
  }

  build() {
    const r = this.root;
    r.innerHTML = '';
    this.lookZone = this.zone('t-look-zone');
    this.stickZone = this.zone('t-stick-zone');
    this.stickEl = document.createElement('div');
    this.stickEl.className = 't-stick';
    this.stickEl.innerHTML = '<div class="t-knob"></div>';
    r.appendChild(this.stickEl);
    this.knob = this.stickEl.firstChild;
    this.buttons = {};
    for (const def of BUTTONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tb ' + (def.cls || '');
      b.setAttribute('aria-label', def.label);
      b.innerHTML = `<span class="tb-icon">${def.icon}</span><span class="tb-cd"></span><span class="tb-cd-text"></span><span class="tb-label">${def.label}</span>`;
      b.addEventListener('pointerdown', (e) => this.pressButton(e, def, b));
      b.addEventListener('pointerup', (e) => this.releaseButton(e));
      b.addEventListener('pointercancel', (e) => this.releaseButton(e));
      b.addEventListener('lostpointercapture', (e) => this.releaseButton(e));
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      r.appendChild(b);
      this.buttons[def.id] = { el: b, def, cd: b.querySelector('.tb-cd'), text: b.querySelector('.tb-cd-text') };
    }
    this.pauseBtn = document.createElement('button');
    this.pauseBtn.type = 'button';
    this.pauseBtn.className = 't-pause';
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.innerHTML = '<i></i><i></i>';
    this.pauseBtn.addEventListener('click', () => {
      this.game.audio.play('ui');
      this.game.pause();
    });
    r.appendChild(this.pauseBtn);

    // joystick
    this.stickZone.addEventListener('pointerdown', (e) => {
      if (this.stick.id !== null) return;
      e.preventDefault();
      this.stickZone.setPointerCapture(e.pointerId);
      this.stick.id = e.pointerId;
      this.stick.ox = e.clientX;
      this.stick.oy = e.clientY;
      this.stickEl.classList.add('active');
      this.placeStick(e.clientX, e.clientY);
      this.moveStick(e.clientX, e.clientY);
    });
    this.stickZone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stick.id) this.moveStick(e.clientX, e.clientY);
    });
    const endStick = (e) => {
      if (e.pointerId !== this.stick.id) return;
      this.resetStick();
    };
    this.stickZone.addEventListener('pointerup', endStick);
    this.stickZone.addEventListener('pointercancel', endStick);
    this.stickZone.addEventListener('lostpointercapture', endStick);

    // drag to look
    this.lookZone.addEventListener('pointerdown', (e) => {
      if (this.look.id !== null) return;
      e.preventDefault();
      this.lookZone.setPointerCapture(e.pointerId);
      this.look.id = e.pointerId;
      this.look.x = e.clientX;
      this.look.y = e.clientY;
    });
    this.lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.look.id) return;
      this.input.mouseDX += (e.clientX - this.look.x) * LOOK_GAIN;
      this.input.mouseDY += (e.clientY - this.look.y) * LOOK_GAIN;
      this.look.x = e.clientX;
      this.look.y = e.clientY;
    });
    const endLook = (e) => {
      if (e.pointerId === this.look.id) this.look.id = null;
    };
    this.lookZone.addEventListener('pointerup', endLook);
    this.lookZone.addEventListener('pointercancel', endLook);
    this.lookZone.addEventListener('lostpointercapture', endLook);
  }

  zone(cls) {
    const z = document.createElement('div');
    z.className = cls;
    z.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.appendChild(z);
    return z;
  }

  /** Sizes everything from the short side of the screen so it fits phones and tablets. */
  layout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const u = clamp(Math.min(w, h) * 0.135, 44, 70);
    const A = u * 1.55;
    this.unit = u;
    this.root.style.setProperty('--tu', u + 'px');
    this.root.style.setProperty('--ta', A + 'px');
    const pad = 16;
    const cx = pad + A / 2; // centre of the attack button, measured from the right edge
    const cy = pad + A / 2; // and from the bottom edge
    const r1 = A / 2 + u / 2 + 16;
    const r2 = r1 + u + 10;
    for (const id in this.buttons) {
      const b = this.buttons[id];
      const size = id === 'combo' ? A : id === 'lock' ? u * 0.82 : u;
      let x = cx;
      let y = cy;
      if (ARC[id]) {
        const [deg, ring] = ARC[id];
        const rad = (deg * Math.PI) / 180;
        const rr = ring === 1 ? r1 : r2;
        x = cx + Math.cos(rad) * rr;
        y = cy + Math.sin(rad) * rr;
      }
      const s = b.el.style;
      s.width = s.height = size + 'px';
      s.right = `calc(${(x - size / 2).toFixed(1)}px + env(safe-area-inset-right, 0px))`;
      s.bottom = `calc(${(y - size / 2).toFixed(1)}px + env(safe-area-inset-bottom, 0px))`;
    }
    this.stick.r = u * 1.05;
    this.restX = pad + 12 + this.stick.r;
    this.restY = h - (pad + 12 + this.stick.r);
    this.stickEl.style.width = this.stickEl.style.height = this.stick.r * 2 + 'px';
    this.knob.style.width = this.knob.style.height = u * 0.85 + 'px';
    if (this.stick.id === null) this.placeStick(this.restX, this.restY);
  }

  placeStick(x, y) {
    this.stickEl.style.transform = `translate(${x - this.stick.r}px, ${y - this.stick.r}px)`;
  }

  moveStick(x, y) {
    const s = this.stick;
    let dx = x - s.ox;
    let dy = y - s.oy;
    const d = Math.hypot(dx, dy);
    if (d > s.r) {
      // drag the base along so the thumb never runs off the stick
      const k = (d - s.r) / d;
      s.ox += dx * k;
      s.oy += dy * k;
      this.placeStick(s.ox, s.oy);
      dx = x - s.ox;
      dy = y - s.oy;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
    const a = this.input.analog;
    a.x = dx / s.r;
    a.y = -dy / s.r;
    a.active = true;
  }

  resetStick() {
    this.stick.id = null;
    const a = this.input.analog;
    a.x = a.y = 0;
    a.active = false;
    this.stickEl.classList.remove('active');
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.placeStick(this.restX, this.restY);
  }

  pressButton(e, def, el) {
    e.preventDefault();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* not all browsers allow capture here */
    }
    this.game.audio.unlock();
    this.held.set(e.pointerId, def);
    this.input.inject(def.code, true);
    el.classList.add('down');
    if (def.repeat) this.repeatT = 0.18;
  }

  releaseButton(e) {
    const def = this.held.get(e.pointerId);
    if (!def) return;
    this.held.delete(e.pointerId);
    this.input.inject(def.code, false);
    this.buttons[def.id].el.classList.remove('down');
  }

  /** Drops every held touch (pause, focus loss, restart). */
  release() {
    for (const [, def] of this.held) {
      this.input.down.delete(def.code);
      this.buttons[def.id].el.classList.remove('down');
    }
    this.held.clear();
    this.look.id = null;
    if (this.stick.id !== null || this.input.analog.active) this.resetStick();
  }

  shake(id) {
    const b = this.buttons[id];
    if (!b || !this.visible) return;
    b.el.classList.remove('denied');
    void b.el.offsetWidth;
    b.el.classList.add('denied');
  }

  update(dt) {
    const g = this.game;
    const show = this.input.touchMode && g.state === 'playing' && !g.matchOver;
    if (show !== this.visible) {
      this.visible = show;
      this.root.classList.toggle('hidden', !show);
      if (!show) this.release();
    }
    if (!show) return;
    const k = g.player;
    // holding SLASH keeps the combo going
    for (const [, def] of this.held) {
      if (!def.repeat) continue;
      this.repeatT -= dt;
      if (this.repeatT <= 0 && !k.buffer.name) {
        this.input.tap(def.code);
        this.repeatT = 0.16;
      }
    }
    for (const id of ['crescent', 'cyclone', 'dash']) {
      const b = this.buttons[id];
      const rem = k.cooldowns.remaining(id);
      b.cd.style.setProperty('--cd', k.cooldowns.fraction(id).toFixed(3));
      b.text.textContent = rem > 0 ? rem.toFixed(1) : '';
      b.el.classList.toggle('ready', rem <= 0);
      b.el.classList.toggle('cooling', rem > 0);
    }
    const ult = this.buttons.ultimate;
    const e = k.energy / KAIRO.ultimate.max;
    ult.cd.style.setProperty('--cd', (1 - e).toFixed(3));
    ult.text.textContent = e >= 1 ? '' : Math.floor(e * 100) + '%';
    ult.el.classList.toggle('ready', e >= 1);
    ult.el.classList.toggle('cooling', e < 1);
    this.buttons.lock.el.classList.toggle('on', !!k.validLockTarget());
    const gb = this.buttons.gear;
    const nextCost = k.gear < 3 ? GEARS[k.gear + 1].cost : 0;
    gb.cd.style.setProperty('--cd', k.nextGear || k.gear >= 3 ? '0' : (1 - clamp(k.gearGauge / nextCost, 0, 1)).toFixed(3));
    gb.text.textContent = k.gear > 1 ? Math.ceil(k.gearGauge / GEARS[k.gear].drain) + 's' : '';
    gb.el.classList.toggle('ready', !!k.nextGear);
    gb.el.classList.toggle('active', k.gear > 1);
    gb.el.classList.toggle('g3', k.gear === 3);
  }
}
