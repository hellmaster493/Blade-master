// INFERNO CALDERA: a basalt island in a lake of lava, under a burning, ash-choked sky.
import * as THREE from 'three';
import { ARENA } from '../../config.js';
import { toon, glowTexture } from '../materials.js';
import { makeCanvas, canvasTexture, skyShader, addBarrier, addGround, addWeather, instanced, compose, prop, rng, NOISE_GLSL } from './common.js';

const PX = 1024 / (2 * (ARENA.wallRadius + 1.5));

function basaltTextures(arena, rand) {
  const size = 1024;
  const base = makeCanvas(size);
  const glow = makeCanvas(size);
  const g = base.getContext('2d');
  const e = glow.getContext('2d');
  g.fillStyle = '#1e1819';
  g.fillRect(0, 0, size, size);
  e.fillStyle = '#000';
  e.fillRect(0, 0, size, size);
  // cracked basalt plates
  for (let i = 0; i < 1600; i++) {
    const s = 22 + Math.floor(rand() * 22);
    g.fillStyle = `rgb(${s + 6},${s},${s})`;
    const x = rand() * size;
    const y = rand() * size;
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + rand() * 0.4;
      const r = 10 + rand() * 18;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  }
  // glowing magma cracks (wider and hotter towards the centre ring)
  const crack = (x, y, a, n, w) => {
    e.beginPath();
    g.beginPath();
    e.moveTo(x, y);
    g.moveTo(x, y);
    for (let k = 0; k < n; k++) {
      a += (rand() - 0.5) * 1.1;
      x += Math.cos(a) * 16;
      y += Math.sin(a) * 16;
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
  for (let i = 0; i < 60; i++) crack(rand() * size, rand() * size, rand() * 6.28, 6 + ((rand() * 8) | 0), 1 + rand() * 1.5);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    crack(512 + Math.cos(a) * 5 * PX, 512 + Math.sin(a) * 5 * PX, a, 10, 1.6 + rand() * 1.4);
  }
  e.lineWidth = 0.18 * PX;
  e.strokeStyle = '#d8601c';
  e.beginPath();
  e.arc(512, 512, 5 * PX, 0, Math.PI * 2);
  e.stroke();
  return { map: canvasTexture(arena, base), emissiveMap: canvasTexture(arena, glow) };
}

const LAVA_VERT = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const LAVA_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uDim;
  varying vec2 vPos;
  ${NOISE_GLSL}
  void main() {
    vec2 p = vPos * 0.06;
    vec2 flow = vec2(fbm(p + uTime * 0.03), fbm(p - uTime * 0.025 + 5.2));
    float n = fbm(p * 1.6 + flow * 1.8 + uTime * 0.02);
    float veins = smoothstep(0.42, 0.6, n);
    float crust = smoothstep(0.62, 0.78, fbm(p * 3.0 - flow));
    vec3 col = mix(vec3(0.95, 0.25, 0.02), vec3(1.0, 0.75, 0.2), veins);
    col = mix(col, vec3(0.08, 0.03, 0.02), crust * 0.85);
    float far = smoothstep(260.0, 60.0, length(vPos));
    col = mix(vec3(0.25, 0.05, 0.02), col, far);
    gl_FragColor = vec4(col * (0.55 + 0.45 * uDim), 1.0);
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
      fog: [0x2a0e08, 0.0105],
      hemi: [0xff9c6a, 0x2a0a06, 1.05],
      sun: [0xffb486, 2.0, [20, 30, -10]],
      accent: [0xff4a12, 1.2, [6, -8, 16]], // from below: the lava lights everything's underside
    });
    arena.setSky(SKY);
    const groundMat = new THREE.MeshStandardMaterial({ ...basaltTextures(arena, rand), emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.9, metalness: 0.05 });
    addGround(arena, groundMat);
    const R = ARENA.wallRadius + 1.5;
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 3, 4, 64, 2, true), toon(0x1a1214));
    cliff.position.y = -2;
    arena.add(cliff);

    // the lava lake
    const lavaMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uDim: { value: 1 } }, vertexShader: LAVA_VERT, fragmentShader: LAVA_FRAG });
    arena.timed(lavaMat);
    arena.dimmed(lavaMat, 0);
    const lava = new THREE.Mesh(new THREE.CircleGeometry(320, 64), lavaMat);
    lava.rotation.x = -Math.PI / 2;
    lava.position.y = -3.2;
    arena.add(lava);
    addBarrier(arena, { colorA: 0xff4a12, colorB: 0xffc040, strength: 0.75 });

    // jagged obsidian along the rim
    const obsidian = toon(0x17121a, { emissive: 0x2a0804 });
    instanced(arena, new THREE.ConeGeometry(1, 1, 4), obsidian, 54, (i, m) => {
      if (i % 6 === 2) return false;
      const a = (i / 54) * Math.PI * 2 + rand() * 0.04;
      const r = ARENA.wallRadius + 0.7 + rand() * 0.5;
      const h = 0.8 + rand() * 1.6;
      compose(m, Math.sin(a) * r, h / 2, Math.cos(a) * r, (rand() - 0.5) * 0.4, rand() * 3, (rand() - 0.5) * 0.4, 0.45 + rand() * 0.3, h, 0.45 + rand() * 0.3);
    });
    // obsidian spike clusters inside the arena edge
    const spikes = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.2;
      const cx = Math.sin(a) * 21.8;
      const cz = Math.cos(a) * 21.8;
      const n = 3 + ((rand() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const h = k === 0 ? 4.5 + rand() * 1.5 : 1.6 + rand() * 2;
        spikes.push([cx + (k ? (rand() - 0.5) * 1.6 : 0), h / 2, cz + (k ? (rand() - 0.5) * 1.6 : 0), (rand() - 0.5) * 0.35, rand() * 3, (rand() - 0.5) * 0.35, 0.55 + rand() * 0.3, h]);
      }
      arena.colliders.push({ x: cx, z: cz, r: 1.15 });
    }
    instanced(arena, new THREE.ConeGeometry(1, 1, 5), obsidian, spikes.length, (i, m) => {
      const [x, y, z, rx, ry, rz, w, h] = spikes[i];
      compose(m, x, y, z, rx, ry, rz, w, h, w);
    });

    // rock spires rising from the lava, each glowing where it meets the lake
    const basalt = toon(0x241a1c);
    for (let i = 0; i < 16; i++) {
      const a = rand() * Math.PI * 2;
      const r = 42 + rand() * 60;
      const h = 14 + rand() * 32;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      prop(arena, new THREE.CylinderGeometry(1 + rand() * 1.5, 3 + rand() * 3, h, 6), basalt, x, h / 2 - 3.2, z, { shadow: false, rot: [(rand() - 0.5) * 0.2, rand() * 3, (rand() - 0.5) * 0.2] });
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff6a1a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
      s.position.set(x, -2.4, z);
      s.scale.set(14, 4, 1);
      arena.add(s);
    }

    // the volcano on the horizon, its crater glowing and smoking
    const vx = -150;
    const vz = 200;
    prop(arena, new THREE.ConeGeometry(95, 115, 9, 1, true), toon(0x1c1214), vx, 54, vz, { shadow: false });
    const crater = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff7a20, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    crater.position.set(vx, 112, vz);
    crater.scale.set(60, 30, 1);
    arena.add(crater);
    const smoke = [];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x2a1a18, depthWrite: false, transparent: true, opacity: 0.6 }));
      s.scale.setScalar(40);
      arena.add(s);
      smoke.push({ s, phase: i / 8 });
    }

    addWeather(arena, { count: 450, radius: 32, height: 18, speed: 1.6, sway: 1.2, size: 0.09, colors: [0xff7a1a, 0xffb040, 0xff3a10], kind: 'ember', additive: true, rise: true, opacity: 0.95, seed: 17 });
    addWeather(arena, { count: 300, radius: 34, height: 20, speed: 0.7, sway: 1.5, size: 0.08, colors: [0x5a5050, 0x3a3434], kind: 'soft', opacity: 0.55, seed: 19 });

    arena.onUpdate((t) => {
      groundMat.emissiveIntensity = (0.8 + 0.2 * Math.sin(t * 1.3) + 0.08 * Math.sin(t * 3.7)) * (0.5 + 0.5 * arena.dim);
      crater.scale.set(60 + Math.sin(t * 2) * 6, 30 + Math.sin(t * 2.6) * 4, 1);
      for (const p of smoke) {
        const u = (t * 0.03 + p.phase) % 1;
        p.s.position.set(vx + u * 40, 120 + u * 90, vz - u * 20);
        p.s.scale.setScalar(30 + u * 70);
        p.s.material.opacity = 0.55 * (1 - u);
      }
    });
  },
};
