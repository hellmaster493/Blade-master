// GPU-instanced billboard particles with a fixed capacity (no per-frame allocation).
// Particles stretch along their screen-space velocity so sparks read as streaks.
import * as THREE from 'three';

const STRIDE = 24;
// field offsets
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, LIFE = 6, MAX = 7, S0 = 8, S1 = 9;
const R = 10, G = 11, B = 12, A0 = 13, DRAG = 14, GRAV = 15, STRETCH = 16, MODE = 17;
const CX = 18, CZ = 19, ANG = 20, RAD = 21, AV = 22, RV = 23;

const _c = new THREE.Color();

export class ParticlePool {
  constructor(scene, { capacity = 1500, blending = THREE.AdditiveBlending, renderOrder = 20 } = {}) {
    this.capacity = capacity;
    this.alive = 0;
    this.data = new Float32Array(capacity * STRIDE);

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iVel = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iSize = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.iPos);
    geo.setAttribute('iVel', this.iVel);
    geo.setAttribute('iCol', this.iCol);
    geo.setAttribute('iSize', this.iSize);
    geo.instanceCount = 0;
    this.geometry = geo;

    const additive = blending === THREE.AdditiveBlending;
    this.material = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec3 iPos;
        attribute vec3 iVel;
        attribute vec4 iCol;
        attribute vec2 iSize;
        varying vec4 vCol;
        varying vec2 vUv;
        void main() {
          vec4 mv = viewMatrix * vec4(iPos, 1.0);
          vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz;
          float len = length(vv.xy);
          vec2 axis = len > 1e-4 ? vv.xy / len : vec2(0.0, 1.0);
          vec2 perp = vec2(-axis.y, axis.x);
          float stretch = 1.0 + iSize.y * len;
          mv.xy += perp * position.x * iSize.x + axis * position.y * iSize.x * stretch;
          gl_Position = projectionMatrix * mv;
          vUv = position.xy;
          vCol = iCol;
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vCol;
        varying vec2 vUv;
        void main() {
          float r = length(vUv);
          float a = 1.0 - smoothstep(${additive ? '0.0' : '0.35'}, 1.0, r);
          ${additive ? 'a = a * a;' : ''}
          gl_FragColor = vec4(vCol.rgb, vCol.a * a);
        }`,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    scene.add(this.mesh);
  }

  /**
   * Spawns one particle. Returns false if the pool is full (oldest are never evicted,
   * which keeps the cost bounded).
   */
  spawn(p) {
    if (this.alive >= this.capacity) return false;
    const d = this.data;
    const o = this.alive * STRIDE;
    this.alive++;
    d[PX + o] = p.x; d[PY + o] = p.y; d[PZ + o] = p.z;
    d[VX + o] = p.vx || 0; d[VY + o] = p.vy || 0; d[VZ + o] = p.vz || 0;
    d[LIFE + o] = d[MAX + o] = p.life || 0.5;
    d[S0 + o] = p.size || 0.08;
    d[S1 + o] = p.sizeEnd !== undefined ? p.sizeEnd : (p.size || 0.08) * 0.3;
    _c.set(p.color !== undefined ? p.color : 0xffffff);
    d[R + o] = _c.r; d[G + o] = _c.g; d[B + o] = _c.b;
    d[A0 + o] = p.alpha !== undefined ? p.alpha : 1;
    d[DRAG + o] = p.drag || 0;
    d[GRAV + o] = p.gravity || 0;
    d[STRETCH + o] = p.stretch || 0;
    if (p.swirl) {
      const s = p.swirl;
      d[MODE + o] = 1;
      d[CX + o] = s.cx; d[CZ + o] = s.cz; d[ANG + o] = s.angle; d[RAD + o] = s.radius;
      d[AV + o] = s.angVel; d[RV + o] = s.radVel || 0;
      d[PX + o] = s.cx + Math.cos(s.angle) * s.radius;
      d[PZ + o] = s.cz + Math.sin(s.angle) * s.radius;
    } else {
      d[MODE + o] = 0;
    }
    return true;
  }

  update(dt) {
    const d = this.data;
    const pos = this.iPos.array;
    const vel = this.iVel.array;
    const col = this.iCol.array;
    const size = this.iSize.array;
    let i = 0;
    while (i < this.alive) {
      const o = i * STRIDE;
      d[LIFE + o] -= dt;
      if (d[LIFE + o] <= 0) {
        // swap-remove with the last alive particle
        this.alive--;
        if (i !== this.alive) d.copyWithin(o, this.alive * STRIDE, this.alive * STRIDE + STRIDE);
        continue;
      }
      let vx, vy, vz;
      if (d[MODE + o] === 1) {
        const prevX = d[PX + o];
        const prevZ = d[PZ + o];
        d[ANG + o] += d[AV + o] * dt;
        d[RAD + o] = Math.max(0, d[RAD + o] + d[RV + o] * dt);
        d[VY + o] -= d[GRAV + o] * dt;
        d[PX + o] = d[CX + o] + Math.cos(d[ANG + o]) * d[RAD + o];
        d[PZ + o] = d[CZ + o] + Math.sin(d[ANG + o]) * d[RAD + o];
        d[PY + o] += d[VY + o] * dt;
        const inv = dt > 0 ? 1 / dt : 0;
        vx = (d[PX + o] - prevX) * inv;
        vy = d[VY + o];
        vz = (d[PZ + o] - prevZ) * inv;
      } else {
        const drag = Math.exp(-d[DRAG + o] * dt);
        d[VX + o] *= drag;
        d[VY + o] = d[VY + o] * drag - d[GRAV + o] * dt;
        d[VZ + o] *= drag;
        d[PX + o] += d[VX + o] * dt;
        d[PY + o] += d[VY + o] * dt;
        d[PZ + o] += d[VZ + o] * dt;
        vx = d[VX + o]; vy = d[VY + o]; vz = d[VZ + o];
      }
      const k = d[LIFE + o] / d[MAX + o]; // 1 -> 0
      const i3 = i * 3;
      pos[i3] = d[PX + o]; pos[i3 + 1] = d[PY + o]; pos[i3 + 2] = d[PZ + o];
      const st = d[STRETCH + o];
      vel[i3] = vx * st; vel[i3 + 1] = vy * st; vel[i3 + 2] = vz * st;
      const i4 = i * 4;
      col[i4] = d[R + o]; col[i4 + 1] = d[G + o]; col[i4 + 2] = d[B + o];
      col[i4 + 3] = d[A0 + o] * Math.min(1, k * 1.6) * Math.min(1, (1 - k) * 12 + 0.25);
      const i2 = i * 2;
      size[i2] = d[S1 + o] + (d[S0 + o] - d[S1 + o]) * k;
      size[i2 + 1] = st > 0 ? 1 : 0;
      i++;
    }
    this.geometry.instanceCount = this.alive;
    if (this.alive > 0) {
      this.iPos.needsUpdate = true;
      this.iVel.needsUpdate = true;
      this.iCol.needsUpdate = true;
      this.iSize.needsUpdate = true;
    }
  }

  clear() {
    this.alive = 0;
    this.geometry.instanceCount = 0;
  }
}

/** Small tumbling rock chunks with ground bounce. */
export class DebrisPool {
  constructor(scene, material, capacity = 140) {
    this.capacity = capacity;
    this.alive = 0;
    const geo = new THREE.DodecahedronGeometry(1, 0);
    this.mesh = new THREE.InstancedMesh(geo, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < capacity; i++) {
      this.items.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0, max: 1, size: 0.1 });
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
  }

  spawn(x, y, z, vx, vy, vz, size, life) {
    if (this.alive >= this.capacity) return;
    const it = this.items[this.alive++];
    it.p.set(x, y, z);
    it.v.set(vx, vy, vz);
    it.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    it.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
    it.life = it.max = life;
    it.size = size;
  }

  update(dt) {
    let i = 0;
    while (i < this.alive) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        this.alive--;
        const last = this.items[this.alive];
        this.items[this.alive] = it;
        this.items[i] = last;
        continue;
      }
      it.v.y -= 22 * dt;
      it.p.addScaledVector(it.v, dt);
      if (it.p.y < it.size * 0.5) {
        it.p.y = it.size * 0.5;
        it.v.y = Math.abs(it.v.y) * 0.35;
        it.v.x *= 0.6;
        it.v.z *= 0.6;
        it.w.multiplyScalar(0.6);
      }
      it.r.x += it.w.x * dt;
      it.r.y += it.w.y * dt;
      it.r.z += it.w.z * dt;
      const k = Math.min(1, it.life / (it.max * 0.35));
      this._q.setFromEuler(it.r);
      this._s.setScalar(it.size * k);
      this._m.compose(it.p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
      i++;
    }
    this.mesh.count = this.alive;
    if (this.alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.alive = 0;
    this.mesh.count = 0;
  }
}
