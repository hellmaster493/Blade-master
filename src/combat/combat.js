// Shared combat interface + hit detection used by the player and all enemies.
//
// Any entity that can be hit implements the Combatant interface (duck typed):
//
//   team: 'player' | 'enemy'
//   position: THREE.Vector3            feet position in world space
//   radius: number                     horizontal collision radius
//   height: number                     vertical extent above position.y
//   isDefeated(): boolean
//   isInvulnerable(): boolean
//   receiveDamage(hit: HitInfo): HitResult
//   applyKnockback(dir: THREE.Vector3, force: number, lift?: number): void
//
// HitInfo  = { damage, knockback, lift, stagger, kind, source, point, dir, hitstop }
// HitResult = { applied: boolean, killed: boolean, damage: number, dodged?: boolean, perfect?: boolean }

import * as THREE from 'three';

const _v = new THREE.Vector3();

/** Remembers which targets one attack strike has already hit, so damage applies once per strike. */
export class HitTracker {
  constructor() {
    this.hit = new Set();
  }
  has(target) {
    return this.hit.has(target);
  }
  add(target) {
    this.hit.add(target);
  }
  reset() {
    this.hit.clear();
  }
  get size() {
    return this.hit.size;
  }
}

export class CombatSystem {
  constructor(events) {
    this.events = events;
    this.combatants = new Set();
    this._results = [];
  }

  register(c) {
    this.combatants.add(c);
  }

  unregister(c) {
    this.combatants.delete(c);
  }

  clear() {
    this.combatants.clear();
  }

  /** Alive combatants that are hostile to `team`. */
  opponents(team, out = []) {
    out.length = 0;
    for (const c of this.combatants) {
      if (c.team !== team && !c.isDefeated()) out.push(c);
    }
    return out;
  }

  nearestOpponent(team, origin, maxDist = Infinity, filter = null) {
    let best = null;
    let bestD = maxDist;
    for (const c of this.combatants) {
      if (c.team === team || c.isDefeated()) continue;
      if (filter && !filter(c)) continue;
      const d = Math.hypot(c.position.x - origin.x, c.position.z - origin.z) - c.radius;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  /**
   * Sector (cone) query on the horizontal plane with a vertical band.
   * Targets behind the attacker are never returned unless halfAngle >= PI.
   * @returns {{target, dist, angle}[]} (reused array)
   */
  querySector({ origin, forward, range, halfAngle, team, yMin = -0.5, yMax = 2.5, minRange = 0 }) {
    const out = this._results;
    out.length = 0;
    const fx = forward.x;
    const fz = forward.z;
    const fl = Math.hypot(fx, fz) || 1;
    for (const c of this.combatants) {
      if (c.team === team || c.isDefeated()) continue;
      // Vertical overlap of the strike band and the target's body.
      const bottom = c.position.y - origin.y;
      const top = bottom + c.height;
      if (top < yMin || bottom > yMax) continue;
      const dx = c.position.x - origin.x;
      const dz = c.position.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist - c.radius > range || dist + c.radius < minRange) continue;
      let angle = 0;
      if (dist > 1e-4) {
        const cos = (dx * fx + dz * fz) / (dist * fl);
        angle = Math.acos(Math.max(-1, Math.min(1, cos)));
      }
      if (halfAngle < Math.PI) {
        // Allow for the target's body width, but never let a frontal strike reach behind.
        const allowance = Math.asin(Math.min(1, c.radius / Math.max(dist, 1e-4)));
        const limit = Math.min(halfAngle + Math.min(allowance, 0.5), Math.max(halfAngle, 1.75));
        if (angle > limit) continue;
      }
      out.push({ target: c, dist, angle });
    }
    return out;
  }

  queryRadius(origin, radius, team, yMin = -1, yMax = 3) {
    return this.querySector({ origin, forward: _v.set(0, 0, 1), range: radius, halfAngle: Math.PI, team, yMin, yMax });
  }

  /**
   * Applies a hit once per tracker. Respects defeat and invulnerability.
   * Emits 'hit' events for FX/UI/audio when damage lands.
   */
  applyHit(attacker, target, hit, tracker) {
    if (!target || target.isDefeated()) return null;
    if (tracker && tracker.has(target)) return null;
    if (tracker) tracker.add(target);
    const result = target.receiveDamage(hit);
    if (result && result.applied) {
      if (hit.knockback || hit.lift) {
        _v.copy(hit.dir || _v.set(0, 0, 0));
        if (_v.lengthSq() < 1e-6) {
          _v.set(target.position.x - attacker.position.x, 0, target.position.z - attacker.position.z);
        }
        _v.y = 0;
        if (_v.lengthSq() > 1e-6) _v.normalize();
        target.applyKnockback(_v, hit.knockback || 0, hit.lift || 0);
      }
      this.events.emit('hit', { attacker, target, hit, result });
      if (result.killed) this.events.emit('kill', { attacker, target, hit });
    } else if (result && result.dodged) {
      this.events.emit('dodged', { attacker, target, hit, result });
    }
    return result;
  }
}
