// FROZEN PEAK: a snowbound summit under the aurora, ringed by ice crystals and pines.
import * as THREE from 'three';
import { ARENA } from '../../config.js';
import { toon, glowTexture } from '../materials.js';
import { makeCanvas, canvasTexture, skyShader, addBarrier, addGround, addWeather, instanced, compose, prop, rng } from './common.js';

const PX = 1024 / (2 * (ARENA.wallRadius + 1.5));

function snowTextures(arena, rand) {
  const size = 1024;
  const base = makeCanvas(size);
  const rough = makeCanvas(size);
  const g = base.getContext('2d');
  const r = rough.getContext('2d');
  g.fillStyle = '#dbe5f1';
  g.fillRect(0, 0, size, size);
  r.fillStyle = '#e6e6e6';
  r.fillRect(0, 0, size, size);
  // wind-blown drifts
  for (let i = 0; i < 900; i++) {
    const x = rand() * size;
    const y = rand() * size;
    g.fillStyle = rand() < 0.5 ? `rgba(160,185,215,${rand() * 0.18})` : `rgba(255,255,255,${rand() * 0.35})`;
    g.beginPath();
    g.ellipse(x, y, 10 + rand() * 40, 4 + rand() * 12, 0.4, 0, Math.PI * 2);
    g.fill();
  }
  // rocks poking through
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2;
    const rr = (0.45 + rand() * 0.55) * 500;
    g.fillStyle = `rgba(60,66,82,${0.5 + rand() * 0.4})`;
    g.beginPath();
    g.ellipse(512 + Math.cos(a) * rr, 512 + Math.sin(a) * rr, 3 + rand() * 9, 2 + rand() * 6, rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // frozen pond in the centre: smooth ice with cracks
  const pr = 8.5 * PX;
  const grd = g.createRadialGradient(512, 512, pr * 0.1, 512, 512, pr);
  grd.addColorStop(0, '#9fd0ec');
  grd.addColorStop(0.8, '#7fb2d6');
  grd.addColorStop(1, '#cfe6f6');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(512, 512, pr, 0, Math.PI * 2);
  g.fill();
  r.fillStyle = '#5a5a5a';
  r.beginPath();
  r.arc(512, 512, pr, 0, Math.PI * 2);
  r.fill();
  g.strokeStyle = 'rgba(240,250,255,0.75)';
  g.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    let a = rand() * Math.PI * 2;
    let x = 512 + Math.cos(a) * rand() * pr * 0.3;
    let y = 512 + Math.sin(a) * rand() * pr * 0.3;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      a += (rand() - 0.5) * 0.9;
      x += Math.cos(a) * 14;
      y += Math.sin(a) * 14;
      if (Math.hypot(x - 512, y - 512) > pr) break;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // sparkle
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `rgba(255,255,255,${0.4 + rand() * 0.6})`;
    g.fillRect(rand() * size, rand() * size, 1.2, 1.2);
  }
  return { map: canvasTexture(arena, base), roughnessMap: canvasTexture(arena, rough, { srgb: false }) };
}

const SKY = skyShader(/* glsl */ `
  float hh = max(h, 0.0);
  col = mix(vec3(0.09, 0.17, 0.28), vec3(0.01, 0.025, 0.07), pow(hh, 0.5));
  col = mix(col, vec3(0.05, 0.08, 0.13), smoothstep(0.0, -0.2, h));
  col += vec3(0.85, 0.92, 1.0) * stars(d, 300.0, uTime) * smoothstep(0.08, 0.5, hh);
  // aurora: curtains hanging across the sky (periodic in azimuth, so no seam)
  vec2 ring = vec2(d.x, d.z) / max(length(d.xz), 1e-3);
  float aur = 0.0;
  vec3 acol = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float e = 0.2 + 0.13 * fi + 0.07 * sin(atan(ring.x, ring.y) * 2.0 + fi * 2.0 + uTime * 0.07)
      + 0.08 * (fbm(ring * 2.2 + vec2(fi * 4.0, uTime * 0.03)) - 0.5);
    float lower = smoothstep(e - 0.015, e + 0.012, hh);
    float upper = exp(-max(hh - e, 0.0) * (5.0 + 3.0 * fi));
    float rays = 0.4 + 0.6 * fbm(ring * 34.0 + vec2(uTime * 0.25, fi * 7.0));
    float patches = smoothstep(-0.25, 0.55, sin(ring.x * 2.3 + ring.y * 1.1 + fi * 2.5 + uTime * 0.03));
    float a = lower * upper * rays * patches;
    aur += a;
    acol += mix(vec3(0.15, 1.0, 0.62), vec3(0.62, 0.32, 1.0), clamp((hh - e) * 4.0, 0.0, 1.0)) * a;
  }
  col += acol * 0.6;
`);

export default {
  id: 'glacier',
  name: 'FROZEN PEAK',
  tagline: 'Summit of ice under the aurora',
  swatch: ['#14243a', '#9fe3ff'],
  exposure: 1.0,
  build(arena) {
    const rand = rng(51);
    arena.setLighting({
      fog: [0x1b2a40, 0.0105],
      hemi: [0xcfe6ff, 0x2a3446, 1.3],
      sun: [0xe6f2ff, 2.2, [-16, 28, 22]],
      accent: [0x5affc8, 0.65, [18, 16, -18]],
    });
    arena.setSky(SKY);
    addGround(arena, new THREE.MeshStandardMaterial({ ...snowTextures(arena, rand), roughness: 1, metalness: 0 }));
    const R = ARENA.wallRadius + 1.5;
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.6, 16, 64, 3, true), toon(0x8296b4));
    cliff.position.y = -8;
    arena.add(cliff);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R, 0.45, 6, 96), toon(0xeef4fb));
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.05;
    arena.add(lip);

    // snow-capped boulders along the edge
    const snowRock = toon(0xe6eef7);
    instanced(arena, new THREE.DodecahedronGeometry(1, 0), snowRock, 46, (i, m) => {
      if (i % 7 === 3) return false;
      const a = (i / 46) * Math.PI * 2 + rand() * 0.05;
      const r = ARENA.wallRadius + 0.6 + rand() * 0.6;
      const s = 0.5 + rand() * 0.6;
      compose(m, Math.sin(a) * r, s * 0.3, Math.cos(a) * r, rand(), rand() * 3, rand(), s * 1.3, s * 0.8, s);
    });
    addBarrier(arena, { colorA: 0x7fe0ff, colorB: 0xeafcff, strength: 0.65 });

    // ice crystal clusters inside the arena edge, with a cold glow at their feet
    const ice = toon(0x9fe3ff, { emissive: 0x1a5a8a });
    const shards = [];
    const glows = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      const cx = Math.sin(a) * 21.8;
      const cz = Math.cos(a) * 21.8;
      const n = 4 + ((rand() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const h = k === 0 ? 3.4 + rand() : 1.2 + rand() * 1.8;
        const ox = k === 0 ? 0 : (rand() - 0.5) * 1.4;
        const oz = k === 0 ? 0 : (rand() - 0.5) * 1.4;
        shards.push([cx + ox, h * 0.42, cz + oz, (rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.5, 0.35 + rand() * 0.2, h * 0.5]);
      }
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x5fd8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
      s.position.set(cx, 0.9, cz);
      s.scale.set(4, 2.4, 1);
      arena.add(s);
      glows.push(s);
      arena.colliders.push({ x: cx, z: cz, r: 1.1 });
    }
    // big spires beyond the wall
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rand() * 0.3;
      const r = 34 + rand() * 14;
      const h = 8 + rand() * 12;
      shards.push([Math.sin(a) * r, h * 0.4, Math.cos(a) * r, (rand() - 0.5) * 0.4, rand() * 3, (rand() - 0.5) * 0.4, 1 + rand() * 0.8, h * 0.5]);
    }
    instanced(arena, new THREE.OctahedronGeometry(1, 0), ice, shards.length, (i, m) => {
      const [x, y, z, rx, ry, rz, w, h] = shards[i];
      compose(m, x, y, z, rx, ry, rz, w, h, w);
    });

    // snowy pines
    const pine = toon(0x1f3a3e);
    const cap = toon(0xf2f7fc);
    const trees = [];
    for (let i = 0; i < 20; i++) {
      const a = rand() * Math.PI * 2;
      const r = 31 + rand() * 18;
      trees.push([Math.sin(a) * r, Math.cos(a) * r, 0.8 + rand() * 0.7]);
    }
    for (const [layer, color] of [[0, pine], [1, cap]]) {
      instanced(arena, new THREE.ConeGeometry(1, 1, 7), color, trees.length * 3, (i, m) => {
        const [x, z, s] = trees[(i / 3) | 0];
        const tier = i % 3;
        const w = (2.6 - tier * 0.7) * s * (layer ? 0.72 : 1);
        const h = 2.6 * s * (layer ? 0.45 : 1);
        compose(m, x, (1.6 + tier * 1.6) * s + (layer ? 0.85 * s : 0), z, 0, 0, 0, w, h, w);
      }, { shadow: !layer });
    }

    // distant mountains with snow caps
    const rock = toon(0x2c3448);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rand() * 0.2;
      const r = 170 + rand() * 90;
      const h = 50 + rand() * 70;
      const w = 40 + rand() * 35;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      prop(arena, new THREE.ConeGeometry(w, h, 6), rock, x, h / 2 - 10, z, { shadow: false });
      prop(arena, new THREE.ConeGeometry(w * 0.4, h * 0.4, 6), cap, x, h - 10 - h * 0.2 + 0.5, z, { shadow: false });
    }

    addWeather(arena, { count: 1400, radius: 34, height: 20, speed: 1.4, sway: 1.1, size: 0.1, colors: [0xffffff, 0xe4f2ff, 0xcfe6ff], kind: 'snow', opacity: 0.9, seed: 13 });

    arena.onUpdate((t) => {
      for (let i = 0; i < glows.length; i++) glows[i].material.opacity = 0.55 + 0.2 * Math.sin(t * 1.4 + i);
    });
  },
};
