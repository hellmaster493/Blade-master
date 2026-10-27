// Procedural rig helpers: analytic two-bone IK and damped springs for secondary motion.
// Bones point down their joint's local -Y axis; local +Z faces the bend direction.
import * as THREE from 'three';

const _A = new THREE.Vector3();
const _T = new THREE.Vector3();
const _u = new THREE.Vector3();
const _b = new THREE.Vector3();
const _E = new THREE.Vector3();
const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _qParent = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _tmp = new THREE.Vector3();

function basisQuat(x, y, z, out) {
  _m.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_m);
}

/**
 * Solves a two-bone chain (upper -> lower) so the end reaches `target` (world),
 * bending towards `pole` (world point). Writes local quaternions on upper and lower,
 * and returns the lower bone's world quaternion in `outLowerWorldQ` (optional).
 */
export function solveTwoBone(upper, lower, target, pole, l1, l2, outLowerWorldQ = null) {
  const parent = upper.parent;
  parent.updateWorldMatrix(true, false);
  _A.copy(upper.position).applyMatrix4(parent.matrixWorld);
  parent.getWorldQuaternion(_qParent);

  _T.copy(target);
  _u.subVectors(_T, _A);
  let d = _u.length();
  if (d < 1e-5) {
    _u.set(0, -1, 0);
    d = 1e-5;
  } else {
    _u.divideScalar(d);
  }
  const maxReach = (l1 + l2) * 0.9995;
  const minReach = Math.abs(l1 - l2) + 0.02;
  d = Math.min(Math.max(d, minReach), maxReach);

  // bend direction: pole component perpendicular to the chain axis
  _b.subVectors(pole, _A);
  _b.addScaledVector(_u, -_b.dot(_u));
  if (_b.lengthSq() < 1e-8) {
    _b.set(0, 0, 1).addScaledVector(_u, -_u.z);
    if (_b.lengthSq() < 1e-8) _b.set(1, 0, 0);
  }
  _b.normalize();

  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _E.copy(_A).addScaledVector(_u, l1 * cosA).addScaledVector(_b, l1 * sinA);
  _T.copy(_A).addScaledVector(_u, d);

  _d1.subVectors(_E, _A).normalize();
  _d2.subVectors(_T, _E).normalize();

  // shared bend-plane normal keeps twist consistent along the chain
  _n.crossVectors(_b, _u);
  if (_n.lengthSq() < 1e-8) _n.set(1, 0, 0);
  _n.normalize();

  // upper world orientation: -Y along bone, X = plane normal
  _y.copy(_d1).negate();
  _x.copy(_n).addScaledVector(_y, -_n.dot(_y)).normalize();
  _z.crossVectors(_x, _y);
  basisQuat(_x, _y, _z, _q1);

  _y.copy(_d2).negate();
  _x.copy(_n).addScaledVector(_y, -_n.dot(_y)).normalize();
  _z.crossVectors(_x, _y);
  basisQuat(_x, _y, _z, _q2);

  upper.quaternion.copy(_qParent).invert().multiply(_q1);
  lower.quaternion.copy(_q1).invert().multiply(_q2);
  if (outLowerWorldQ) outLowerWorldQ.copy(_q2);
  return _q2;
}

/** Sets a child's local quaternion so that its world orientation equals `worldQ`. */
export function setWorldQuaternion(obj, worldQ, parentWorldQ) {
  obj.quaternion.copy(parentWorldQ).invert().multiply(worldQ);
}

/** Builds a world quaternion whose local +Y = yDir and +Z = zDir (zDir is orthogonalised). */
export function quatFromYZ(yDir, zDir, out) {
  _y.copy(yDir).normalize();
  _z.copy(zDir).addScaledVector(_y, -zDir.dot(_y));
  if (_z.lengthSq() < 1e-8) {
    _tmp.set(0, 0, 1);
    if (Math.abs(_y.z) > 0.9) _tmp.set(1, 0, 0);
    _z.copy(_tmp).addScaledVector(_y, -_tmp.dot(_y));
  }
  _z.normalize();
  _x.crossVectors(_y, _z);
  return basisQuat(_x, _y, _z, out);
}

/** Critically-damped-ish spring on a scalar, sub-stepped for stability at low frame rates. */
export class Spring {
  constructor(stiffness = 90, damping = 10, value = 0) {
    this.k = stiffness;
    this.c = damping;
    this.x = value;
    this.v = 0;
  }

  update(target, dt) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = this.k * (target - this.x) - this.c * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }

  reset(value = 0) {
    this.x = value;
    this.v = 0;
  }
}
