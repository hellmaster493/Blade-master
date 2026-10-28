// Circular minimap for the big arenas. It rotates with the camera (camera-forward is up, so
// "up" on the map is where W takes you) and shows the boundary, props, Kairo, his lock target,
// monsters and clan fighters.
import { ARENA } from '../config.js';

const UPDATE_EVERY = 1 / 30;

export class Minimap {
  constructor(parent, game) {
    this.game = game;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.t = 0;
    this.size = 0;
  }

  resize() {
    const css = this.canvas.clientWidth || 150;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(css * dpr);
    if (px !== this.size) {
      this.size = px;
      this.canvas.width = this.canvas.height = px;
    }
  }

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = UPDATE_EVERY;
    this.resize();
    const g = this.game;
    const ctx = this.ctx;
    const S = this.size;
    if (!S) return;
    const c = S / 2;
    const rad = c - 3 * (S / 150);
    const k = rad / (ARENA.wallRadius + 0.5);
    const yaw = g.cameraRig.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // world (x, z) -> canvas: camera right is +u, camera forward is up
    const P = (x, z) => [c + (-fz * x + fx * z) * k, c - (fx * x + fz * z) * k];
    const map = g.arena.map;
    const accent = map ? map.swatch[1] : '#ff3c6a';

    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, rad, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6, 8, 18, 0.62)';
    ctx.fill();
    ctx.clip();
    // faint range rings
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = Math.max(1, S / 150);
    for (const f of [0.33, 0.66]) {
      ctx.beginPath();
      ctx.arc(c, c, rad * f, 0, Math.PI * 2);
      ctx.stroke();
    }
    // props
    ctx.fillStyle = 'rgba(170, 176, 200, 0.42)';
    for (const col of g.arena.colliders) {
      const [u, v] = P(col.x, col.z);
      ctx.beginPath();
      ctx.arc(u, v, Math.max(1.2 * (S / 150), col.r * k), 0, Math.PI * 2);
      ctx.fill();
    }
    // camera view cone from Kairo
    const kp = g.player.position;
    const [ku, kv] = P(kp.x, kp.z);
    const grd = ctx.createRadialGradient(ku, kv, 0, ku, kv, rad * 0.55);
    grd.addColorStop(0, 'rgba(255,255,255,0.16)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(ku, kv);
    ctx.arc(ku, kv, rad * 0.55, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
    ctx.closePath();
    ctx.fill();
    // combatants
    const lock = g.player.validLockTarget();
    const dot = S / 150;
    for (const e of g.director.enemies) {
      if (e.state === 'spawn' && !e.isNpc) continue;
      const [u, v] = P(e.position.x, e.position.z);
      const down = e.isDefeated();
      if (e.isNpc) {
        ctx.fillStyle = down ? 'rgba(160,160,170,0.5)' : e.clan.css;
        if (down) {
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 1.2 * dot;
          ctx.beginPath();
          ctx.moveTo(u - 2.5 * dot, v - 2.5 * dot);
          ctx.lineTo(u + 2.5 * dot, v + 2.5 * dot);
          ctx.moveTo(u + 2.5 * dot, v - 2.5 * dot);
          ctx.lineTo(u - 2.5 * dot, v + 2.5 * dot);
          ctx.stroke();
          continue;
        }
      } else {
        if (down) continue;
        ctx.fillStyle = e.isBoss ? '#ff5a3a' : '#ff3a5a';
      }
      ctx.beginPath();
      ctx.arc(u, v, (e.isBoss ? 5 : 3.2) * dot, 0, Math.PI * 2);
      ctx.fill();
      if (e === lock) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.4 * dot;
        ctx.beginPath();
        ctx.arc(u, v, 6 * dot, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    // boundary ring in the arena's colour
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2 * dot;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(c, c, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Kairo: an arrow along his facing, relative to the camera
    const rel = g.player.facing - yaw;
    ctx.save();
    ctx.translate(ku, kv);
    ctx.rotate(-rel);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ff2440';
    ctx.lineWidth = 1.2 * dot;
    ctx.beginPath();
    ctx.moveTo(0, -6 * dot);
    ctx.lineTo(4.2 * dot, 4.5 * dot);
    ctx.lineTo(0, 2.4 * dot);
    ctx.lineTo(-4.2 * dot, 4.5 * dot);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
