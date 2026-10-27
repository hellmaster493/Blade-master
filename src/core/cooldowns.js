// Consistent cooldown bookkeeping driven by game-time delta.
export class Cooldowns {
  /** @param {Record<string, number>} durations seconds per cooldown id */
  constructor(durations) {
    this.durations = { ...durations };
    this.remainingTime = {};
    for (const id of Object.keys(this.durations)) this.remainingTime[id] = 0;
    this._readied = [];
  }

  ready(id) {
    return this.remainingTime[id] <= 0;
  }

  start(id, duration = this.durations[id]) {
    this.remainingTime[id] = duration;
  }

  remaining(id) {
    return Math.max(0, this.remainingTime[id]);
  }

  /** 1 = just started, 0 = ready. */
  fraction(id) {
    const d = this.durations[id];
    return d > 0 ? Math.max(0, this.remainingTime[id]) / d : 0;
  }

  /** Advances all timers; returns the ids that became ready this step. */
  update(dt) {
    this._readied.length = 0;
    for (const id in this.remainingTime) {
      const before = this.remainingTime[id];
      if (before > 0) {
        this.remainingTime[id] = before - dt;
        if (this.remainingTime[id] <= 0) {
          this.remainingTime[id] = 0;
          this._readied.push(id);
        }
      }
    }
    return this._readied;
  }

  reset() {
    for (const id in this.remainingTime) this.remainingTime[id] = 0;
  }
}
