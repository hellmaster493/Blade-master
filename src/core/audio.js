// Procedural Web Audio sound effects. No audio files are needed.
// The AudioContext is only created/resumed from a user gesture (unlock()) to respect autoplay rules.

const MIN_INTERVAL = {
  hit: 0.028, hitMedium: 0.035, hitHeavy: 0.05, swing: 0.03, ultCut: 0.03, enemyDefeat: 0.05, ready: 0.08, step: 0.05,
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.muted = false;
    this.noise = null;
    this.voices = 0;
    this.maxVoices = 48;
    this._last = {};
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /**
   * Creates and/or resumes the context. Call from user-gesture handlers. Mobile browsers only
   * honour this inside touch-end/click/key events, so callers keep trying until it is running.
   */
  unlock() {
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
      } catch {
        this.ctx = null;
        return;
      }
      this.master = this.ctx.createGain();
      // A gentle compressor keeps stacked hits from clipping.
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 6;
      this.master.connect(this.comp).connect(this.ctx.destination);
      this._applyVolume();
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    // iOS Safari: play through the ringer/silent switch like other games and media do
    try {
      if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
    } catch {
      /* not supported */
    }
    if (this.ctx.state !== 'running') {
      try {
        const p = this.ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
        // iOS only fully unlocks output once a source starts inside the gesture
        const prime = this.ctx.createBufferSource();
        prime.buffer = this.ctx.createBuffer(1, 1, 22050);
        prime.connect(this.ctx.destination);
        prime.start(0);
      } catch {
        /* refused outside a gesture; the next tap retries */
      }
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this._applyVolume();
  }

  setMuted(m) {
    this.muted = !!m;
    this._applyVolume();
  }

  _applyVolume() {
    if (!this.master) return;
    const target = this.muted ? 0 : this.volume * 0.9;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
  }

  // ---------- building blocks ----------
  _voice(dur) {
    this.voices++;
    setTimeout(() => this.voices--, (dur + 0.1) * 1000);
  }

  _out(pan = 0) {
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      p.connect(this.master);
      return p;
    }
    return this.master;
  }

  _env(g, t, attack, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _noise({ t = 0, dur = 0.2, type = 'bandpass', f0 = 1000, f1 = f0, q = 1, gain = 0.3, attack = 0.005, pan = 0, rate = 1 }) {
    const c = this.ctx;
    const start = c.currentTime + t;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const filt = c.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, start);
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), start + dur);
    const g = c.createGain();
    this._env(g, start, attack, gain, dur);
    src.connect(filt).connect(g).connect(this._out(pan));
    src.start(start, Math.random() * 1.5);
    src.stop(start + attack + dur + 0.05);
    this._voice(t + dur);
  }

  _tone({ t = 0, dur = 0.2, type = 'sine', f0 = 440, f1 = f0, gain = 0.2, attack = 0.005, pan = 0 }) {
    const c = this.ctx;
    const start = c.currentTime + t;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(10, f1), start + dur);
    const g = c.createGain();
    this._env(g, start, attack, gain, dur);
    osc.connect(g).connect(this._out(pan));
    osc.start(start);
    osc.stop(start + attack + dur + 0.05);
    this._voice(t + dur);
  }

  // ---------- public SFX ----------
  play(name, opts = {}) {
    if (!this.ready || this.muted || this.volume <= 0) return;
    if (this.voices > this.maxVoices) return;
    const now = this.ctx.currentTime;
    const minGap = MIN_INTERVAL[name];
    if (minGap && this._last[name] && now - this._last[name] < minGap) return;
    this._last[name] = now;
    const fn = this['_' + name];
    if (fn) fn.call(this, opts);
  }

  _swing({ power = 0.5 } = {}) {
    const p = Math.max(0, Math.min(1, power));
    const pan = (Math.random() - 0.5) * 0.4;
    this._noise({ dur: 0.12 + p * 0.16, f0: 700 + p * 300, f1: 3600 - p * 900, q: 1.6, gain: 0.22 + p * 0.18, attack: 0.012, pan });
    this._tone({ dur: 0.1 + p * 0.1, f0: 1400 - p * 500, f1: 500, gain: 0.03 + p * 0.03, type: 'sine', pan });
    if (p > 0.7) this._noise({ dur: 0.25, type: 'lowpass', f0: 500, f1: 160, gain: 0.18, attack: 0.02 });
  }

  _hit({ heavy = false, pitch = 1 } = {}) {
    const pan = (Math.random() - 0.5) * 0.3;
    this._noise({ dur: heavy ? 0.12 : 0.06, type: 'highpass', f0: 1800 * pitch, f1: 900 * pitch, q: 0.7, gain: heavy ? 0.4 : 0.3, pan });
    this._tone({ dur: heavy ? 0.22 : 0.12, f0: (heavy ? 150 : 210) * pitch, f1: heavy ? 45 : 70, gain: heavy ? 0.55 : 0.35, pan });
    const ring = (2400 + Math.random() * 600) * pitch;
    this._tone({ dur: heavy ? 0.4 : 0.25, type: 'triangle', f0: ring, f1: ring * 0.96, gain: 0.05, pan });
    this._tone({ dur: heavy ? 0.35 : 0.2, type: 'triangle', f0: ring * 1.51, f1: ring * 1.45, gain: 0.03, pan });
    if (heavy) this._noise({ dur: 0.3, type: 'lowpass', f0: 700, f1: 120, gain: 0.35 });
  }

  /** Mid-weight cut (Crosswind): lower ring and a longer body than a light hit. */
  _hitMedium() {
    this._hit({ pitch: 0.78 });
    this._noise({ dur: 0.14, type: 'bandpass', f0: 900, f1: 400, q: 1.2, gain: 0.18 });
  }

  _hitHeavy() {
    this._hit({ heavy: true });
  }

  _dash() {
    this._noise({ dur: 0.22, f0: 2600, f1: 420, q: 0.9, gain: 0.3, attack: 0.01 });
    this._tone({ dur: 0.15, f0: 900, f1: 250, gain: 0.04 });
  }

  _jump() {
    this._noise({ dur: 0.14, type: 'lowpass', f0: 900, f1: 300, gain: 0.12 });
  }

  _land() {
    this._noise({ dur: 0.12, type: 'lowpass', f0: 500, f1: 120, gain: 0.22 });
    this._tone({ dur: 0.1, f0: 120, f1: 60, gain: 0.18 });
  }

  _ability() {
    this._swing({ power: 0.9 });
    this._tone({ dur: 0.35, f0: 900, f1: 2600, gain: 0.05, type: 'sine', attack: 0.02 });
    this._tone({ t: 0.02, dur: 0.3, f0: 1350, f1: 3400, gain: 0.03, type: 'triangle', attack: 0.02 });
  }

  _cyclone() {
    for (let i = 0; i < 4; i++) {
      this._noise({ t: i * 0.15, dur: 0.18, f0: 600, f1: 2800, q: 1.4, gain: 0.2, attack: 0.03, pan: i % 2 ? 0.35 : -0.35 });
    }
    this._tone({ dur: 0.7, f0: 300, f1: 900, gain: 0.04, attack: 0.1, type: 'sawtooth' });
  }

  _burst() {
    this._noise({ dur: 0.4, type: 'lowpass', f0: 1200, f1: 150, gain: 0.35 });
    this._tone({ dur: 0.3, f0: 180, f1: 50, gain: 0.4 });
  }

  _ultCharge() {
    this._tone({ dur: 0.8, f0: 55, f1: 110, gain: 0.25, attack: 0.3, type: 'sawtooth' });
    this._tone({ dur: 0.8, f0: 220, f1: 1200, gain: 0.05, attack: 0.4, type: 'sine' });
    this._noise({ dur: 0.8, f0: 300, f1: 3000, q: 2, gain: 0.12, attack: 0.5 });
  }

  _flashStep() {
    this._noise({ dur: 0.2, type: 'highpass', f0: 4000, f1: 1500, gain: 0.25 });
    this._tone({ dur: 0.18, f0: 2000, f1: 400, gain: 0.05 });
  }

  _ultCut() {
    const pan = (Math.random() - 0.5) * 0.8;
    this._noise({ dur: 0.06, type: 'highpass', f0: 3500, f1: 2000, gain: 0.25, pan });
    this._tone({ dur: 0.16, type: 'triangle', f0: 1800 + Math.random() * 900, f1: 1500, gain: 0.05, pan });
    this._tone({ dur: 0.08, f0: 200, f1: 80, gain: 0.25, pan });
  }

  _ultBoom() {
    this._noise({ dur: 1.4, type: 'lowpass', f0: 900, f1: 60, gain: 0.6, attack: 0.005 });
    this._tone({ dur: 1.0, f0: 80, f1: 28, gain: 0.7 });
    this._noise({ dur: 0.12, type: 'highpass', f0: 3000, f1: 1200, gain: 0.4 });
    this._tone({ t: 0.02, dur: 1.2, type: 'triangle', f0: 1320, f1: 1250, gain: 0.04 });
  }

  _enemyDefeat() {
    this._noise({ dur: 0.35, f0: 900, f1: 200, q: 1, gain: 0.25 });
    this._tone({ dur: 0.5, f0: 420, f1: 70, gain: 0.12, type: 'sawtooth' });
    this._tone({ t: 0.05, dur: 0.6, f0: 1800, f1: 3600, gain: 0.025, type: 'sine', attack: 0.05 });
  }

  _perfectDodge() {
    this._tone({ dur: 0.7, f0: 1318, f1: 1310, gain: 0.12, type: 'sine' });
    this._tone({ t: 0.04, dur: 0.6, f0: 1976, f1: 1970, gain: 0.07, type: 'sine' });
    this._noise({ dur: 0.25, type: 'highpass', f0: 1200, f1: 5000, gain: 0.12, attack: 0.15 });
  }

  _hurt() {
    this._noise({ dur: 0.2, type: 'lowpass', f0: 900, f1: 200, gain: 0.4 });
    this._tone({ dur: 0.18, f0: 140, f1: 60, gain: 0.35, type: 'square' });
  }

  _ready() {
    this._tone({ dur: 0.12, f0: 880, f1: 1320, gain: 0.06, type: 'sine' });
  }

  _enemyWindup() {
    this._tone({ dur: 0.3, f0: 95, f1: 70, gain: 0.1, type: 'sawtooth', attack: 0.06 });
  }

  _enemySwing() {
    this._noise({ dur: 0.18, f0: 400, f1: 1500, q: 1.2, gain: 0.18, attack: 0.02 });
  }

  _orb() {
    this._tone({ dur: 0.35, f0: 600, f1: 260, gain: 0.07, type: 'triangle' });
  }

  _slam() {
    this._noise({ dur: 0.7, type: 'lowpass', f0: 700, f1: 60, gain: 0.5 });
    this._tone({ dur: 0.5, f0: 90, f1: 32, gain: 0.55 });
  }

  _roar() {
    this._tone({ dur: 1.0, f0: 70, f1: 48, gain: 0.25, type: 'sawtooth', attack: 0.1 });
    this._noise({ dur: 1.0, type: 'lowpass', f0: 600, f1: 200, gain: 0.25, attack: 0.1 });
  }

  _wave() {
    this._tone({ dur: 0.45, f0: 95, f1: 45, gain: 0.5 });
    this._noise({ dur: 0.25, type: 'lowpass', f0: 600, f1: 150, gain: 0.3 });
    this._tone({ t: 0.18, dur: 0.4, f0: 95, f1: 45, gain: 0.4 });
  }

  _victory() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this._tone({ t: i * 0.12, dur: 0.9, f0: f, f1: f, gain: 0.09, type: 'triangle', attack: 0.02 });
    });
  }

  _defeat() {
    [392, 311.1, 261.6, 196].forEach((f, i) => {
      this._tone({ t: i * 0.18, dur: 0.8, f0: f, f1: f * 0.98, gain: 0.08, type: 'triangle', attack: 0.02 });
    });
  }

  _ui() {
    this._tone({ dur: 0.05, f0: 1500, f1: 1200, gain: 0.04, type: 'square' });
  }

  _sheathe() {
    this._noise({ dur: 0.25, f0: 2500, f1: 5000, q: 3, gain: 0.08, attack: 0.18 });
    this._tone({ t: 0.42, dur: 0.18, type: 'triangle', f0: 2600, f1: 2500, gain: 0.08 });
    this._tone({ t: 0.42, dur: 0.06, f0: 300, f1: 120, gain: 0.2 });
  }
}
