// The Rift Arena: a floating stone platform under a torn night sky.
// Provides lighting, boundaries (radius clamp + pillar colliders) and a dimming hook for cinematics.
import * as THREE from 'three';
import { ARENA } from '../config.js';
import { toon, glowTexture } from './materials.js';

function groundTexture() {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2b36';
  g.fillRect(0, 0, size, size);
  const cx = size / 2;
  // concentric tile rings with radial seams
  const rings = 14;
  for (let r = 0; r < rings; r++) {
    const r0 = (r / rings) * cx;
    const r1 = ((r + 1) / rings) * cx;
    const segs = 6 + r * 6;
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2 + r * 0.3;
      const a1 = ((s + 1) / segs) * Math.PI * 2 + r * 0.3;
      const shade = 38 + Math.floor(Math.random() * 18);
      g.fillStyle = `rgb(${shade},${shade + 1},${shade + 10})`;
      g.beginPath();
      g.arc(cx, cx, r1 - 1.5, a0 + 0.004, a1 - 0.004);
      g.arc(cx, cx, r0 + 1.5, a1 - 0.004, a0 + 0.004, true);
      g.closePath();
      g.fill();
    }
  }
  // grime + cracks
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    g.fillRect(x, y, 2 + Math.random() * 6, 2 + Math.random() * 6);
  }
  g.strokeStyle = 'rgba(10,8,16,0.55)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    let x = Math.random() * size;
    let y = Math.random() * size;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function sigilTexture() {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.translate(size / 2, size / 2);
  const ring = (r, w, color, dash) => {
    g.strokeStyle = color;
    g.lineWidth = w;
    g.setLineDash(dash || []);
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  };
  ring(500, 6, 'rgba(255,60,90,0.9)');
  ring(470, 3, 'rgba(110,190,255,0.8)', [30, 14]);
  ring(330, 4, 'rgba(255,60,90,0.7)');
  ring(180, 3, 'rgba(110,190,255,0.7)', [10, 10]);
  // three wind slashes echoing Kairo's emblem
  g.setLineDash([]);
  for (let i = 0; i < 3; i++) {
    g.save();
    g.rotate((i * Math.PI * 2) / 3);
    g.strokeStyle = 'rgba(255,70,100,0.75)';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(-90, -340);
    g.quadraticCurveTo(160, -260, 300, -60);
    g.stroke();
    g.restore();
  }
  for (let i = 0; i < 24; i++) {
    g.save();
    g.rotate((i / 24) * Math.PI * 2);
    g.fillStyle = 'rgba(110,190,255,0.8)';
    g.fillRect(-4, -440, 8, 40);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;

const SKY_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uDim;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -1.0, 1.0);
    vec3 horizon = vec3(0.16, 0.1, 0.24);
    vec3 zenith = vec3(0.015, 0.02, 0.06);
    vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.55));
    col = mix(col, vec3(0.03, 0.02, 0.05), smoothstep(0.0, -0.3, h));
    // stars
    vec3 sp = floor(d * 260.0);
    float s = hash(sp);
    float twinkle = 0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0);
    col += vec3(0.8, 0.85, 1.0) * step(0.9975, s) * smoothstep(0.05, 0.4, h) * twinkle;
    // the rift: a glowing tear across the sky
    vec3 rc = normalize(vec3(0.35, 0.55, -0.75));
    vec3 ax = normalize(cross(rc, vec3(0.2, 1.0, 0.1)));
    vec3 ay = normalize(cross(ax, rc));
    float u = dot(d, ax);
    float v = dot(d, ay);
    float facing = dot(d, rc);
    float wobble = sin(u * 18.0 + uTime * 0.6) * 0.012 + sin(u * 41.0 - uTime) * 0.006;
    float len = smoothstep(0.75, 0.0, abs(u));
    float width = 0.018 + 0.05 * len;
    float core = smoothstep(width, 0.0, abs(v - wobble)) * len * step(0.0, facing);
    float glow = smoothstep(width * 7.0, 0.0, abs(v - wobble)) * len * step(0.0, facing);
    col += vec3(1.0, 0.2, 0.42) * glow * 0.55 + vec3(1.0, 0.85, 0.95) * core * 1.4;
    col += vec3(0.45, 0.1, 0.6) * smoothstep(0.6, 0.0, length(vec2(u, v * 2.0))) * 0.35 * step(0.0, facing);
    gl_FragColor = vec4(col * uDim, 1.0);
  }`;

const BARRIER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uDim;
  varying vec2 vUv;
  void main() {
    float rise = smoothstep(1.0, 0.0, vUv.y);
    float bands = 0.5 + 0.5 * sin(vUv.x * 380.0 + uTime * 1.5) * sin(vUv.y * 12.0 - uTime * 2.0);
    float a = rise * (0.12 + 0.18 * bands);
    vec3 col = mix(vec3(0.55, 0.2, 1.0), vec3(1.0, 0.25, 0.45), vUv.y);
    gl_FragColor = vec4(col * uDim, a * uDim);
  }`;

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'RiftArena';
    scene.add(this.group);
    this.colliders = [];
    this.dim = 1;
    this.time = 0;
    this.flames = [];
    this.buildLights();
    this.buildSky();
    this.buildPlatform();
    this.buildPillars();
    this.buildBarrier();
    this.buildBackdrop();
  }

  buildLights() {
    const s = this.scene;
    s.fog = new THREE.FogExp2(0x120f22, 0.011);
    this.hemi = new THREE.HemisphereLight(0x8da0e6, 0x2b1d36, 1.25);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xd6e0ff, 2.4);
    this.sun.position.set(-18, 34, 16);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 30;
    sc.bottom = -30;
    sc.near = 1;
    sc.far = 90;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    s.add(this.sun);
    s.add(this.sun.target);
    this.riftLight = new THREE.DirectionalLight(0xff4f8a, 0.7);
    this.riftLight.position.set(12, 18, -24);
    s.add(this.riftLight);
    this.base = { hemi: this.hemi.intensity, sun: this.sun.intensity, rift: this.riftLight.intensity };
  }

  buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDim: { value: 1 } },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), this.skyMat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.group.add(sky);
  }

  buildPlatform() {
    const R = ARENA.wallRadius + 1.5;
    const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.92, metalness: 0.05 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(R, 96), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.group.add(ground);
    // platform rim + cliff
    const cliffMat = toon(0x24222f);
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.55, 9, 64, 3, true), cliffMat);
    cliff.position.y = -4.5;
    this.group.add(cliff);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.25, 6, 96), toon(0x3a3747));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.02;
    this.group.add(rim);
    // glowing sigil at the centre
    this.sigilMat = new THREE.MeshBasicMaterial({ map: sigilTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 });
    const sigil = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), this.sigilMat);
    sigil.rotation.x = -Math.PI / 2;
    sigil.position.y = 0.025;
    sigil.renderOrder = 2;
    this.sigil = sigil;
    this.group.add(sigil);
  }

  buildPillars() {
    const stone = toon(0x4a4758);
    const stoneDark = toon(0x2f2d3b);
    const glow = new THREE.MeshBasicMaterial({ color: 0xff3c6a });
    const count = 6;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.26;
      const r = 23.5;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      const h = 4 + (i % 3) * 1.6;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.6, 8), stoneDark);
      base.position.y = 0.3;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.95, h, 8), stone);
      shaft.position.y = 0.6 + h / 2;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.75, 0.5, 8, 1), stoneDark);
      cap.position.y = 0.6 + h + 0.1;
      cap.rotation.z = (i % 2 ? 1 : -1) * 0.15;
      const rune = new THREE.Mesh(new THREE.BoxGeometry(0.12, h * 0.5, 0.05), glow);
      rune.position.set(0, 0.6 + h * 0.45, 0.84);
      for (const m of [base, shaft, cap]) {
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
      }
      g.add(rune);
      g.lookAt(0, 0, 0);
      this.group.add(g);
      this.colliders.push({ x, z, r: 1.15 });
      // brazier flame between pillars
      const fa = a + Math.PI / count;
      const fx = Math.sin(fa) * 25.6;
      const fz = Math.cos(fa) * 25.6;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.5, 8), stoneDark);
      bowl.position.set(fx, 1.25, fz);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.0, 6), stoneDark);
      leg.position.set(fx, 0.5, fz);
      this.group.add(bowl, leg);
      this.colliders.push({ x: fx, z: fz, r: 0.6 });
      const flameMat = new THREE.SpriteMaterial({ map: glowTexture(), color: i % 2 ? 0xff4a7a : 0x7a6bff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      const flame = new THREE.Sprite(flameMat);
      flame.position.set(fx, 1.9, fz);
      flame.scale.set(1.6, 2.2, 1);
      this.group.add(flame);
      this.flames.push({ sprite: flame, seed: Math.random() * 10 });
    }
  }

  buildBarrier() {
    this.barrierMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDim: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: BARRIER_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const barrier = new THREE.Mesh(new THREE.CylinderGeometry(ARENA.wallRadius, ARENA.wallRadius, 3.2, 96, 1, true), this.barrierMat);
    barrier.position.y = 1.6;
    barrier.renderOrder = 6;
    this.group.add(barrier);
    // low broken wall stones along the edge
    const geo = new THREE.BoxGeometry(1.6, 0.7, 0.8);
    const mat = toon(0x35323f);
    const n = 64;
    const inst = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (i % 9 === 4) continue;
      const a = (i / n) * Math.PI * 2;
      p.set(Math.sin(a) * (ARENA.wallRadius + 0.6), 0.3, Math.cos(a) * (ARENA.wallRadius + 0.6));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      sc.set(1, 0.6 + ((i * 7) % 5) * 0.15, 1);
      m.compose(p, q, sc);
      inst.setMatrixAt(k++, m);
    }
    inst.count = k;
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.group.add(inst);
  }

  buildBackdrop() {
    // floating rocks and distant spires to give the void some depth
    const rockMat = toon(0x2b2836);
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    this.rocks = [];
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 45 + Math.random() * 70;
      const rock = new THREE.Mesh(rockGeo, rockMat);
      const s = 1.5 + Math.random() * 5;
      rock.scale.set(s, s * (0.6 + Math.random() * 0.8), s);
      rock.position.set(Math.sin(a) * r, -6 + Math.random() * 26, Math.cos(a) * r);
      rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.group.add(rock);
      this.rocks.push({ mesh: rock, base: rock.position.y, seed: Math.random() * 10 });
    }
    const spireMat = toon(0x1a1826);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + Math.random() * 0.2;
      const r = 150 + Math.random() * 60;
      const h = 30 + Math.random() * 60;
      const spire = new THREE.Mesh(new THREE.ConeGeometry(8 + Math.random() * 10, h, 5), spireMat);
      spire.position.set(Math.sin(a) * r, -20 + h / 2, Math.cos(a) * r);
      this.group.add(spire);
    }
  }

  /** 1 = normal lighting, lower values dim the arena (used by the ultimate). */
  setDim(k) {
    this.dim = k;
    this.hemi.intensity = this.base.hemi * (0.25 + 0.75 * k);
    this.sun.intensity = this.base.sun * (0.3 + 0.7 * k);
    this.riftLight.intensity = this.base.rift * (1.6 - 0.6 * k);
    this.skyMat.uniforms.uDim.value = 0.35 + 0.65 * k;
    this.barrierMat.uniforms.uDim.value = 0.5 + 0.5 * k;
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.skyMat.uniforms.uTime.value = t;
    this.barrierMat.uniforms.uTime.value = t;
    this.sigilMat.opacity = (0.42 + 0.12 * Math.sin(t * 1.3)) * (0.6 + 0.4 * this.dim);
    this.sigil.rotation.z = t * 0.03;
    for (const f of this.flames) {
      const n = Math.sin(t * 9 + f.seed) * 0.5 + Math.sin(t * 13.7 + f.seed * 2) * 0.5;
      f.sprite.scale.set(1.5 + n * 0.15, 2.1 + n * 0.3, 1);
    }
    for (const r of this.rocks) r.mesh.position.y = r.base + Math.sin(t * 0.3 + r.seed) * 0.8;
  }
}
