// INFERNO CALDERA: a basalt island in a lake of lava, under a burning, ash-choked sky.
// Lava pools break through the floor; obsidian spikes and basalt columns give cover, and four
// rune obelisks stand around the magma ring at the centre.
import * as THREE from 'three';
import { ARENA } from '../../config.js';
import { toon, glowTexture } from '../materials.js';
import { makeCanvas, canvasTexture, skyShader, addBarrier, addGround, addWeather, instanced, compose, prop, rng, NOISE_GLSL, GROUND_TEX, GROUND_PX } from './common.js';

// lava pools inside the arena: [angle, distance, radius]
const POOLS = [[1.0, 24, 4], [2.6, 31, 3.2], [3.95, 21, 3.6], [5.35, 31, 4.4]];
const polar = (a, r) => [Math.sin(a) * r, Math.cos(a) * r];

function basaltTextures(arena, rand) {
  const S = GROUND_TEX;
  const C = S / 2;
  const PX = GROUND_PX;
  const base = makeCanvas(S);
  const glow = makeCanvas(S);
  const g = base.getContext('2d');
  const e = glow.getContext('2d');
  const W = (x, z) => [C + x * PX, C + z * PX];
  g.fillStyle = '#1e1819';
  g.fillRect(0, 0, S, S);
  e.fillStyle = '#000';
  e.fillRect(0, 0, S, S);
  // cracked basalt plates
  for (let i = 0; i < 6000; i++) {
    const s = 22 + Math.floor(rand() * 22);
    g.fillStyle = `rgb(${s + 6},${s},${s})`;
    const x = rand() * S;
    const y = rand() * S;
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + rand() * 0.4;
      const r = (0.5 + rand() * 1.0) * PX;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  }
  // glowing magma cracks
  const crack = (x, y, a, n, w) => {
    e.beginPath();
    g.beginPath();
    e.moveTo(x, y);
    g.moveTo(x, y);
    for (let k = 0; k < n; k++) {
      a += (rand() - 0.5) * 1.1;
      x += Math.cos(a) * 0.9 * PX;
      y += Math.sin(a) * 0.9 * PX;
      e.lineTo(x, y);
      g.lineTo(x, y);
    }
    e.lineWidth = w;
    g.lineWidth = w + 2;
    e.strokeStyle = rand() < 0.2 ? '#e8a040' : '#d8501a';
    g.strokeStyle = '#100808';
    g.stroke();
    e.stroke();
  };
  for (let i = 0; i < 200; i++) crack(rand() * S, rand() * S, rand() * 6.28, 6 + ((rand() * 8) | 0), 1.2 + rand() * 1.8);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    crack(C + Math.cos(a) * 7 * PX, C + Math.sin(a) * 7 * PX, a, 12, 2 + rand() * 1.6);
  }
  e.lineWidth = 0.22 * PX;
  e.strokeStyle = '#d8601c';
  e.beginPath();
  e.arc(C, C, 7 * PX, 0, Math.PI * 2);
  e.stroke();
  // scorched ground and hot cracks radiating from each lava pool
  for (const [a, d, r] of POOLS) {
    const [x, z] = polar(a, d);
    const [px, py] = W(x, z);
    const grd = g.createRadialGradient(px, py, r * PX * 0.8, px, py, r * PX * 1.9);
    grd.addColorStop(0, 'rgba(8,4,4,0.9)');
    grd.addColorStop(1, 'rgba(8,4,4,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(px, py, r * PX * 1.9, 0, Math.PI * 2);
    g.fill();
    for (let k = 0; k < 9; k++) {
      const ca = rand() * Math.PI * 2;
      crack(px + Math.cos(ca) * r * PX, py + Math.sin(ca) * r * PX, ca, 5 + ((rand() * 4) | 0), 1.8 + rand() * 1.5);
    }
  }
  return { map: canvasTexture(arena, base), emissiveMap: canvasTexture(arena, glow) };
}

const LAVA_VERT = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

// Flowing lava with a dark crust. uScale sets the detail; uRadius > 0 fades the edge (pools).
const LAVA_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uDim;
  uniform float uScale;
  uniform float uRadius;
  varying vec2 vPos;
  ${NOISE_GLSL}
  void main() {
    vec2 p = vPos * uScale;
    vec2 flow = vec2(fbm(p + uTime * 0.03), fbm(p - uTime * 0.025 + 5.2));
    float n = fbm(p * 1.6 + flow * 1.8 + uTime * 0.02);
    float veins = smoothstep(0.42, 0.6, n);
    float crust = smoothstep(0.62, 0.78, fbm(p * 3.0 - flow));
    vec3 col = mix(vec3(0.95, 0.25, 0.02), vec3(1.0, 0.75, 0.2), veins);
    col = mix(col, vec3(0.08, 0.03, 0.02), crust * 0.85);
    float d = length(vPos);
    col = mix(vec3(0.25, 0.05, 0.02), col, smoothstep(300.0, 70.0, d));
    float a = uRadius > 0.0 ? smoothstep(uRadius, uRadius * 0.82, d) : 1.0;
    if (uRadius == 0.0) col *= 0.82; // the lake sits a little darker than the pools
    if (uRadius > 0.0) col = mix(vec3(0.12, 0.03, 0.02), col, smoothstep(uRadius * 0.95, uRadius * 0.6, d));
    gl_FragColor = vec4(col * (0.55 + 0.45 * uDim), a);
  }`;

const SKY = skyShader(/* glsl */ `
  float hh = max(h, 0.0);
  col = mix(vec3(0.6, 0.14, 0.04), vec3(0.2, 0.04, 0.03), smoothstep(0.0, 0.2, hh));
  col = mix(col, vec3(0.04, 0.012, 0.015), smoothstep(0.15, 0.7, hh));
  col = mix(col, vec3(0.6, 0.15, 0.03), smoothstep(0.0, -0.2, h));
  // smoke lit from below by the lava
  vec2 cp = d.xz / max(d.y + 0.12, 0.05);
  float cl = fbm(cp * 0.7 + vec2(uTime * 0.03, -uTime * 0.015));
  float cloud = smoothstep(0.4, 0.85, cl);
  col = mix(col, vec3(0.07, 0.025, 0.025), cloud * smoothstep(0.02, 0.4, hh) * 0.8);
  col += vec3(0.9, 0.3, 0.05) * cloud * smoothstep(0.35, 0.0, hh) * 0.25;
  // the volcano's glow on the horizon
  vec3 vd = normalize(vec3(-0.6, 0.08, 0.8));
  col += vec3(1.0, 0.45, 0.1) * pow(max(dot(d, vd), 0.0), 50.0) * 0.9;
  col += vec3(1.0, 0.5, 0.2) * stars(d, 180.0, uTime * 3.0) * 0.6 * smoothstep(0.0, 0.3, hh);
`);

export default {
  id: 'inferno',
  name: 'INFERNO CALDERA',
  tagline: 'An island of rock in a lava lake',
  swatch: ['#1d0805', '#ff6a1a'],
  exposure: 1.1,
  build(arena) {
    const rand = rng(67);
    arena.setLighting({
      fog: [0x2a0e08, 0.0088],
      hemi: [0xff9c6a, 0x2a0a06, 1.05],
      sun: [0xffb486, 2.0, [20, 30, -10]],
      accent: [0xff4a12, 1.2, [6, -8, 16]], // from below: the lava lights everything's underside
    });
    arena.setSky(SKY);
    const groundMat = new THREE.MeshStandardMaterial({ ...basaltTextures(arena, rand), emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.9, metalness: 0.05 });
    addGround(arena, groundMat);
    const R = ARENA.wallRadius + 1.5;
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 3, 4, 72, 2, true), toon(0x1a1214));
    cliff.position.y = -2;
    arena.add(cliff);

    const lavaMat = (scale, radius) => {
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uDim: { value: 1 }, uScale: { value: scale }, uRadius: { value: radius } },
        vertexShader: LAVA_VERT,
        fragmentShader: LAVA_FRAG,
        transparent: radius > 0,
        depthWrite: radius === 0,
      });
      arena.timed(m);
      arena.dimmed(m, 0);
      return m;
    };
    // the lava lake
    const lake = new THREE.Mesh(new THREE.CircleGeometry(340, 72), lavaMat(0.06, 0));
    lake.rotation.x = -Math.PI / 2;
    lake.position.y = -3.2;
    arena.add(lake);
    addBarrier(arena, { colorA: 0xff4a12, colorB: 0xffc040, strength: 0.75 });

    // lava pools breaking through the floor (you cannot walk into them)
    const bubbles = [];
    for (const [a, d, r] of POOLS) {
      const [x, z] = polar(a, d);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 40), lavaMat(0.32, r));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.04, z);
      pool.renderOrder = 3;
      arena.add(pool);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(r, 0.28, 5, 40), toon(0x1a1012, { emissive: 0x3a0a02 }));
      lip.rotation.x = Math.PI / 2;
      lip.position.set(x, 0.08, z);
      arena.add(lip);
      arena.colliders.push({ x, z, r: r + 0.15, low: true });
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff6a1a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
      glow.position.set(x, 1.2, z);
      glow.scale.set(r * 3, r * 1.4, 1);
      arena.add(glow);
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
        arena.add(b);
        bubbles.push({ b, x, z, r, phase: rand() * 3 });
      }
    }

    // jagged obsidian along the rim
    const obsidian = toon(0x17121a, { emissive: 0x2a0804 });
    instanced(arena, new THREE.ConeGeometry(1, 1, 4), obsidian, 92, (i, m) => {
      if (i % 6 === 2) return false;
      const a = (i / 92) * Math.PI * 2 + rand() * 0.03;
      const r = ARENA.wallRadius + 0.7 + rand() * 0.5;
      const h = 0.8 + rand() * 1.6;
      compose(m, Math.sin(a) * r, h / 2, Math.cos(a) * r, (rand() - 0.5) * 0.4, rand() * 3, (rand() - 0.5) * 0.4, 0.45 + rand() * 0.3, h, 0.45 + rand() * 0.3);
    });
    // obsidian spike clusters across the floor
    const spikes = [];
    for (const [a, d] of [[0.35, 17], [1.55, 35], [2.0, 18], [3.2, 36], [3.4, 17], [4.6, 34], [5.0, 16], [6.0, 38]]) {
      const [cx, cz] = polar(a, d);
      const n = 3 + ((rand() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const h = k === 0 ? 4.5 + rand() * 1.5 : 1.6 + rand() * 2;
        spikes.push([cx + (k ? (rand() - 0.5) * 1.6 : 0), h / 2, cz + (k ? (rand() - 0.5) * 1.6 : 0), (rand() - 0.5) * 0.35, rand() * 3, (rand() - 0.5) * 0.35, 0.55 + rand() * 0.3, h]);
      }
      arena.colliders.push({ x: cx, z: cz, r: 1.15 });
      // lava seeps up around each cluster, so they read against the dark floor
      const seep = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff5a14, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
      seep.position.set(cx, 0.5, cz);
      seep.scale.set(5, 1.6, 1);
      arena.add(seep);
    }
    instanced(arena, new THREE.ConeGeometry(1, 1, 5), toon(0x2a2030, { emissive: 0x2a0804 }), spikes.length, (i, m) => {
      const [x, y, z, rx, ry, rz, w, h] = spikes[i];
      compose(m, x, y, z, rx, ry, rz, w, h, w);
    });

    // basalt column formations (hexagonal pillars of cooled lava)
    const basalt = toon(0x3e2e30);
    const columns = [];
    for (const [a, d] of [[0.75, 39], [2.3, 40], [3.75, 39], [5.2, 41], [6.2, 27]]) {
      const [cx, cz] = polar(a, d);
      for (let k = 0; k < 6; k++) {
        const ca = (k / 6) * Math.PI * 2;
        const cr = k === 0 ? 0 : 0.9;
        columns.push([cx + Math.cos(ca) * cr, cz + Math.sin(ca) * cr, 2 + rand() * 5]);
      }
      arena.colliders.push({ x: cx, z: cz, r: 1.7 });
    }
    instanced(arena, new THREE.CylinderGeometry(0.55, 0.55, 1, 6), basalt, columns.length, (i, m) => {
      const [x, z, h] = columns[i];
      compose(m, x, h / 2, z, 0, i * 0.4, 0, 1, h, 1);
    });

    // rune obelisks around the magma ring
    const runeMat = new THREE.MeshBasicMaterial({ color: 0xff7a20 });
    for (let i = 0; i < 4; i++) {
      const [x, z] = polar(Math.PI / 4 + (i * Math.PI) / 2, 12);
      prop(arena, new THREE.BoxGeometry(0.9, 4.4, 0.9), obsidian, x, 2.2, z, { rot: [0, Math.PI / 4 + i, 0] });
      prop(arena, new THREE.ConeGeometry(0.66, 0.8, 4), obsidian, x, 4.8, z, { rot: [0, Math.PI / 4 + i, 0] });
      prop(arena, new THREE.BoxGeometry(0.12, 2.4, 0.95), runeMat, x, 2.4, z, { rot: [0, Math.PI / 4 + i, 0], shadow: false });
      arena.colliders.push({ x, z, r: 0.75 });
    }

    // rock spires rising from the lava, each glowing where it meets the lake
    for (let i = 0; i < 18; i++) {
      const a = rand() * Math.PI * 2;
      const r = 58 + rand() * 70;
      const h = 16 + rand() * 34;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      prop(arena, new THREE.CylinderGeometry(1 + rand() * 1.5, 3 + rand() * 3, h, 6), basalt, x, h / 2 - 3.2, z, { shadow: false, rot: [(rand() - 0.5) * 0.2, rand() * 3, (rand() - 0.5) * 0.2] });
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff6a1a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
      s.position.set(x, -2.4, z);
      s.scale.set(14, 4, 1);
      arena.add(s);
    }

    // the volcano on the horizon, its crater glowing and smoking
    const vx = -170;
    const vz = 230;
    prop(arena, new THREE.ConeGeometry(105, 125, 9, 1, true), toon(0x1c1214), vx, 59, vz, { shadow: false });
    const crater = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff7a20, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    crater.position.set(vx, 122, vz);
    crater.scale.set(64, 32, 1);
    arena.add(crater);
    const smoke = [];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x2a1a18, depthWrite: false, transparent: true, opacity: 0.6 }));
      s.scale.setScalar(40);
      arena.add(s);
      smoke.push({ s, phase: i / 8 });
    }

    addWeather(arena, { count: 450, radius: 28, height: 18, speed: 1.6, sway: 1.2, size: 0.09, colors: [0xff7a1a, 0xffb040, 0xff3a10], kind: 'ember', additive: true, rise: true, opacity: 0.95, seed: 17 });
    addWeather(arena, { count: 300, radius: 28, height: 20, speed: 0.7, sway: 1.5, size: 0.08, colors: [0x5a5050, 0x3a3434], kind: 'soft', opacity: 0.55, seed: 19 });

    arena.onUpdate((t) => {
      groundMat.emissiveIntensity = (0.8 + 0.2 * Math.sin(t * 1.3) + 0.08 * Math.sin(t * 3.7)) * (0.5 + 0.5 * arena.dim);
      crater.scale.set(64 + Math.sin(t * 2) * 6, 32 + Math.sin(t * 2.6) * 4, 1);
      for (const p of smoke) {
        const u = (t * 0.03 + p.phase) % 1;
        p.s.position.set(vx + u * 40, 130 + u * 90, vz - u * 20);
        p.s.scale.setScalar(30 + u * 70);
        p.s.material.opacity = 0.55 * (1 - u);
      }
      // lava bubbles swell and pop
      for (const b of bubbles) {
        const u = ((t * 0.5 + b.phase) % 1.6) / 1.6;
        if (u < 0.02) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * b.r * 0.7;
          b.b.position.set(b.x + Math.sin(a) * r, 0.15, b.z + Math.cos(a) * r);
        }
        b.b.scale.setScalar(0.3 + u * 1.1);
        b.b.material.opacity = Math.sin(Math.min(1, u) * Math.PI) * 0.8;
      }
    });
  },
};
