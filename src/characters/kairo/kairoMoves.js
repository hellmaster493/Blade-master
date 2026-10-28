// Move data for Kairo. Every attack has explicit wind-up / active / recovery timing:
//   wind-up  = [0, hit.t0)        active = [hit.t0, hit.t1]        recovery = (hit.t1, duration]
// `cancel` is when a buffered follow-up may start, `dashCancel` when a dash may interrupt.
// Swing planes in the keys match the arc FX and hit sectors so visuals follow the real cut.
import { STANCE, buildKeys } from './pose.js';
import { DAMAGE } from '../../config.js';

const PI = Math.PI;
const HALF = PI / 2;

// Channels that reset to the stance at the end of a move.
const REST = { ...STANCE };

// ---------------------------------------------------------------------------
// BASIC COMBO

export const QUICK_DRAW = {
  id: 'quickDraw',
  name: 'Quick Draw',
  type: 'combo',
  comboIndex: 0,
  duration: 0.42,
  cancel: 0.22,
  dashCancel: 0.17,
  keys: buildKeys(STANCE, [
    { t: 0 },
    {
      t: 0.07, ease: 'outQuad',
      sPhi: -1.95, sTilt: 0.08, sPitch: 0.08, sRoll: -0.35, sReach: 0.4, sPx: -0.04, sPy: 1.3, sPz: 0.05,
      chestYaw: -0.45, spineYaw: -0.15, hipsYaw: -0.4, hipsY: -0.1,
      eRx: -0.9, eRy: -0.2, eRz: -0.6, hLx: 0.25, hLy: 1.2, hLz: 0.2,
    },
    {
      t: 0.16, ease: 'slash',
      sPhi: 1.45, sRoll: 0, sReach: 0.46, chestYaw: 0.55, spineYaw: 0.15, hipsYaw: 0.15,
      eRx: -0.5, eRy: -0.6, eRz: 0.3, hLx: 0.3, hLy: 1.1, hLz: -0.1, fRz: 0.28,
    },
    { t: 0.24, ease: 'outQuad', sPhi: 1.75, sPitch: 0.25, chestYaw: 0.65 },
    { t: 0.42, ease: 'inOutQuad', ...REST },
  ]),
  hits: [
    { t0: 0.075, t1: 0.16, range: 2.7, halfAngle: 1.2, damage: DAMAGE.quickDraw, knockback: 2.5, stagger: 0.22, hitstop: 0.035, shake: 0.12, energy: 3, kind: 'light' },
  ],
  lunges: [{ t0: 0.02, t1: 0.15, dist: 0.65 }],
  trails: [{ t0: 0.05, t1: 0.2, style: 'narrow' }],
  glow: 0.25,
  fx: [
    { t: 0.06, type: 'sfx', name: 'swing', power: 0.3 },
    { t: 0.07, type: 'arc', tilt: 0.08, pitch: 0.08, phi0: -1.8, phi1: 1.5, radius: 1.55, thickness: 0.3, life: 0.2, sweep: 0.4, opacity: 0.55 },
  ],
};

export const CROSSWIND = {
  id: 'crosswind',
  name: 'Crosswind',
  type: 'combo',
  comboIndex: 1,
  duration: 0.5,
  cancel: 0.27,
  dashCancel: 0.21,
  keys: buildKeys(STANCE, [
    { t: 0 },
    {
      t: 0.09, ease: 'outQuad',
      sTilt: 0.75, sPitch: 0.12, sPhi: 2.15, sRoll: -PI, sReach: 0.42, sPx: 0.0, sPy: 1.35, sPz: 0.05,
      chestYaw: 0.5, spineYaw: 0.15, hipsYaw: 0.1, hipsY: -0.08, spineRoll: 0.1,
      eRx: -0.3, eRy: 0.4, eRz: -0.7, hLx: 0.05, hLy: 1.15, hLz: 0.28,
      fLx: 0.14, fLz: 0.2, fLyaw: 0.15, fRx: -0.16, fRz: -0.12, fRyaw: -0.5,
    },
    {
      t: 0.19, ease: 'slash',
      sPhi: -1.6, chestYaw: -0.6, spineYaw: -0.2, hipsYaw: -0.35, spineRoll: -0.12, spinePitch: 0.22,
      eRx: -0.9, eRy: -0.6, eRz: -0.3, hLx: 0.3, hLy: 1.25, hLz: 0.0,
    },
    { t: 0.27, ease: 'outQuad', sPhi: -1.95, sPitch: 0.25 },
    { t: 0.5, ease: 'inOutQuad', ...REST },
  ]),
  hits: [
    { t0: 0.095, t1: 0.19, range: 2.9, halfAngle: 1.2, damage: DAMAGE.crosswind, knockback: 3.5, stagger: 0.3, hitstop: 0.05, shake: 0.2, energy: 4, kind: 'medium' },
  ],
  lunges: [{ t0: 0.03, t1: 0.17, dist: 0.85 }],
  trails: [{ t0: 0.07, t1: 0.25, style: 'long' }],
  glow: 0.35,
  fx: [
    { t: 0.08, type: 'sfx', name: 'swing', power: 0.5 },
    { t: 0.09, type: 'arc', tilt: 0.75, pitch: 0.12, phi0: 2.0, phi1: -1.5, radius: 1.65, thickness: 0.45, life: 0.26, sweep: 0.38, opacity: 0.75, accent: 0.25 },
  ],
};

export const GALE_BREAKER = {
  id: 'galeBreaker',
  name: 'Gale Breaker',
  type: 'combo',
  comboIndex: 2,
  duration: 0.72,
  cancel: 0.46,
  dashCancel: 0.36,
  keys: buildKeys(STANCE, [
    { t: 0 },
    {
      t: 0.17, ease: 'outCubic',
      sTilt: -0.12, sPitch: 0.05, sPhi: -2.45, sRoll: -0.25, sReach: 0.44, sPx: -0.05, sPy: 1.15, sPz: 0.0,
      chestYaw: -0.85, spineYaw: -0.3, hipsYaw: -0.5, hipsY: -0.24, spinePitch: 0.2,
      fRx: -0.18, fRz: 0.32, fLx: 0.2, fLz: -0.3, kneeR: 0.3, kneeL: 0.4,
      hLx: 0.35, hLy: 1.25, hLz: 0.25, eRx: -0.8, eRy: 0.0, eRz: -0.7,
    },
    {
      t: 0.3, ease: 'slash',
      sPhi: 2.3, sTilt: 0.18, sRoll: 0, chestYaw: 0.9, spineYaw: 0.3, hipsYaw: 0.45, hipsY: -0.2, spinePitch: 0.14,
      hLx: 0.25, hLy: 1.05, hLz: -0.25, eRx: -0.4, eRy: -0.7, eRz: 0.4,
    },
    { t: 0.42, ease: 'outQuad', sPhi: 2.55, sPitch: 0.3, hipsY: -0.14 },
    { t: 0.72, ease: 'inOutQuad', ...REST },
  ]),
  hits: [
    {
      t0: 0.175, t1: 0.3, range: 3.3, halfAngle: 1.45, damage: DAMAGE.galeBreaker, knockback: 9, lift: 3.5, stagger: 0.55,
      hitstop: 0.09, shake: 0.42, energy: 6, kind: 'heavy', crimson: true, burst: true,
    },
  ],
  lunges: [{ t0: 0.08, t1: 0.27, dist: 1.3 }],
  trails: [{ t0: 0.13, t1: 0.36, style: 'heavy' }],
  glow: 0.8,
  fx: [
    { t: 0.12, type: 'sfx', name: 'swing', power: 1 },
    { t: 0.17, type: 'arc', tilt: 0.03, pitch: 0.05, phi0: -2.4, phi1: 2.3, radius: 2.2, thickness: 0.75, life: 0.34, sweep: 0.35, accent: 1 },
    { t: 0.19, type: 'arc', tilt: 0.03, pitch: 0.05, phi0: -2.2, phi1: 2.2, radius: 2.55, thickness: 0.16, life: 0.3, sweep: 0.4, body: 0xff2a48, core: 0xffc8d0, opacity: 0.8 },
  ],
};

export const COMBO = [QUICK_DRAW, CROSSWIND, GALE_BREAKER];

// ---------------------------------------------------------------------------
// SPECIAL ONE — CRESCENT SLASH (Q)

export const CRESCENT_SLASH = {
  id: 'crescent',
  name: 'Crescent Slash',
  type: 'ability',
  duration: 0.66,
  cancel: 0.48,
  dashCancel: 0.4,
  keys: buildKeys(STANCE, [
    { t: 0 },
    {
      t: 0.12, ease: 'outCubic',
      sTilt: 0.22, sPitch: 0.02, sPhi: -2.3, sRoll: -0.2, sReach: 0.44, sPy: 1.25,
      chestYaw: -0.9, spineYaw: -0.3, hipsYaw: -0.55, hipsY: -0.2, spinePitch: 0.25,
      fRz: 0.35, fRx: -0.16, fLz: -0.32, fLx: 0.2,
      hLx: 0.3, hLy: 1.3, hLz: 0.3, eRx: -0.8, eRy: 0, eRz: -0.7,
    },
    {
      t: 0.25, ease: 'slash',
      sPhi: 2.15, sRoll: 0, chestYaw: 0.85, spineYaw: 0.3, hipsYaw: 0.4, hipsY: -0.22,
      hLx: 0.35, hLy: 1.15, hLz: -0.3, eRx: -0.3, eRy: -0.7, eRz: 0.4, fRz: 0.45,
    },
    { t: 0.38, ease: 'outQuad', sPhi: 2.4, sPitch: 0.35, hipsY: -0.16 },
    { t: 0.66, ease: 'inOutQuad', ...REST },
  ]),
  hits: [
    {
      t0: 0.13, t1: 0.34, range: 6.8, halfAngle: 1.3, damage: DAMAGE.crescent, knockback: 5, stagger: 0.4,
      hitstop: 0.06, shake: 0.3, energy: 5, kind: 'heavy', crimson: true,
      wave: { t0: 0.13, t1: 0.3, r0: 1.4, r1: 6.8 },
    },
  ],
  lunges: [{ t0: 0.05, t1: 0.22, dist: 2.4 }],
  trails: [{ t0: 0.1, t1: 0.34, style: 'crescent' }],
  glow: 1,
  fx: [
    { t: 0.0, type: 'sfx', name: 'ability' },
    { t: 0.13, type: 'arc', tilt: 0.22, pitch: 0.02, phi0: -2.2, phi1: 2.1, radius: 2.3, thickness: 0.7, life: 0.34, sweep: 0.3, accent: 0.8 },
    // travelling crescent wave that defines the hit reach
    { t: 0.14, type: 'arc', tilt: 0.0, pitch: 0.0, phi0: -1.25, phi1: 1.25, radius: 1.5, grow: 3.4, thickness: 0.55, life: 0.42, sweep: 0.12, accent: 1, opacity: 0.95, wave: true },
    { t: 0.14, type: 'wind', count: 26 },
  ],
};

// ---------------------------------------------------------------------------
// SPECIAL TWO — CYCLONE CUT (E)

const SPIN_START = 0.12;
const SPIN_END = 0.72;
const spinKeys = [];
for (let i = 1; i <= 4; i++) {
  const t = SPIN_START + ((SPIN_END - SPIN_START) * i) / 4;
  spinKeys.push({ t, ease: i === 1 ? 'inQuad' : 'linear', spin: i * PI, sTilt: i % 2 ? 0.14 : -0.1, sPhi: i % 2 ? -1.35 : -1.55, chestYaw: -0.25 });
}

export const CYCLONE_CUT = {
  id: 'cyclone',
  name: 'Cyclone Cut',
  type: 'ability',
  duration: 1.02,
  cancel: 0.88,
  dashCancel: 0.82,
  moveControl: { t0: 0.12, t1: 0.75, speed: 3.2 },
  keys: buildKeys(STANCE, [
    { t: 0 },
    {
      t: SPIN_START, ease: 'outCubic',
      sTilt: 0.0, sPitch: 0.12, sPhi: -1.75, sRoll: 0, sReach: 0.46, sPx: -0.05, sPy: 1.15, sPz: 0.0,
      chestYaw: -0.7, spineYaw: -0.25, hipsYaw: -0.3, hipsY: -0.26, spinePitch: 0.22,
      fRx: -0.24, fRz: 0.18, fLx: 0.24, fLz: -0.18, kneeR: 0.5, kneeL: 0.5, fRyaw: -0.4, fLyaw: 0.4,
      hLx: 0.4, hLy: 1.2, hLz: -0.05, eRx: -0.8, eRy: -0.1, eRz: -0.5, spin: 0,
    },
    ...spinKeys,
    { t: 0.8, ease: 'outCubic', spin: 4 * PI + 0.5, sPhi: -1.1, sTilt: 0, sPitch: 0.2, chestYaw: 0.35, hipsY: -0.2 },
    { t: 1.02, ease: 'inOutQuad', ...REST, spin: 4 * PI },
  ]),
  hits: [
    { t0: 0.13, t1: 0.32, range: 3.3, halfAngle: PI, damage: DAMAGE.cycloneStrike, knockback: 1.6, stagger: 0.25, hitstop: 0.025, shake: 0.12, energy: 3, kind: 'light' },
    { t0: 0.33, t1: 0.52, range: 3.3, halfAngle: PI, damage: DAMAGE.cycloneStrike, knockback: 1.6, stagger: 0.25, hitstop: 0.025, shake: 0.12, energy: 3, kind: 'light' },
    { t0: 0.53, t1: 0.72, range: 3.3, halfAngle: PI, damage: DAMAGE.cycloneStrike, knockback: 1.6, stagger: 0.25, hitstop: 0.025, shake: 0.12, energy: 3, kind: 'light' },
    {
      t0: 0.73, t1: 0.8, range: 4.6, halfAngle: PI, damage: DAMAGE.cycloneBurst, knockback: 8, lift: 2.5, stagger: 0.5,
      hitstop: 0.07, shake: 0.45, energy: 5, kind: 'heavy', crimson: true, burst: true,
    },
  ],
  trails: [{ t0: 0.1, t1: 0.8, style: 'cyclone' }],
  glow: 1,
  fx: [
    { t: 0.0, type: 'sfx', name: 'cyclone' },
    { t: 0.13, type: 'spinArc' },
    { t: 0.28, type: 'spinArc' },
    { t: 0.43, type: 'spinArc' },
    { t: 0.58, type: 'spinArc' },
    { t: 0.12, t1: 0.74, type: 'swirl' },
    { t: 0.72, type: 'cycloneBurst' },
  ],
};

// ---------------------------------------------------------------------------
// REACTIONS

export const HURT = {
  id: 'hurt',
  duration: 0.4,
  keys: buildKeys(STANCE, [
    { t: 0 },
    {
      t: 0.07, ease: 'outCubic',
      spinePitch: -0.3, chestPitch: -0.18, headPitch: -0.35, hipsY: -0.13, hipsZ: -0.06,
      sPhi: -0.9, sPitch: 0.75, sRoll: -HALF, hLx: 0.38, hLy: 1.05, hLz: 0.0,
    },
    { t: 0.4, ease: 'inOutQuad', ...REST },
  ]),
};

export const DEFEAT = {
  id: 'defeat',
  duration: 1.4,
  keys: buildKeys(STANCE, [
    { t: 0 },
    { t: 0.22, ease: 'outCubic', spinePitch: -0.35, chestPitch: -0.2, headPitch: -0.4, hipsY: -0.12, sPhi: -0.7, sPitch: 0.9 },
    {
      t: 0.85, ease: 'inOutCubic',
      hipsY: -0.47, hipsPitch: 0.08, hipsYaw: -0.1, spinePitch: 0.45, chestPitch: 0.2, spineYaw: 0, chestYaw: 0, headPitch: 0.5,
      fRx: -0.13, fRy: 0.065, fRz: 0.3, fRpitch: 0, fRyaw: -0.1,
      fLx: 0.13, fLy: 0.11, fLz: -0.42, fLpitch: 1.25, fLyaw: 0.1, kneeR: 0.2, kneeL: 0.05,
      sTilt: 0, sPitch: 1.35, sPhi: 0, sReach: 0.3, sPx: -0.14, sPy: 0.92, sPz: 0.32, sRoll: 0,
      hLx: 0.12, hLy: 0.66, hLz: 0.22, eLx: 0.6, eLy: -0.2, eLz: -0.6,
    },
    { t: 1.4, ease: 'linear', headPitch: 0.55 },
  ]),
};

export const DASH_POSES = {
  forward: { spinePitch: 0.55, chestPitch: 0.1, hipsY: -0.16, fRz: 0.38, fRy: 0.18, fLz: -0.45, fLy: 0.25, fLpitch: 0.6, sPhi: -2.5, sPitch: 0.55, sReach: 0.3, sPy: 1.15, sPx: -0.16, sPz: -0.1, hLx: 0.28, hLy: 1.0, hLz: -0.2, headPitch: -0.3 },
  back: { spinePitch: -0.18, hipsY: -0.18, fRz: -0.1, fLz: -0.4, fLy: 0.2, sPhi: -0.4, sPitch: 0.3 },
  left: { spineRoll: -0.35, hipsY: -0.2, fLx: 0.45, fLy: 0.2, fRx: -0.25, fRz: 0.05 },
  right: { spineRoll: 0.35, hipsY: -0.2, fRx: -0.45, fRy: 0.2, fLx: 0.25, fLz: -0.05 },
};

// Gear awakening: gather energy low, then burst upright with the blade flung out.
export const AWAKEN = {
  id: 'awaken',
  duration: 0.8,
  burstAt: 0.38,
  keys: buildKeys(STANCE, [
    { t: 0 },
    {
      t: 0.3, ease: 'outCubic',
      hipsY: -0.3, spinePitch: 0.5, chestPitch: 0.15, headPitch: 0.35, chestYaw: 0, spineYaw: 0, hipsYaw: -0.1,
      sTilt: 0, sPitch: 0.95, sPhi: -0.45, sReach: 0.32, sRoll: -HALF, sPy: 1.0, sPx: -0.12, sPz: 0.12,
      hLx: 0.12, hLy: 1.05, hLz: 0.22, fRx: -0.2, fRz: 0.12, fLx: 0.22, fLz: -0.12, kneeR: 0.4, kneeL: 0.4,
    },
    {
      t: 0.42, ease: 'outExpo',
      hipsY: -0.02, spinePitch: -0.28, chestPitch: -0.18, headPitch: -0.3,
      sTilt: 0.35, sPitch: -0.2, sPhi: -1.5, sReach: 0.5, sPy: 1.45, sPx: -0.08, sPz: 0.05,
      hLx: 0.62, hLy: 1.5, hLz: 0.05, eLx: 0.9, eLy: 0.2, eLz: -0.3,
    },
    { t: 0.6, ease: 'linear', spinePitch: -0.22, headPitch: -0.25 },
    { t: 0.8, ease: 'inOutQuad', ...REST },
  ]),
};
