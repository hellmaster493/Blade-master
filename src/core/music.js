// Procedural futuristic soundtrack (dark synthwave) generated live with Web Audio.
// A lookahead step sequencer (16 steps per bar) schedules synth voices slightly ahead of
// the audio clock, so timing stays tight even when the game's frame rate dips.
// Modes follow the game: menu -> training/battle -> boss -> bossRage -> victory/defeat.

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Pad voicings (around the 3rd/4th octave) and bass roots.
const CHORDS = {
  Am: { pad: [57, 60, 64], root: 33 },
  F: { pad: [53, 57, 60], root: 29 },
  C: { pad: [55, 60, 64], root: 36 },
  G: { pad: [55, 59, 62], root: 31 },
  Dm: { pad: [57, 62, 65], root: 38 },
  E: { pad: [56, 59, 64], root: 28 },
};

// Layer levels per mode (0 = off). arpRate 1 = 16th notes, 2 = 8th notes.
const MODES = {
  menu: { bpm: 96, prog: ['Am', 'F', 'C', 'G'], pad: 1.2, arp: 0.8, arpRate: 2, sub: 1, hats: 0.3, cutoff: 1700 },
  training: { bpm: 116, prog: ['Am', 'F', 'C', 'G'], pad: 0.6, arp: 0.65, arpRate: 1, kick: 0.75, snare: 0.55, hats: 0.55, bass: 0.75, cutoff: 2400 },
  battle: { bpm: 124, prog: ['Am', 'Am', 'F', 'G'], pad: 0.5, arp: 0.8, arpRate: 1, kick: 1, snare: 0.85, hats: 0.85, bass: 1, cutoff: 3000 },
  boss: { bpm: 132, prog: ['Am', 'F', 'Dm', 'E'], pad: 0.55, arp: 0.85, arpRate: 1, kick: 1, snare: 1, hats: 1, bass: 1, lead: 0.8, toms: 1, cutoff: 3400 },
  bossRage: { bpm: 140, prog: ['Am', 'F', 'Dm', 'E'], pad: 0.6, arp: 0.95, arpRate: 1, kick: 1, snare: 1, hats: 1, bass: 1, lead: 1, leadUp: 12, toms: 1, cutoff: 4200 },
  victory: { bpm: 100, prog: ['C', 'G', 'Am', 'F'], pad: 1, arp: 0.6, arpRate: 2, sub: 0.8, hats: 0.3, cutoff: 2600, sting: true },
  defeat: { bpm: 76, prog: ['Am', 'F', 'Dm', 'Am'], pad: 0.9, sub: 0.6, cutoff: 800 },
};

// Boss lead motif over the 4-bar progression: [step, midi note, length in steps]
const LEAD = [
  [0, 69, 3], [3, 72, 1], [4, 76, 4], [8, 74, 2], [10, 72, 2], [12, 71, 4],
  [16, 72, 3], [19, 69, 1], [20, 77, 4], [24, 76, 2], [26, 74, 2], [28, 72, 4],
  [32, 74, 3], [35, 77, 1], [36, 81, 4], [40, 79, 2], [42, 77, 2], [44, 76, 4],
  [48, 76, 4], [52, 80, 4], [56, 83, 2], [58, 80, 2], [60, 76, 4],
];

// Gear 3 lead: [step, chord tone index, length in steps]; fits any progression
const GEAR_LEAD = [[0, 0, 3], [3, 1, 1], [4, 2, 4], [8, 1, 2], [10, 0, 2], [12, 2, 4]];

const ARP_ORDER = [0, 1, 2, 3, 4, 5, 4, 3];
const LOOKAHEAD = 0.14; // seconds scheduled ahead of the audio clock
const TICK_MS = 25;

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.ctx = null;
    this.mode = 'off';
    this.pending = null;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.volume = 0.6;
    this.enabled = true;
    this.muffled = false;
    this.ducked = false;
    this.notes = 0; // scheduled note count (diagnostics/tests)
    this.boost = 1; // Kairo's current Gear: 2 adds drive, 3 adds the lead
  }

  setBoost(gear) {
    this.boost = gear;
  }

  get playing() {
    return !!this.timer;
  }

  /** Builds the mix bus. Needs the AudioEngine's context, so call after a user gesture. */
  ensure() {
    if (this.ctx || !this.audio.ctx) return !!this.ctx;
    const ctx = (this.ctx = this.audio.ctx);
    this.mix = ctx.createGain();
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.Q.value = 0.7;
    this.duckGain = ctx.createGain();
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.mix.connect(this.muffle).connect(this.duckGain).connect(this.out).connect(this.audio.master);

    // dotted-8th feedback delay for arps and leads
    this.delaySend = ctx.createGain();
    this.delay = ctx.createDelay(2);
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.36;
    const fbFilter = ctx.createBiquadFilter();
    fbFilter.type = 'lowpass';
    fbFilter.frequency.value = 2600;
    this.delaySend.connect(this.delay);
    this.delay.connect(fbFilter).connect(this.feedback).connect(this.delay);
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.55;
    this.delay.connect(delayOut).connect(this.mix);

    // generated stereo reverb for pads and space
    this.reverbSend = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(2.8);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.6;
    this.reverbSend.connect(conv).connect(revOut).connect(this.mix);
    this.applyVolume();
    return true;
  }

  impulse(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  // ------------------------------------------------------------------ control
  start(mode = 'menu') {
    if (!this.ensure()) return false;
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), TICK_MS);
      this.mode = 'off';
    }
    this.setMode(mode);
    return true;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.mode = 'off';
    this.pending = null;
    if (this.out) this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }

  /** Switches style on the next beat so transitions land on the groove. */
  setMode(mode) {
    if (!MODES[mode]) return;
    if (!this.ctx) return;
    if (mode === this.mode && !this.pending) return;
    if (this.mode === 'off') {
      this.mode = mode;
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.08;
      this.firstBar = true;
      this.syncDelay();
      this.applyVolume(1.8);
      return;
    }
    this.pending = mode;
  }

  /** Echo lands on the dotted eighth of the current tempo. */
  syncDelay() {
    const bpm = MODES[this.mode].bpm;
    this.delay.delayTime.setTargetAtTime((0.75 * 60) / bpm, this.ctx.currentTime, 0.05);
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }

  setEnabled(on) {
    this.enabled = !!on;
    this.applyVolume();
  }

  applyVolume(fade = 0.25) {
    if (!this.out) return;
    const target = this.enabled ? this.volume * 0.8 : 0;
    this.out.gain.cancelScheduledValues(this.ctx.currentTime);
    this.out.gain.setTargetAtTime(target, this.ctx.currentTime, fade / 3);
  }

  /** Pause menu: music keeps playing but sounds far away. */
  setMuffled(on) {
    this.muffled = on;
    if (!this.muffle) return;
    const t = this.ctx.currentTime;
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setTargetAtTime(on ? 650 : 20000, t, on ? 0.08 : 0.25);
  }

  /** Dips the music for cinematic moments (the ultimate). */
  duck(on) {
    this.ducked = on;
    if (!this.duckGain) return;
    const t = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(t);
    this.duckGain.gain.setTargetAtTime(on ? 0.35 : 1, t, on ? 0.06 : 0.4);
  }

  // ------------------------------------------------------------------ sequencer
  tick() {
    const ctx = this.ctx;
    if (!ctx || this.mode === 'off') return;
    // after a suspend (hidden tab) jump forward instead of bursting every missed note
    if (this.nextTime < ctx.currentTime - 0.25) this.nextTime = ctx.currentTime + 0.05;
    let guard = 0;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD && guard++ < 32) {
      if (this.pending && this.step % 4 === 0) {
        this.mode = this.pending;
        this.pending = null;
        this.step = 0;
        this.firstBar = true;
        this.syncDelay();
      }
      const m = MODES[this.mode];
      const dur = 60 / m.bpm / 4;
      this.scheduleStep(m, this.step, this.nextTime, dur);
      this.nextTime += dur;
      this.step++;
      if (this.step % 16 === 0) this.firstBar = false;
    }
  }

  scheduleStep(m, step, t, sd) {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const chord = CHORDS[m.prog[bar % m.prog.length]];
    const barLen = sd * 16;
    const phraseEnd = bar % 4 === 3;

    if (s === 0) {
      if (m.pad) this.pad(t, chord.pad, barLen, m.pad, m.cutoff);
      if (m.sub) this.sub(t, chord.root + 12, barLen, m.sub);
      if (this.firstBar && (m.kick || m.sting)) this.crash(t, m.sting ? 0.5 : 0.8);
      if (this.firstBar && m.sting) this.sting(t, chord.pad);
      if (m.toms && bar % 8 === 0 && !this.firstBar) this.crash(t, 0.55);
    }
    // drums
    if (m.kick) {
      const kickHere = s % 4 === 0 || (m.toms && s === 14 && bar % 2 === 1);
      if (kickHere) this.kick(t, m.kick);
    }
    if (m.snare && (s === 4 || s === 12)) this.snare(t, m.snare);
    if (m.hats) {
      if (s % 4 === 2) this.hat(t, m.hats * (s === 14 && bar % 2 ? 1.2 : 1), s === 14 && bar % 2 === 1);
      else if (m.kick) this.hat(t, m.hats * (this.boost >= 2 ? 0.75 : 0.4), false);
    }
    if (this.boost >= 2 && m.kick && s % 8 === 6) this.hat(t + sd * 0.5, m.hats * 0.5, false);
    if (m.toms && phraseEnd && s >= 12) this.tom(t, 150 - (s - 12) * 22, m.toms);
    // bass: rolling 16ths around the kick
    if (m.bass && s % 4 !== 0) {
      const up = s % 4 === 3 ? 12 : 0;
      this.bass(t, chord.root + 12 + up, sd * 0.9, m.bass);
    }
    // arpeggio over chord tones, two octaves
    if (m.arp && s % (m.arpRate || 1) === 0) {
      const idx = ARP_ORDER[(s / (m.arpRate || 1)) % ARP_ORDER.length];
      const tones = chord.pad;
      const note = tones[idx % 3] + 12 + (idx >= 3 ? 12 : 0);
      this.arp(t, note, sd * (m.arpRate || 1), m.arp, m.cutoff);
    }
    // boss lead motif
    if (m.lead) {
      const ls = step % 64;
      for (const [at, note, len] of LEAD) {
        if (at === ls) this.lead(t, note + (m.leadUp || 0), sd * len, m.lead);
      }
    } else if (this.boost >= 3 && m.kick) {
      // Gear 3 unleashes a lead in any battle style, built from the current chord's tones
      for (const [at, tone, len] of GEAR_LEAD) {
        if (at === s) this.lead(t, chord.pad[tone] + 12 + (bar % 2 ? 12 : 0), sd * len, 0.7);
      }
    }
  }

  // ------------------------------------------------------------------ voices
  env(g, t, attack, peak, hold, release) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    return t + attack + hold + release + 0.05;
  }

  osc(type, freq, t, end, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    o.start(t);
    o.stop(end);
    return o;
  }

  noise(t, end) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.audio.noise;
    src.start(t, Math.random() * 1.5);
    src.stop(end);
    return src;
  }

  pad(t, notes, len, level, cutoff) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(cutoff * 0.45, t);
    f.frequency.linearRampToValueAtTime(cutoff * 0.8, t + len * 0.6);
    f.frequency.linearRampToValueAtTime(cutoff * 0.5, t + len);
    const end = this.env(g, t, Math.min(0.5, len * 0.2), 0.05 * level, len * 0.6, len * 0.55);
    for (const n of notes) {
      for (const d of [-9, 8]) this.osc('sawtooth', midi(n), t, end, d).connect(f);
    }
    f.connect(g);
    g.connect(this.mix);
    g.connect(this.reverbSend);
    this.notes++;
  }

  sub(t, note, len, level) {
    const g = this.ctx.createGain();
    const end = this.env(g, t, 0.08, 0.22 * level, len * 0.5, len * 0.45);
    this.osc('sine', midi(note), t, end).connect(g);
    g.connect(this.mix);
    this.notes++;
  }

  bass(t, note, len, level) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 7;
    f.frequency.setValueAtTime(1100, t);
    f.frequency.exponentialRampToValueAtTime(180, t + len);
    const end = this.env(g, t, 0.004, 0.2 * level, len * 0.4, len * 0.6);
    this.osc('sawtooth', midi(note), t, end).connect(f);
    this.osc('square', midi(note - 12), t, end).connect(f);
    f.connect(g).connect(this.mix);
    this.notes++;
  }

  arp(t, note, len, level, cutoff) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 5;
    f.frequency.setValueAtTime(cutoff * 1.3, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(300, cutoff * 0.3), t + len * 1.4);
    const end = this.env(g, t, 0.003, 0.07 * level, 0.01, len * 1.5);
    this.osc('square', midi(note), t, end, 4).connect(f);
    this.osc('sawtooth', midi(note), t, end, -6).connect(f);
    f.connect(g);
    g.connect(this.mix);
    g.connect(this.delaySend);
    this.notes++;
  }

  lead(t, note, len, level) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 3;
    f.frequency.value = 3200;
    const end = this.env(g, t, 0.02, 0.085 * level, len * 0.7, len * 0.6);
    const o = this.osc('sawtooth', midi(note), t, end);
    // slight delayed vibrato
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 5.5;
    lfoGain.gain.setValueAtTime(0, t);
    lfoGain.gain.linearRampToValueAtTime(14, t + Math.min(0.35, len));
    lfo.connect(lfoGain).connect(o.detune);
    lfo.start(t);
    lfo.stop(end);
    this.osc('square', midi(note + 12), t, end, 3).connect(f);
    o.connect(f);
    f.connect(g);
    g.connect(this.mix);
    g.connect(this.delaySend);
    g.connect(this.reverbSend);
    this.notes++;
  }

  kick(t, level) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    g.gain.setValueAtTime(0.9 * level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g).connect(this.mix);
    o.start(t);
    o.stop(t + 0.42);
    // click transient
    const cg = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    cg.gain.setValueAtTime(0.18 * level, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    this.noise(t, t + 0.03).connect(hp).connect(cg).connect(this.mix);
    this.notes++;
  }

  snare(t, level) {
    const ctx = this.ctx;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    // layered clap: three quick bursts then a tail
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 3; i++) {
      g.gain.setValueAtTime(0.32 * level, t + i * 0.011);
      g.gain.exponentialRampToValueAtTime(0.05 * level, t + i * 0.011 + 0.009);
    }
    g.gain.setValueAtTime(0.26 * level, t + 0.034);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    this.noise(t, t + 0.25).connect(bp).connect(g);
    g.connect(this.mix);
    g.connect(this.reverbSend);
    const tg = ctx.createGain();
    const end = this.env(tg, t, 0.002, 0.12 * level, 0, 0.08);
    this.osc('triangle', 190, t, end).connect(tg).connect(this.mix);
    this.notes++;
  }

  hat(t, level, open) {
    const ctx = this.ctx;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7600;
    const g = ctx.createGain();
    const len = open ? 0.18 : 0.035;
    g.gain.setValueAtTime(0.11 * level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    this.noise(t, t + len + 0.02).connect(hp).connect(g).connect(this.mix);
    this.notes++;
  }

  tom(t, freq, level) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.45 * level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g).connect(this.mix);
    o.start(t);
    o.stop(t + 0.26);
    this.notes++;
  }

  crash(t, level) {
    const ctx = this.ctx;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16 * level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    this.noise(t, t + 1.85).connect(hp).connect(g);
    g.connect(this.mix);
    g.connect(this.reverbSend);
    this.notes++;
  }

  /** Bright rising chord swell that opens the victory theme. */
  sting(t, notes) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const end = this.env(g, t, 0.05, 0.06, 0.6, 1.6);
    for (const n of notes) {
      const o = this.osc('sawtooth', midi(n + 12), t, end, 6);
      o.frequency.setValueAtTime(midi(n), t);
      o.frequency.exponentialRampToValueAtTime(midi(n + 12), t + 0.25);
      o.connect(g);
    }
    g.connect(this.mix);
    g.connect(this.reverbSend);
    g.connect(this.delaySend);
    this.notes++;
  }
}
