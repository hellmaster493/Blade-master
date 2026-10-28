// FROZEN PEAK: a snowbound summit under the aurora. A frozen lake at the centre, ice crystal
// clusters and snow-capped boulders for cover, pine groves at the edge and an ice arch.
import * as THREE from 'three';
import { ARENA } from '../../config.js';
import { toon, glowTexture } from '../materials.js';
import { makeCanvas, canvasTexture, skyShader, addBarrier, addGround, addWeather, instanced, compose, prop, rng, GROUND_TEX, GROUND_PX } from './common.js';

const LAKE_R = 12;

function snowTextures(arena, rand) {
  const S = GROUND_TEX;
  const C = S / 2;
  const PX = GROUND_PX;
  const base = makeCanvas(S);
  const rs = Math.min(S, 1024);
  const rough = makeCanvas(rs);
  const g = base.getContext('2d');
  const r = rough.getContext('2d');
  const k = rs / S;
  g.fillStyle = '#dbe5f1';
  g.fillRect(0, 0, S, S);
  r.fillStyle = '#e6e6e6';
  r.fillRect(0, 0, rs, rs);
  // wind-blown drifts
  for (let i = 0; i < 3200; i++) {
    g.fillStyle = rand() < 0.5 ? `rgba(160,185,215,${rand() * 0.18})` : `rgba(255,255,255,${rand() * 0.35})`;
    g.beginPath();
    g.ellipse(rand() * S, rand() * S, (0.6 + rand() * 2.2) * PX, (0.2 + rand() * 0.7) * PX, 0.4, 0, Math.PI * 2);
    g.fill();
  }
  // rocks poking through
  for (let i = 0; i < 200; i++) {
    const a = rand() * Math.PI * 2;
    const rr = (0.35 + rand() * 0.65) * C;
    g.fillStyle = `rgba(60,66,82,${0.5 + rand() * 0.4})`;
    g.beginPath();
    g.ellipse(C + Math.cos(a) * rr, C + Math.sin(a) * rr, (0.15 + rand() * 0.5) * PX, (0.1 + rand() * 0.3) * PX, rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // footprints and sled tracks crossing the summit
  g.strokeStyle = 'rgba(150,170,200,0.28)';
  g.lineWidth = 0.35 * PX;
  for (let i = 0; i < 6; i++) {
    let a = rand() * 6.28;
    let x = C + Math.cos(a) * C * 0.9;
    let y = C + Math.sin(a) * C * 0.9;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 14; s++) {
      if (s === 0) a += Math.PI; // head inwards from the edge
      a += (rand() - 0.5) * 0.5;
      x += Math.cos(a) * 3 * PX;
      y += Math.sin(a) * 3 * PX;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // the frozen lake: smooth ice with cracks
  const pr = LAKE_R * PX;
  const grd = g.createRadialGradient(C, C, pr * 0.1, C, C, pr);
  grd.addColorStop(0, '#9fd0ec');
  grd.addColorStop(0.8, '#7fb2d6');
  grd.addColorStop(1, '#cfe6f6');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(C, C, pr, 0, Math.PI * 2);
  g.fill();
  r.fillStyle = '#5a5a5a';
  r.beginPath();
  r.arc(C * k, C * k, pr * k, 0, Math.PI * 2);
  r.fill();
  g.strokeStyle = 'rgba(240,250,255,0.75)';
  g.lineWidth = 1.6;
  for (let i = 0; i < 44; i++) {
    let a = rand() * Math.PI * 2;
    let x = C + Math.cos(a) * rand() * pr * 0.3;
    let y = C + Math.sin(a) * rand() * pr * 0.3;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 9; s++) {
      a += (rand() - 0.5) * 0.9;
      x += Math.cos(a) * 0.8 * PX;
      y += Math.sin(a) * 0.8 * PX;
      if (Math.hypot(x - C, y - C) > pr) break;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // sparkle
  for (let i = 0; i < 12000; i++) {
    g.fillStyle = `rgba(255,255,255,${0.4 + rand() * 0.6})`;
    g.fillRect(rand() * S, rand() * S, 1.3, 1.3);
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

const polar = (a, r) => [Math.sin(a) * r, Math.cos(a) * r];

export default {
  id: 'glacier',
  name: 'FROZEN PEAK',
  tagline: 'Summit of ice under the aurora',
  swatch: ['#14243a', '#9fe3ff'],
  exposure: 1.0,
  build(arena) {
    const rand = rng(51);
    arena.setLighting({
      fog: [0x1b2a40, 0.0085],
      hemi: [0xcfe6ff, 0x2a3446, 1.3],
      sun: [0xe6f2ff, 2.2, [-16, 28, 22]],
      accent: [0x5affc8, 0.65, [18, 16, -18]],
    });
    arena.setSky(SKY);
    addGround(arena, new THREE.MeshStandardMaterial({ ...snowTextures(arena, rand), roughness: 1, metalness: 0 }));
    const R = ARENA.wallRadius + 1.5;
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.6, 20, 72, 3, true), toon(0x8296b4));
    cliff.position.y = -10;
    arena.add(cliff);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R, 0.5, 6, 128), toon(0xeef4fb));
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.05;
    arena.add(lip);

    // snow-capped boulders along the edge
    const snowRock = toon(0xe6eef7);
    const greyRock = toon(0x5a6478);
    instanced(arena, new THREE.DodecahedronGeometry(1, 0), snowRock, 76, (i, m) => {
      if (i % 7 === 3) return false;
      const a = (i / 76) * Math.PI * 2 + rand() * 0.04;
      const r = ARENA.wallRadius + 0.6 + rand() * 0.6;
      const s = 0.5 + rand() * 0.6;
      compose(m, Math.sin(a) * r, s * 0.3, Math.cos(a) * r, rand(), rand() * 3, rand(), s * 1.3, s * 0.8, s);
    });
    addBarrier(arena, { colorA: 0x7fe0ff, colorB: 0xeafcff, strength: 0.65 });

    // ice crystal clusters with a cold glow at their feet
    const ice = toon(0x9fe3ff, { emissive: 0x1a5a8a });
    const shards = [];
    const glows = [];
    const crystalSpots = [[0.5, 21], [1.3, 31], [2.1, 23], [2.9, 34], [3.7, 20], [4.5, 30], [5.25, 24], [6.0, 35]];
    for (const [a, r] of crystalSpots) {
      const [cx, cz] = polar(a, r);
      const n = 4 + ((rand() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const h = k === 0 ? 3.4 + rand() * 1.4 : 1.2 + rand() * 1.8;
        shards.push([cx + (k ? (rand() - 0.5) * 1.5 : 0), h * 0.42, cz + (k ? (rand() - 0.5) * 1.5 : 0), (rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.5, 0.35 + rand() * 0.2, h * 0.5]);
      }
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x5fd8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
      s.position.set(cx, 0.9, cz);
      s.scale.set(4, 2.4, 1);
      arena.add(s);
      glows.push(s);
      arena.colliders.push({ x: cx, z: cz, r: 1.1 });
    }
    // big spires beyond the wall
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rand() * 0.3;
      const r = 52 + rand() * 14;
      const h = 9 + rand() * 13;
      shards.push([Math.sin(a) * r, h * 0.4, Math.cos(a) * r, (rand() - 0.5) * 0.4, rand() * 3, (rand() - 0.5) * 0.4, 1.1 + rand() * 0.8, h * 0.5]);
    }
    instanced(arena, new THREE.OctahedronGeometry(1, 0), ice, shards.length, (i, m) => {
      const [x, y, z, rx, ry, rz, w, h] = shards[i];
      compose(m, x, y, z, rx, ry, rz, w, h, w);
    });

    // the ice arch, ahead of where the fight starts
    const archMat = toon(0xbfeeff, { emissive: 0x2a6a9a });
    for (const sx of [-4.2, 4.2]) {
      prop(arena, new THREE.CylinderGeometry(0.7, 1.0, 5.5, 6), archMat, sx, 2.75, 30);
      arena.colliders.push({ x: sx, z: 30, r: 1.0 });
    }
    prop(arena, new THREE.TorusGeometry(4.2, 0.7, 6, 18, Math.PI), archMat, 0, 5.4, 30);
    const archGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x7fe8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 }));
    archGlow.position.set(0, 6, 30);
    archGlow.scale.set(12, 9, 1);
    arena.add(archGlow);

    // boulder piles (low cover) and a stone cairn
    const piles = [];
    for (const [a, r] of [[0.9, 16], [1.8, 26], [2.55, 15], [3.3, 28], [4.1, 17], [4.9, 26], [5.7, 15]]) {
      const [cx, cz] = polar(a, r);
      for (let k = 0; k < 3; k++) {
        const s = k === 0 ? 0.95 + rand() * 0.3 : 0.45 + rand() * 0.35;
        piles.push([cx + (k ? (rand() - 0.5) * 2 : 0), cz + (k ? (rand() - 0.5) * 2 : 0), s]);
      }
      arena.colliders.push({ x: cx, z: cz, r: 1.4, low: true });
    }
    for (const [mat, cap] of [[greyRock, 0], [snowRock, 1]]) {
      instanced(arena, new THREE.DodecahedronGeometry(1, 0), mat, piles.length, (i, m) => {
        const [x, z, s] = piles[i];
        if (cap) compose(m, x, s * 0.82, z, 0.2, i, 0, s * 0.95, s * 0.35, s * 0.95);
        else compose(m, x, s * 0.45, z, i * 0.7, i, i * 0.3, s * 1.2, s * 0.8, s);
      }, { shadow: !cap });
    }
    for (let k = 0; k < 5; k++) {
      const s = 0.9 - k * 0.14;
      prop(arena, new THREE.DodecahedronGeometry(1, 0), greyRock, -26, 0.4 + k * 0.55, -20, { scale: [s, s * 0.45, s], rot: [0, k * 0.9, 0] });
    }
    prop(arena, new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5), toon(0x6a4a32), -26, 3.5, -20);
    for (let k = 0; k < 4; k++) prop(arena, new THREE.PlaneGeometry(0.5, 0.35), toon([0xff5a5a, 0x5ac8ff, 0x7aff7a, 0xffd85a][k], { side: THREE.DoubleSide }), -26 + 0.28, 4.6 - k * 0.42, -20, { shadow: false });
    arena.colliders.push({ x: -26, z: -20, r: 1.1, low: true });

    // snowy pines: groves just inside the edge, and forest beyond
    const pine = toon(0x1f3a3e);
    const cap = toon(0xf2f7fc);
    const trees = [];
    for (const a of [0.2, 1.65, 2.6, 3.95, 5.0]) {
      const [gx, gz] = polar(a, 37);
      for (let k = 0; k < 4; k++) {
        const x = gx + (rand() - 0.5) * 5;
        const z = gz + (rand() - 0.5) * 5;
        if (Math.hypot(x, z) > ARENA.radius - 1.5) continue;
        trees.push([x, z, 0.85 + rand() * 0.5]);
        arena.colliders.push({ x, z, r: 0.55 });
      }
    }
    for (let i = 0; i < 30; i++) {
      const a = rand() * Math.PI * 2;
      const r = 50 + rand() * 24;
      trees.push([Math.sin(a) * r, Math.cos(a) * r, 0.9 + rand() * 0.8]);
    }
    instanced(arena, new THREE.CylinderGeometry(0.16, 0.22, 1.6, 6), toon(0x4a3426), trees.length, (i, m) => {
      const [x, z, s] = trees[i];
      compose(m, x, 0.8 * s, z, 0, 0, 0, s);
    });
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
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + rand() * 0.2;
      const r = 200 + rand() * 100;
      const h = 60 + rand() * 80;
      const w = 45 + rand() * 40;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      prop(arena, new THREE.ConeGeometry(w, h, 6), rock, x, h / 2 - 10, z, { shadow: false });
      prop(arena, new THREE.ConeGeometry(w * 0.4, h * 0.4, 6), cap, x, h - 10 - h * 0.2 + 0.5, z, { shadow: false });
    }

    addWeather(arena, { count: 1400, radius: 28, height: 20, speed: 1.4, sway: 1.1, size: 0.1, colors: [0xffffff, 0xe4f2ff, 0xcfe6ff], kind: 'snow', opacity: 0.9, seed: 13 });

    arena.onUpdate((t) => {
      for (let i = 0; i < glows.length; i++) glows[i].material.opacity = 0.55 + 0.2 * Math.sin(t * 1.4 + i);
      archGlow.material.opacity = 0.4 + 0.12 * Math.sin(t * 0.9);
    });
  },
};
