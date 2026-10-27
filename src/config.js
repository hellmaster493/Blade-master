// Gameplay tunables. All times are seconds, distances metres, speeds m/s.
import { DEG } from './core/mathutils.js';

export const ARENA = {
  radius: 26, // playable radius
  wallRadius: 27.5,
  cameraRadius: 31,
};

export const KAIRO = {
  name: 'KAIRO',
  title: 'THE CRIMSON TEMPEST',
  epithet: 'The Blade Master',
  role: 'High-speed melee fighter',
  difficulty: 'Advanced',
  weapon: 'Kurokaze — The Black Gale',

  maxHealth: 1000,
  radius: 0.42,
  height: 1.8,

  runSpeed: 9.2,
  lockSpeed: 7.4,
  backpedalMul: 0.82,
  groundAccel: 75,
  groundDecel: 60,
  airAccel: 24,
  turnSpeed: 18, // rad/s facing turn rate while moving

  gravity: 36,
  fallGravityMul: 1.6,
  jumpVelocity: 12.6,
  coyoteTime: 0.08,

  dash: {
    speed: 26,
    duration: 0.24,
    iframes: 0.22,
    perfectWindow: 0.16, // incoming hit inside this window after dash start = PERFECT DODGE
    cooldown: 0.85,
    perfectEnergy: 15,
    perfectSlowmo: 0.3,
  },

  ultimate: {
    max: 100,
    onDamageTaken: 0.012, // energy per point of damage taken
  },

  comboHitWindow: 2.6, // seconds before the hit counter resets
  comboChainGrace: 0.28, // after a combo attack ends, pressing attack continues the chain
  inputBuffer: 0.32,

  cooldowns: {
    crescent: 4,
    cyclone: 8,
    dash: 0.85,
  },
};

export const ABILITIES = {
  combo: { key: 'LMB', name: 'Blade Combo', desc: 'Quick Draw › Crosswind › Gale Breaker' },
  crescent: { key: 'Q', name: 'Crescent Slash', cooldown: KAIRO.cooldowns.crescent },
  cyclone: { key: 'E', name: 'Cyclone Cut', cooldown: KAIRO.cooldowns.cyclone },
  ultimate: { key: 'R', name: 'Crimson Tempest' },
  dash: { key: 'SHIFT', name: 'Gale Step', cooldown: KAIRO.cooldowns.dash },
};

// Damage numbers are summarised in the README; keep them in sync.
export const DAMAGE = {
  quickDraw: 45,
  crosswind: 60,
  galeBreaker: 110,
  crescent: 140,
  cycloneStrike: 48,
  cycloneBurst: 70,
  ultCut: 42,
  ultSever: 360,
  ultShockwave: 120,
};

export const LOCK_ON_RANGE = 32;
export const SOFT_TARGET = { range: 6, halfAngle: 70 * DEG };
