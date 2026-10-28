// NEON SKYLINE: a rain-slick skyscraper rooftop above a futuristic city at night. A helipad
// in the middle; a stairwell hut, a giant billboard, water towers, an antenna mast, AC units,
// solar panels and skylights spread over the roof.
import * as THREE from 'three';
import { ARENA } from '../../config.js';
import { toon, glowTexture } from '../materials.js';
import { makeCanvas, canvasTexture, skyShader, addBarrier, addGround, addWeather, instanced, compose, prop, rng, UV_VERT, GROUND_TEX, GROUND_PX } from './common.js';

function roofTextures(arena, rand) {
  const S = GROUND_TEX;
  const C = S / 2;
  const PX = GROUND_PX;
  const half = S >= 2048 ? 1024 : S; // the glow and roughness maps can be coarser
  const base = makeCanvas(S);
  const glow = makeCanvas(half);
  const rough = makeCanvas(half);
  const g = base.getContext('2d');
  const e = glow.getContext('2d');
  const r = rough.getContext('2d');
  const k = half / S; // scale from base-map pixels to the coarser maps
  g.fillStyle = '#25272f';
  g.fillRect(0, 0, S, S);
  e.fillStyle = '#000';
  e.fillRect(0, 0, half, half);
  r.fillStyle = '#b4b4b4';
  r.fillRect(0, 0, half, half);
  // concrete panels
  const step = 2.4 * PX;
  for (let x = 0; x < S; x += step) {
    for (let y = 0; y < S; y += step) {
      const s = 34 + Math.floor(rand() * 12);
      g.fillStyle = `rgb(${s},${s + 2},${s + 8})`;
      g.fillRect(x + 1, y + 1, step - 2, step - 2);
    }
  }
  // puddles: darker and much smoother (wet highlights)
  for (let i = 0; i < 90; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const w = (0.5 + rand() * 1.6) * PX;
    const h = w * (0.4 + rand() * 0.5);
    const a = rand() * 3;
    g.fillStyle = 'rgba(14,18,34,0.3)';
    g.beginPath();
    g.ellipse(x, y, w, h, a, 0, Math.PI * 2);
    g.fill();
    r.fillStyle = '#2a2a2a';
    r.beginPath();
    r.ellipse(x * k, y * k, w * k, h * k, a, 0, Math.PI * 2);
    r.fill();
  }
  // helipad: painted ring and a big H under Kairo's feet
  g.strokeStyle = 'rgba(230,236,255,0.55)';
  g.lineWidth = 0.45 * PX;
  g.beginPath();
  g.arc(C, C, 10 * PX, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(230,236,255,0.4)';
  const hw = 0.8 * PX;
  g.fillRect(C - 3.6 * PX, C - 5 * PX, hw, 10 * PX);
  g.fillRect(C + 3.6 * PX - hw, C - 5 * PX, hw, 10 * PX);
  g.fillRect(C - 3.6 * PX, C - hw / 2, 7.2 * PX, hw);
  // hazard stripes near the edge
  const edge = (ARENA.radius - 0.5) * PX;
  for (let i = 0; i < 200; i++) {
    const a0 = (i / 200) * Math.PI * 2;
    g.strokeStyle = i % 2 ? 'rgba(255,196,40,0.5)' : 'rgba(20,20,24,0.6)';
    g.lineWidth = 0.6 * PX;
    g.beginPath();
    g.arc(C, C, edge, a0, a0 + Math.PI / 100);
    g.stroke();
  }
  // LED strips in the floor (emissive): two rings joined by spokes
  const ek = (v) => v * k;
  e.lineWidth = Math.max(1.5, 0.12 * PX * k);
  const ring = (radius, color) => {
    e.strokeStyle = color;
    e.beginPath();
    e.arc(ek(C), ek(C), ek(radius * PX), 0, Math.PI * 2);
    e.stroke();
  };
  ring(14, '#2ee8ff');
  ring(ARENA.radius - 4, '#ff3ad0');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    e.strokeStyle = i % 2 ? '#2ee8ff' : '#ff3ad0';
    e.beginPath();
    e.moveTo(ek(C + Math.cos(a) * 14.5 * PX), ek(C + Math.sin(a) * 14.5 * PX));
    e.lineTo(ek(C + Math.cos(a) * (ARENA.radius - 4.5) * PX), ek(C + Math.sin(a) * (ARENA.radius - 4.5) * PX));
    e.stroke();
  }
  return {
    map: canvasTexture(arena, base),
    emissiveMap: canvasTexture(arena, glow),
    roughnessMap: canvasTexture(arena, rough, { srgb: false }),
  };
}

function windowTexture(arena, rand) {
  const c = makeCanvas(128, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#0b0d17';
  g.fillRect(0, 0, 128, 256);
  const lit = ['#ffd89a', '#ffe9c2', '#9fd8ff', '#c8e6ff', '#ff6ad8'];
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 16; y++) {
      const on = rand() < 0.38;
      g.fillStyle = on ? lit[(rand() * (rand() < 0.1 ? 5 : 4)) | 0] : '#151a29';
      g.fillRect(x * 16 + 3, y * 16 + 4, 10, 9);
    }
  }
  return canvasTexture(arena, c, { repeat: [1, 1] });
}

function signTexture(arena, text, color, sub) {
  const c = makeCanvas(512, 256);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(6,8,20,0.85)';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = color;
  g.lineWidth = 8;
  g.shadowColor = color;
  g.shadowBlur = 24;
  g.strokeRect(14, 14, 484, 228);
  g.fillStyle = '#ffffff';
  g.font = 'bold 92px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 112);
  g.shadowBlur = 12;
  g.fillStyle = color;
  g.font = 'bold 34px Arial, sans-serif';
  g.fillText(sub, 256, 196);
  return canvasTexture(arena, c);
}

const SIGN_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uSeed;
  uniform float uDim;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float flicker = step(0.04, fract(sin(floor(uTime * 12.0 + uSeed) * 12.9898) * 43758.5)) * 0.25 + 0.75;
    float scan = 0.85 + 0.15 * sin(vUv.y * 260.0 - uTime * 6.0);
    gl_FragColor = vec4(t.rgb * 1.7 * flicker * scan * uDim, t.a);
  }`;

const SKY = skyShader(/* glsl */ `
  float hh = max(h, 0.0);
  col = mix(vec3(0.5, 0.16, 0.5), vec3(0.07, 0.05, 0.17), smoothstep(0.0, 0.14, hh));
  col = mix(col, vec3(0.012, 0.016, 0.05), smoothstep(0.1, 0.6, hh));
  col += vec3(0.1, 0.5, 0.7) * pow(1.0 - hh, 14.0) * 0.35;
  col = mix(col, vec3(0.05, 0.03, 0.09), smoothstep(0.0, -0.2, h));
  // low cloud deck lit by the city
  vec2 cp = d.xz / max(d.y + 0.1, 0.05);
  float cl = fbm(cp * 0.6 + vec2(uTime * 0.02, uTime * 0.01));
  col += vec3(0.38, 0.12, 0.42) * smoothstep(0.45, 0.85, cl) * smoothstep(0.02, 0.3, hh) * smoothstep(0.9, 0.3, hh) * 0.6;
  col += vec3(0.7, 0.8, 1.0) * stars(d, 200.0, uTime) * smoothstep(0.4, 0.8, hh) * 0.5;
  // holographic moon: an outlined disc with scanlines
  vec3 md = normalize(vec3(0.5, 0.42, 0.75));
  float m = dot(d, md);
  float ring = smoothstep(0.0012, 0.0, abs(m - 0.9935));
  float fill = smoothstep(0.993, 0.9945, m);
  float scan = 0.5 + 0.5 * sin(d.y * 900.0 + uTime * 3.0);
  col += vec3(0.2, 0.9, 1.0) * (ring * 0.9 + fill * 0.14 * scan) + vec3(0.1, 0.4, 0.6) * pow(max(m, 0.0), 60.0) * 0.25;
`);

export default {
  id: 'neon',
  name: 'NEON SKYLINE',
  tagline: 'Rain-slick rooftop above the city',
  swatch: ['#0a0f24', '#29e6ff'],
  exposure: 1.15,
  build(arena) {
    const rand = rng(37);
    arena.setLighting({
      fog: [0x0b0f22, 0.0048],
      hemi: [0x5a78ff, 0x1a0e24, 1.1],
      sun: [0xa8c0ff, 1.7, [16, 32, 12]],
      accent: [0xff3ad0, 1.0, [-22, 10, -12]],
    });
    arena.setSky(SKY);
    const tex = roofTextures(arena, rand);
    addGround(arena, new THREE.MeshStandardMaterial({ ...tex, emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 1, metalness: 0.25 }));

    // the tower itself, dropping away to the street
    const win = windowTexture(arena, rand);
    const towerTex = win.clone();
    arena.track(towerTex);
    towerTex.repeat.set(18, 6);
    const R = ARENA.wallRadius + 1.5;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 130, 64, 1, true), new THREE.MeshBasicMaterial({ map: towerTex }));
    tower.position.y = -65;
    arena.add(tower);

    // parapet with neon strips
    const parapetR = ARENA.wallRadius + 0.7;
    instanced(arena, new THREE.BoxGeometry(2.5, 1, 0.5), toon(0x3a3e4a), 116, (i, m) => {
      const a = (i / 116) * Math.PI * 2;
      compose(m, Math.sin(a) * parapetR, 0.5, Math.cos(a) * parapetR, 0, a, 0);
    });
    for (const [y, color] of [[1.04, 0x2ee8ff], [0.3, 0xff3ad0]]) {
      const strip = new THREE.Mesh(new THREE.TorusGeometry(parapetR - 0.27, 0.05, 6, 240), new THREE.MeshBasicMaterial({ color }));
      strip.rotation.x = Math.PI / 2;
      strip.position.y = y;
      arena.add(strip);
    }
    addBarrier(arena, { colorA: 0x2ee8ff, colorB: 0xff3ad0, strength: 0.8 });

    const metal = toon(0x5a5f6a);
    const dark = toon(0x2a2d36);
    const concrete = toon(0x474b57);
    const signMat = (text, color, sub, seed) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: signTexture(arena, text, color, sub) }, uTime: { value: 0 }, uSeed: { value: seed }, uDim: { value: 1 } },
        vertexShader: UV_VERT,
        fragmentShader: SIGN_FRAG,
        transparent: true,
        side: THREE.DoubleSide,
      });
      arena.timed(mat);
      arena.dimmed(mat, 0.5);
      return mat;
    };

    // stairwell hut with a lit door and an EXIT sign, its door facing the helipad
    const hut = { x: 20, z: 22 };
    const hy = Math.atan2(-hut.x, -hut.z);
    const fx = Math.sin(hy);
    const fz = Math.cos(hy);
    prop(arena, new THREE.BoxGeometry(6, 4.2, 5), concrete, hut.x, 2.1, hut.z, { rot: [0, hy, 0] });
    prop(arena, new THREE.BoxGeometry(6.4, 0.3, 5.4), dark, hut.x, 4.35, hut.z, { rot: [0, hy, 0] });
    prop(arena, new THREE.PlaneGeometry(1.4, 2.4), new THREE.MeshBasicMaterial({ color: 0xbfe8ff }), hut.x + fx * 2.52, 1.2, hut.z + fz * 2.52, { rot: [0, hy, 0], shadow: false });
    prop(arena, new THREE.PlaneGeometry(2.6, 1.3), signMat('EXIT 07', '#7cff7a', 'ROOF ACCESS', 3), hut.x + fx * 2.55, 3.3, hut.z + fz * 2.55, { rot: [0, hy, 0], shadow: false });
    for (const k of [-1.5, 1.5]) arena.colliders.push({ x: hut.x + k * Math.cos(hy), z: hut.z - k * Math.sin(hy), r: 2.7 });

    // a giant billboard standing on the roof, facing where the fight starts
    const bb = { x: 0, z: 34 };
    const board = prop(arena, new THREE.PlaneGeometry(14, 7), signMat('KUROKAZE', '#2ee8ff', 'BLADES · EST. 2189', 1), bb.x, 8.5, bb.z, { shadow: false });
    board.lookAt(0, 8.5, 0);
    prop(arena, new THREE.BoxGeometry(14.6, 7.6, 0.4), dark, bb.x, 8.5, bb.z + 0.3);
    for (const sx of [-5, 5]) {
      prop(arena, new THREE.CylinderGeometry(0.25, 0.3, 5, 8), dark, bb.x + sx, 2.5, bb.z + 0.3);
      arena.colliders.push({ x: bb.x + sx, z: bb.z + 0.3, r: 0.5 });
    }
    prop(arena, new THREE.BoxGeometry(12, 0.25, 1.4), metal, bb.x, 4.9, bb.z - 0.4); // catwalk

    // water towers on stilts
    for (const [tx, tz] of [[-30, 16], [30, -18]]) {
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) prop(arena, new THREE.CylinderGeometry(0.1, 0.1, 2.2, 6), dark, tx + dx, 1.1, tz + dz);
      prop(arena, new THREE.CylinderGeometry(1.6, 1.6, 2.8, 16), toon(0x6a5a4a), tx, 3.6, tz);
      prop(arena, new THREE.ConeGeometry(1.7, 0.8, 16), dark, tx, 5.4, tz);
      arena.colliders.push({ x: tx, z: tz, r: 1.7 });
    }

    // antenna mast with a blinking beacon
    const ax = -22;
    const az = -30;
    prop(arena, new THREE.CylinderGeometry(0.14, 0.26, 16, 6), dark, ax, 8, az);
    for (let i = 1; i < 5; i++) prop(arena, new THREE.BoxGeometry(1.9 - i * 0.3, 0.06, 0.06), dark, ax, i * 3.2, az, { shadow: false });
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff2a3a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    beacon.position.set(ax, 16.1, az);
    beacon.scale.setScalar(1.8);
    arena.add(beacon);
    arena.colliders.push({ x: ax, z: az, r: 0.5 });

    // AC unit clusters (waist-high cover)
    const units = [];
    for (const [cx, cz, rot] of [[-16, -18, 0.6], [16, -27, -0.2], [35, 6, 1.4], [-36, -10, 1.7], [-12, 38, 0.1]]) {
      for (let k = -1; k <= 1; k++) {
        const x = cx + Math.cos(rot) * k * 2.3;
        const z = cz - Math.sin(rot) * k * 2.3;
        units.push([x, z, rot]);
        arena.colliders.push({ x, z, r: 1.1, low: true });
      }
    }
    instanced(arena, new THREE.BoxGeometry(1.9, 1.25, 1.5), metal, units.length, (i, m) => {
      const [x, z, rot] = units[i];
      compose(m, x, 0.62, z, 0, rot, 0);
    });
    instanced(arena, new THREE.CylinderGeometry(0.55, 0.55, 0.08, 16), dark, units.length, (i, m) => {
      const [x, z] = units[i];
      compose(m, x, 1.28, z);
    }, { shadow: false });

    // solar panel rows
    const panels = [];
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 5; k++) {
        const x = 18 + k * 2.3;
        const z = 30 - row * 3.2 - k * 0.4;
        if (Math.hypot(x, z) > ARENA.radius - 3) continue;
        panels.push([x, z]);
        arena.colliders.push({ x, z, r: 1.05, low: true });
      }
    }
    instanced(arena, new THREE.BoxGeometry(2.1, 0.08, 1.3), toon(0x1a2a4a, { emissive: 0x0a1a3a }), panels.length, (i, m) => {
      const [x, z] = panels[i];
      compose(m, x, 0.9, z, -0.45, 0, 0);
    });
    instanced(arena, new THREE.CylinderGeometry(0.06, 0.06, 0.9, 5), dark, panels.length, (i, m) => {
      const [x, z] = panels[i];
      compose(m, x, 0.45, z);
    }, { shadow: false });

    // skylights and vent stacks
    for (const [x, z] of [[9, -15], [-25, 26]]) {
      prop(arena, new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x1a3a5a, roughness: 0.1, metalness: 0.4 }), x, 0, z);
      arena.colliders.push({ x, z, r: 1.4, low: true });
    }
    for (const [x, z] of [[-6, -34], [26, 34], [-38, 20], [38, -22]]) {
      prop(arena, new THREE.CylinderGeometry(0.35, 0.35, 2.4, 10), metal, x, 1.2, z);
      prop(arena, new THREE.CylinderGeometry(0.5, 0.35, 0.3, 10), dark, x, 2.5, z);
      arena.colliders.push({ x, z, r: 0.5, low: true });
    }

    // holographic billboards on the neighbouring towers
    const signs = [
      ['RIFT//NET', '#ff3ad0', 'LIVE ARENA FEED', 2.2],
      ['NEON RAMEN', '#ffc428', 'OPEN 24/7', 3.9],
      ['GALE TECH', '#7cff7a', 'MOVE FASTER', 5.3],
      ['SKY TRAM', '#2ee8ff', 'LINE 9 · NEXT 2 MIN', 0.9],
    ];
    for (const [text, color, sub, a] of signs) {
      const r = ARENA.wallRadius + 10;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 6.5), signMat(text, color, sub, a * 7));
      sign.position.set(Math.sin(a) * r, 10, Math.cos(a) * r);
      sign.lookAt(0, 10, 0);
      arena.add(sign);
    }

    // the city: instanced towers from a handful of templates (UVs scaled so windows stay square)
    const roofMat = new THREE.MeshBasicMaterial({ color: 0x0a0c14 });
    const sideMat = new THREE.MeshBasicMaterial({ map: win });
    const templates = [[12, 70], [16, 100], [20, 130], [14, 160], [24, 90], [18, 200]];
    for (let ti = 0; ti < templates.length; ti++) {
      const [w, h] = templates[ti];
      const geo = new THREE.BoxGeometry(w, h, w);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 16), uv.getY(i) * (h / 32));
      instanced(arena, geo, [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat], 16, (i, m) => {
        const a = rand() * Math.PI * 2;
        const near = h < 110;
        const r = near ? 75 + rand() * 70 : 150 + rand() * 160;
        compose(m, Math.sin(a) * r, -125 + h / 2, Math.cos(a) * r, 0, rand() * 3, 0);
      }, { shadow: false });
    }
    // flying traffic
    const cars = [];
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: [0xffffff, 0xff4a5a, 0x5ae8ff][i % 3], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.scale.setScalar(1.6 + rand());
      arena.add(s);
      cars.push({ s, r: 70 + rand() * 100, y: 8 + rand() * 40, speed: (rand() < 0.5 ? -1 : 1) * (0.04 + rand() * 0.06), phase: rand() * 6.28 });
    }

    addWeather(arena, { count: 1500, radius: 28, height: 24, speed: 24, sway: 0.08, size: 0.75, colors: [0x9ec8ff, 0xc8dcff], kind: 'rain', additive: true, opacity: 0.32, seed: 9 });

    arena.onUpdate((t) => {
      beacon.material.opacity = Math.sin(t * 3) > 0.2 ? 1 : 0.15;
      for (const c of cars) {
        const a = c.phase + t * c.speed;
        c.s.position.set(Math.sin(a) * c.r, c.y + Math.sin(t * 0.5 + c.phase) * 1.5, Math.cos(a) * c.r);
      }
    });
  },
};
