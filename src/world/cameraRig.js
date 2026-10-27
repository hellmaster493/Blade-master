// Third-person orbit camera with lock-on framing, collision, trauma shake, FOV kicks and
// cinematic presets for the ultimate. Updated with real (unscaled) time so it stays smooth during hit-stop.
import * as THREE from 'three';
import { ARENA } from '../config.js';
import { clamp, damp, dampAngle } from '../core/mathutils.js';

const _focus = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _off = new THREE.Vector3();

const CINEMATIC = {
  ultFocus: { dist: 4.0, pitch: 0.1, yawOffset: 0.75, fov: 52, focusMix: 0 },
  ultFlash: { dist: 6.2, pitch: 0.2, yawOffset: 0.5, fov: 78, focusMix: 0.3 },
  ultCuts: { dist: 6.8, pitch: 0.22, yawOffset: 1.05, fov: 60, focusMix: 0.5 },
  ultSever: { dist: 7.6, pitch: 0.14, yawOffset: 1.25, fov: 58, focusMix: 0.45 },
  victory: { dist: 4.4, pitch: 0.1, yawOffset: Math.PI - 0.65, fov: 50, focusMix: 0, focusY: 1.15 },
  defeat: { dist: 4.8, pitch: 0.32, yawOffset: Math.PI - 0.9, fov: 52, focusMix: 0, focusY: 0.8 },
};

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.32;
    this.distance = 6.4;
    this.zoom = 6.4;
    this.fovBase = 62;
    this.fovKick = 0;
    this.trauma = 0;
    this.shakeScale = 1;
    this.sensitivity = 1;
    this.focus = new THREE.Vector3(0, 1.5, 0);
    this.cinematic = null;
    this.time = 0;
    this.orbit = false;
    this.title = false; // character-select framing: Kairo on the right, slow sway
  }

  reset(yaw = 0, target = null) {
    this.yaw = yaw;
    this.pitch = 0.32;
    this.zoom = 6.4;
    this.distance = this.zoom;
    this.trauma = 0;
    this.fovKick = 0;
    this.cinematic = null;
    if (target) this.focus.set(target.x, target.y + 1.45, target.z);
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount * this.shakeScale);
  }

  kick(deg) {
    this.fovKick = Math.min(20, this.fovKick + deg);
  }

  setCinematic(name) {
    this.cinematic = name ? CINEMATIC[name] : null;
  }

  /**
   * @param ctx.player   Kairo
   * @param ctx.target   locked target or null
   * @param ctx.input    Input (null when not controllable)
   */
  update(dt, ctx) {
    this.time += dt;
    const { player, target, input } = ctx;
    if (this.title) {
      this.updateTitle(dt, player);
      return;
    }
    const cin = this.cinematic;

    if (input && !cin) {
      const sens = 0.0024 * this.sensitivity;
      if (!target) this.yaw -= input.mouseDX * sens;
      this.pitch = clamp(this.pitch + input.mouseDY * sens * 0.8, -0.2, 1.05);
      const turn = 2.6 * dt;
      if (input.isDown('ArrowLeft')) this.yaw += turn;
      if (input.isDown('ArrowRight')) this.yaw -= turn;
      if (input.isDown('ArrowUp')) this.pitch = clamp(this.pitch - turn * 0.6, -0.2, 1.05);
      if (input.isDown('ArrowDown')) this.pitch = clamp(this.pitch + turn * 0.6, -0.2, 1.05);
      if (input.wheel) this.zoom = clamp(this.zoom + input.wheel * 0.6, 3.6, 10);
    }

    if (this.orbit) {
      this.yaw += dt * 0.18;
    }

    // desired focus
    _focus.set(player.position.x, player.position.y + 1.45, player.position.z);
    let mix = 0;
    if (target && !cin) {
      mix = 0.28;
      const desiredYaw = Math.atan2(target.position.x - player.position.x, target.position.z - player.position.z);
      this.yaw = dampAngle(this.yaw, desiredYaw, 7, dt);
      this.pitch = damp(this.pitch, Math.max(this.pitch, 0.28), 2, dt);
    }
    let desiredDist = this.zoom;
    let desiredFov = this.fovBase;
    if (target && !cin && target.isBoss) {
      // pull back so a towering boss stays readable
      desiredDist = this.zoom + 3;
      this.pitch = damp(this.pitch, Math.max(this.pitch, 0.38), 2, dt);
    }
    if (cin) {
      mix = cin.focusMix;
      const desiredYaw = player.facing + cin.yawOffset;
      this.yaw = dampAngle(this.yaw, desiredYaw, 5, dt);
      this.pitch = damp(this.pitch, cin.pitch, 5, dt);
      desiredDist = cin.dist;
      desiredFov = cin.fov;
      if (cin.focusY !== undefined) _focus.y = player.position.y + cin.focusY;
      if (player.ultimate && player.ultimate.target && mix > 0) {
        const tp = player.ultimate.lastTargetPos;
        _focus.x += (tp.x - _focus.x) * mix;
        _focus.z += (tp.z - _focus.z) * mix;
        mix = 0;
      }
    }
    if (target && mix > 0) {
      const tx = target.position.x - _focus.x;
      const tz = target.position.z - _focus.z;
      const l = Math.hypot(tx, tz);
      const lim = Math.min(l * mix, 3.5);
      if (l > 1e-3) {
        _focus.x += (tx / l) * lim;
        _focus.z += (tz / l) * lim;
      }
    }
    this.focus.x = damp(this.focus.x, _focus.x, 14, dt);
    this.focus.z = damp(this.focus.z, _focus.z, 14, dt);
    this.focus.y = damp(this.focus.y, _focus.y, 7, dt);
    this.distance = damp(this.distance, desiredDist, 4, dt);

    // spherical offset behind the view direction
    const cp = Math.cos(this.pitch);
    _off.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    let dist = this.distance;
    dist = this.collide(this.focus, _off, dist, ctx.colliders || []);
    _pos.copy(this.focus).addScaledVector(_off, dist);
    if (_pos.y < 0.35) _pos.y = 0.35;

    // trauma shake (squared for a nicer falloff)
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const s = this.trauma * this.trauma;
    const t = this.time * 38;
    const sx = (Math.sin(t * 1.13) + Math.sin(t * 2.71) * 0.5) * s * 0.28;
    const sy = (Math.sin(t * 1.71 + 1.3) + Math.sin(t * 3.13) * 0.5) * s * 0.22;
    const sr = Math.sin(t * 0.93 + 2.1) * s * 0.035;

    const cam = this.camera;
    cam.position.copy(_pos);
    cam.lookAt(this.focus);
    cam.position.x += sx * Math.cos(this.yaw);
    cam.position.z -= sx * Math.sin(this.yaw);
    cam.position.y += sy;
    cam.rotateZ(sr);

    this.fovKick = damp(this.fovKick, 0, 5, dt);
    const fov = damp(cam.fov, desiredFov + this.fovKick, 8, dt);
    if (Math.abs(fov - cam.fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  updateTitle(dt, player) {
    const cam = this.camera;
    const yaw = Math.PI + 0.45 * Math.sin(this.time * 0.22) - 0.25;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // shift the look-at point to the camera's left so Kairo sits right of the menu
    const aspect = cam.aspect || 1.7;
    const shift = Math.min(1.7, 0.95 * aspect);
    _focus.set(player.position.x + fz * shift, player.position.y + 1.12, player.position.z - fx * shift);
    const dist = 4.4;
    _pos.set(_focus.x - fx * dist, _focus.y + 0.35, _focus.z - fz * dist);
    cam.position.copy(_pos);
    cam.lookAt(_focus);
    if (Math.abs(cam.fov - 50) > 0.01) {
      cam.fov = 50;
      cam.updateProjectionMatrix();
    }
  }

  /** Shortens the boom so the camera stays inside the arena and outside pillars. */
  collide(focus, dir, dist, colliders) {
    // arena boundary
    const R = ARENA.cameraRadius;
    const px = focus.x + dir.x * dist;
    const pz = focus.z + dir.z * dist;
    if (px * px + pz * pz > R * R) {
      // solve |focus + dir*s|^2 = R^2 for s
      const a = dir.x * dir.x + dir.z * dir.z;
      const b = 2 * (focus.x * dir.x + focus.z * dir.z);
      const c = focus.x * focus.x + focus.z * focus.z - R * R;
      const disc = b * b - 4 * a * c;
      if (a > 1e-6 && disc >= 0) dist = Math.min(dist, Math.max(1.5, (-b + Math.sqrt(disc)) / (2 * a)));
    }
    for (const col of colliders) {
      // ray-circle in XZ
      const fx = focus.x - col.x;
      const fz = focus.z - col.z;
      const a = dir.x * dir.x + dir.z * dir.z;
      if (a < 1e-6) continue;
      const b = 2 * (fx * dir.x + fz * dir.z);
      const r = col.r + 0.35;
      const c = fx * fx + fz * fz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const s = (-b - Math.sqrt(disc)) / (2 * a);
      if (s > 0 && s < dist) dist = Math.max(1.5, s);
    }
    return dist;
  }
}
