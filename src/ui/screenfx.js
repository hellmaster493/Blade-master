// DOM overlay effects: screen flash, vignette, cinematic letterbox and anime speed lines.
import { clamp, damp } from '../core/mathutils.js';

const FLASH_COLORS = {
  white: '255,255,255',
  red: '255,40,60',
  blue: '120,200,255',
  crimson: '255,36,64',
  violet: '190,110,255',
};

export class ScreenFX {
  constructor(root) {
    this.root = root;
    this.flashEl = root.querySelector('#fx-flash');
    this.vignetteEl = root.querySelector('#fx-vignette');
    this.hurtEl = root.querySelector('#fx-hurt');
    this.boxTop = root.querySelector('#fx-letterbox-top');
    this.boxBottom = root.querySelector('#fx-letterbox-bottom');
    this.canvas = root.querySelector('#fx-speedlines');
    this.ctx = this.canvas.getContext('2d');
    this.flashA = 0;
    this.flashDecay = 4;
    this.vig = 0;
    this.vigTarget = 0;
    this.hurt = 0;
    this.box = 0;
    this.boxTarget = 0;
    this.lines = 0;
    this.lowHealth = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.floor(window.innerWidth * dpr * 0.5);
    this.canvas.height = Math.floor(window.innerHeight * dpr * 0.5);
  }

  flash(color = 'white', strength = 0.4) {
    this.flashEl.style.background = `rgb(${FLASH_COLORS[color] || FLASH_COLORS.white})`;
    this.flashA = Math.max(this.flashA, strength);
  }

  hurtPulse(strength = 0.6) {
    this.hurt = Math.max(this.hurt, strength);
  }

  vignette(on, strength = 0.65) {
    this.vigTarget = on ? strength : 0;
  }

  letterbox(on) {
    this.boxTarget = on ? 1 : 0;
  }

  speedLines(strength = 0.6) {
    this.lines = Math.max(this.lines, strength);
  }

  clear() {
    this.flashA = 0;
    this.vig = this.vigTarget = 0;
    this.hurt = 0;
    this.box = this.boxTarget = 0;
    this.lines = 0;
    this.update(0);
  }

  update(dt, lowHealth = 0) {
    this.flashA = Math.max(0, this.flashA - dt * this.flashDecay);
    this.flashEl.style.opacity = this.flashA.toFixed(3);
    this.vig = damp(this.vig, this.vigTarget, 6, dt);
    this.vignetteEl.style.opacity = this.vig.toFixed(3);
    this.hurt = Math.max(0, this.hurt - dt * 2.5);
    this.lowHealth = damp(this.lowHealth, lowHealth, 3, dt);
    const pulse = this.lowHealth * (0.25 + 0.15 * Math.sin(performance.now() / 180));
    this.hurtEl.style.opacity = clamp(this.hurt + pulse, 0, 1).toFixed(3);
    this.box = damp(this.box, this.boxTarget, 7, dt);
    const h = (this.box * 9).toFixed(2) + 'vh';
    this.boxTop.style.height = h;
    this.boxBottom.style.height = h;
    this.lines = Math.max(0, this.lines - dt * 1.6);
    this.drawLines();
  }

  drawLines() {
    const c = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    c.clearRect(0, 0, w, h);
    if (this.lines <= 0.01) return;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.hypot(cx, cy);
    c.strokeStyle = `rgba(235,245,255,${(this.lines * 0.55).toFixed(3)})`;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = R * (0.45 + Math.random() * 0.35);
      c.lineWidth = 0.5 + Math.random() * 2;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.lineTo(cx + Math.cos(a) * R * 1.1, cy + Math.sin(a) * R * 1.1);
      c.stroke();
    }
  }
}
