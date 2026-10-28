// Gameplay tunables. All times are seconds, distances metres, speeds m/s.
import { DEG } from './core/mathutils.js';

export const ARENA = {
  radius: 44, // playable radius (about 88 m across)
  wallRadius: 45.5,
  cameraRadius: 49,
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
  gear: { key: 'G', name: 'Awaken Gear' },
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

// Kurokaze's sealed Gears. Awaken the next gear with G (touch: GEAR) once the gauge holds
// enough; the gauge drains while awakened and Kairo drops back to Gear 1 when it empties.
// Every Gear up is stronger than the last, and its aura grows to match.
export const GEAR_GAUGE = {
  max: 300, // three segments of 100
  perHit: 4,
  perPerfectDodge: 30,
  perKill: 12,
  awakenTime: 0.8, // power-up burst; Kairo is invulnerable during it
  surgeTime: 1.0, // no drain for this long after a burst, so Gears can be chained
  fullGrace: 1.5, // a full gauge still counts as full this long after the drain starts
};

export const GEARS = [
  null,
  {
    id: 1, name: 'BASE', speedMul: 1, attackSpeed: 1, damageMul: 1, dashCdMul: 1, energyMul: 1,
    armor: 0, superArmor: false, drain: 0, glow: 0.15, cost: 0,
  },
  {
    id: 2, name: 'GALE DRIVE', speedMul: 1.25, attackSpeed: 1.22, damageMul: 1.15, dashCdMul: 0.5, energyMul: 1.15,
    armor: 0, superArmor: false, drain: 9, glow: 0.55, cost: 100,
    burst: { radius: 4.5, damage: 30, knockback: 10 },
  },
  {
    id: 3, name: 'CRIMSON OVERDRIVE', speedMul: 1.35, attackSpeed: 1.35, damageMul: 1.5, dashCdMul: 0.5, energyMul: 1.5,
    armor: 0.25, superArmor: true, drain: 15, glow: 1.1, cost: 200,
    burst: { radius: 5.5, damage: 45, knockback: 13 },
    echo: { grow: 5.5, damage: 0.5, halfAngle: 0.75 }, // crimson wave on every combo swing
  },
  {
    id: 4, name: 'TEMPEST UNBOUND', speedMul: 1.45, attackSpeed: 1.5, damageMul: 2, dashCdMul: 0.35, energyMul: 2,
    armor: 0.45, superArmor: true, drain: 20, glow: 1.6, cost: 300,
    burst: { radius: 7, damage: 70, knockback: 16 },
    echo: { grow: 7.5, damage: 0.75, halfAngle: 0.95 },
    auraBurn: { radius: 2.6, damage: 12, interval: 0.45 }, // the aura itself scorches anything close
  },
];

export const MAX_GEAR = GEARS.length - 1;
