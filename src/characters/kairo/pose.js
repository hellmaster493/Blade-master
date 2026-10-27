// Pose representation for Kairo's procedural animation.
//
// A pose is a flat Float32Array of named channels so poses can be blended cheaply.
// Body channels are joint rotations / offsets; the sword is described by a swing plane:
//   plane orientation = Ry(sYaw) * Rx(sPitch) * Rz(sTilt) applied to (forward, left)
//   blade direction   = cos(sPhi) * forward' + sin(sPhi) * left'   (positive phi sweeps to Kairo's left)
//   hand position     = pivot(sPx, sPy, sPz) + blade * sReach
//   cutting edge      = swing tangent rotated about the blade by sRoll (0 = edge leads towards +phi)
// Feet and the left hand are IK targets in model space; elbow/knee channels bias the bend.
import { getEase } from '../../core/mathutils.js';

export const FIELDS = [
  'hipsY', 'hipsX', 'hipsZ', 'hipsYaw', 'hipsPitch', 'hipsRoll',
  'spinePitch', 'spineYaw', 'spineRoll',
  'chestPitch', 'chestYaw', 'chestRoll',
  'headPitch', 'headYaw', 'headRoll',
  'fRx', 'fRy', 'fRz', 'fRpitch', 'fRyaw',
  'fLx', 'fLy', 'fLz', 'fLpitch', 'fLyaw',
  'kneeR', 'kneeL',
  'sTilt', 'sPitch', 'sYaw', 'sPhi', 'sReach', 'sRoll', 'sPx', 'sPy', 'sPz',
  'eRx', 'eRy', 'eRz',
  'hLx', 'hLy', 'hLz',
  'eLx', 'eLy', 'eLz',
  'spin',
];

export const F = {};
FIELDS.forEach((name, i) => (F[name] = i));
export const N = FIELDS.length;

const HALF_PI = Math.PI / 2;

/** Ready combat stance: right foot forward, Kurokaze low and forward with the edge down. */
export const STANCE = {
  hipsY: -0.07, hipsX: 0, hipsZ: 0, hipsYaw: -0.22, hipsPitch: 0.06, hipsRoll: 0,
  spinePitch: 0.1, spineYaw: 0.06, spineRoll: 0,
  chestPitch: 0.04, chestYaw: 0.1, chestRoll: 0,
  headPitch: -0.04, headYaw: 0, headRoll: 0,
  fRx: -0.12, fRy: 0.065, fRz: 0.17, fRpitch: 0, fRyaw: -0.12,
  fLx: 0.16, fLy: 0.065, fLz: -0.16, fLpitch: 0, fLyaw: 0.55,
  kneeR: 0.15, kneeL: 0.35,
  sTilt: -0.12, sPitch: 0.16, sYaw: 0, sPhi: -0.55, sReach: 0.4, sRoll: -HALF_PI - 0.35, sPx: -0.08, sPy: 1.16, sPz: 0.1,
  eRx: -0.8, eRy: -0.5, eRz: -0.5,
  hLx: 0.14, hLy: 1.18, hLz: 0.26,
  eLx: 0.8, eLy: -0.5, eLz: -0.4,
  spin: 0,
};

export function createPose(values = STANCE) {
  const p = new Float32Array(N);
  for (const k in values) {
    if (F[k] === undefined) throw new Error('Unknown pose channel ' + k);
    p[F[k]] = values[k];
  }
  return p;
}

export function setPose(p, partial) {
  for (const k in partial) {
    const i = F[k];
    if (i === undefined) throw new Error('Unknown pose channel ' + k);
    p[i] = partial[k];
  }
  return p;
}

export function lerpPose(out, a, b, t) {
  for (let i = 0; i < N; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

/**
 * Builds keyframes from partial poses. Each key inherits the previous key's channels,
 * so moves only describe what changes. `ease` shapes the segment arriving at that key.
 * @param base starting full pose values (object)
 * @param list [{ t, ease, ...channels }]
 */
export function buildKeys(base, list) {
  const keys = [];
  let prev = createPose(base);
  for (const item of list) {
    const { t, ease, ...channels } = item;
    const pose = new Float32Array(prev);
    setPose(pose, channels);
    keys.push({ t, ease: getEase(ease || 'inOutQuad'), pose });
    prev = pose;
  }
  return keys;
}

/** Samples keyframes at time t into `out`. */
export function sampleKeys(keys, t, out) {
  if (t <= keys[0].t) {
    out.set(keys[0].pose);
    return out;
  }
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t <= k.t) {
      const a = keys[i - 1];
      const u = (t - a.t) / Math.max(1e-6, k.t - a.t);
      return lerpPose(out, a.pose, k.pose, k.ease(u));
    }
  }
  out.set(keys[keys.length - 1].pose);
  return out;
}
