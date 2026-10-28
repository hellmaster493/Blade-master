// NEON SKYLINE: a rain-slick skyscraper rooftop above a futuristic city at night.
import * as THREE from 'three';
import { ARENA } from '../../config.js';
import { toon, glowTexture } from '../materials.js';
import { makeCanvas, canvasTexture, skyShader, addBarrier, addGround, addWeather, instanced, compose, prop, rng, UV_VERT } from './common.js';

const PX = 1024 / (2 * (ARENA.wallRadius + 1.5));

function roofTextures(arena, rand) {
  const size = 1024;
  const base = makeCanvas(size);
  const glow = makeCanvas(size);
  const rough = makeCanvas(size);
  const g = base.getContext('2d');
  const e = glow.getContext('2d');
  const r = rough.getContext('2d');
  g.fillStyle = '#25272f';
  g.fillRect(0, 0, size, size);
  e.fillStyle = '#000';
  e.fillRect(0, 0, size, size);
  r.fillStyle = '#b4b4b4';
  r.fillRect(0, 0, size, size);
  // concrete panels
  const step = 2.4 * PX;
  for (let x = 0; x < size; x += step) {
    for (let y = 0; y < size; y += step) {
      const s = 34 + Math.floor(rand() * 12);
      g.fillStyle = `rgb(${s},${s + 2},${s + 8})`;
      g.fillRect(x + 1, y + 1, step - 2, step - 2);
    }
  }
  // puddles: darker and much smoother (wet highlights)
  for (let i = 0; i < 34; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const w = (0.5 + rand() * 1.6) * PX;
    const h = w * (0.4 + rand() * 0.5);
    const a = rand() * 3;
    g.fillStyle = 'rgba(14,18,34,0.3)';
    r.fillStyle = '#2a2a2a';
    for (const ctx of [g, r]) {
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // helipad: painted ring and a big H under Kairo's feet
  g.strokeStyle = 'rgba(230,236,255,0.55)';
  g.lineWidth = 0.45 * PX;
  g.beginPath();
  g.arc(512, 512, 8 * PX, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(230,236,255,0.4)';
  const hw = 0.7 * PX;
  g.fillRect(512 - 3 * PX, 512 - 4 * PX, hw, 8 * PX);
  g.fillRect(512 + 3 * PX - hw, 512 - 4 * PX, hw, 8 * PX);
  g.fillRect(512 - 3 * PX, 512 - hw / 2, 6 * PX, hw);
  // hazard stripes near the edge
  for (let i = 0; i < 120; i++) {
    const a0 = (i / 120) * Math.PI * 2;
    g.strokeStyle = i % 2 ? 'rgba(255,196,40,0.5)' : 'rgba(20,20,24,0.6)';
    g.lineWidth = 0.6 * PX;
    g.beginPath();
    g.arc(512, 512, 26.4 * PX, a0, a0 + Math.PI / 60);
    g.stroke();
  }
  // LED strips in the floor (emissive)
  e.lineWidth = 0.12 * PX;
  e.strokeStyle = '#2ee8ff';
  e.beginPath();
  e.arc(512, 512, 12 * PX, 0, Math.PI * 2);
  e.stroke();
  e.strokeStyle = '#ff3ad0';
  e.beginPath();
  e.arc(512, 512, 24.6 * PX, 0, Math.PI * 2);
  e.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    e.strokeStyle = i % 2 ? '#2ee8ff' : '#ff3ad0';
    e.beginPath();
    e.moveTo(512 + Math.cos(a) * 12.5 * PX, 512 + Math.sin(a) * 12.5 * PX);
    e.lineTo(512 + Math.cos(a) * 24 * PX, 512 + Math.sin(a) * 24 * PX);
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
      fog: [0x0b0f22, 0.0055],
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
    towerTex.repeat.set(12, 4);
    const R = ARENA.wallRadius + 1.5;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 90, 48, 1, true), new THREE.MeshBasicMaterial({ map: towerTex }));
    tower.position.y = -45;
    arena.add(tower);

    // parapet with a neon top strip
    const parapetR = ARENA.wallRadius + 0.7;
    instanced(arena, new THREE.BoxGeometry(2.5, 1, 0.5), toon(0x3a3e4a), 72, (i, m) => {
      const a = (i / 72) * Math.PI * 2;
      compose(m, Math.sin(a) * parapetR, 0.5, Math.cos(a) * parapetR, 0, a, 0);
    });
    for (const [y, color] of [[1.04, 0x2ee8ff], [0.3, 0xff3ad0]]) {
      const strip = new THREE.Mesh(new THREE.TorusGeometry(parapetR - 0.27, 0.05, 6, 160), new THREE.MeshBasicMaterial({ color }));
      strip.rotation.x = Math.PI / 2;
      strip.position.y = y;
      arena.add(strip);
    }
    addBarrier(arena, { colorA: 0x2ee8ff, colorB: 0xff3ad0, strength: 0.8 });

    // rooftop clutter: AC units, a water tank and an antenna mast
    const metal = toon(0x5a5f6a);
    const dark = toon(0x2a2d36);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      const x = Math.sin(a) * 21.5;
      const z = Math.cos(a) * 21.5;
      prop(arena, new THREE.BoxGeometry(1.9, 1.25, 1.5), metal, x, 0.62, z, { rot: [0, a, 0] });
      prop(arena, new THREE.CylinderGeometry(0.55, 0.55, 0.08, 16), dark, x, 1.28, z);
      arena.colliders.push({ x, z, r: 1.15, low: true });
    }
    const tx = Math.sin(2.75) * 23.5;
    const tz = Math.cos(2.75) * 23.5;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) prop(arena, new THREE.CylinderGeometry(0.1, 0.1, 2.2, 6), dark, tx + dx, 1.1, tz + dz);
    prop(arena, new THREE.CylinderGeometry(1.6, 1.6, 2.8, 16), toon(0x6a5a4a), tx, 3.6, tz);
    prop(arena, new THREE.ConeGeometry(1.7, 0.8, 16), dark, tx, 5.4, tz);
    arena.colliders.push({ x: tx, z: tz, r: 1.7 });
    const ax = Math.sin(4.6) * 24;
    const az = Math.cos(4.6) * 24;
    prop(arena, new THREE.CylinderGeometry(0.12, 0.22, 13, 6), dark, ax, 6.5, az);
    for (let i = 1; i < 4; i++) prop(arena, new THREE.BoxGeometry(1.6 - i * 0.3, 0.06, 0.06), dark, ax, i * 3.2, az, { shadow: false });
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff2a3a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    beacon.position.set(ax, 13.1, az);
    beacon.scale.setScalar(1.6);
    arena.add(beacon);
    arena.colliders.push({ x: ax, z: az, r: 0.45 });

    // holographic billboards on the roof edge
    const signs = [
      ['KUROKAZE', '#2ee8ff', 'BLADES · EST. 2189', 0.45],
      ['RIFT//NET', '#ff3ad0', 'LIVE ARENA FEED', 2.2],
      ['NEON RAMEN', '#ffc428', 'OPEN 24/7', 3.9],
      ['GALE TECH', '#7cff7a', 'MOVE FASTER', 5.4],
    ];
    for (const [text, color, sub, a] of signs) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: signTexture(arena, text, color, sub) }, uTime: { value: 0 }, uSeed: { value: a * 7 }, uDim: { value: 1 } },
        vertexShader: UV_VERT,
        fragmentShader: SIGN_FRAG,
        transparent: true,
        side: THREE.DoubleSide,
      });
      arena.timed(mat);
      arena.dimmed(mat, 0.5);
      const r = 35;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.5), mat);
      sign.position.set(Math.sin(a) * r, 8, Math.cos(a) * r);
      sign.lookAt(0, 8, 0);
      arena.add(sign);
      for (const sx of [-4, 4]) {
        const px = sign.position.x + Math.cos(a) * sx;
        const pz = sign.position.z - Math.sin(a) * sx;
        prop(arena, new THREE.CylinderGeometry(0.15, 0.15, 6, 6), dark, px, 2.5, pz, { shadow: false });
      }
    }

    // the city: instanced towers from a handful of templates (UVs scaled so windows stay square)
    const roofMat = new THREE.MeshBasicMaterial({ color: 0x0a0c14 });
    const sideMat = new THREE.MeshBasicMaterial({ map: win });
    const templates = [[10, 50], [14, 80], [18, 110], [12, 140], [22, 70], [16, 170]];
    for (let ti = 0; ti < templates.length; ti++) {
      const [w, h] = templates[ti];
      const geo = new THREE.BoxGeometry(w, h, w);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 16), uv.getY(i) * (h / 32));
      instanced(arena, geo, [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat], 14, (i, m) => {
        const a = rand() * Math.PI * 2;
        const near = h < 90;
        const r = near ? 50 + rand() * 60 : 110 + rand() * 150;
        compose(m, Math.sin(a) * r, -95 + h / 2, Math.cos(a) * r, 0, rand() * 3, 0);
      }, { shadow: false });
    }
    // flying traffic
    const cars = [];
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: [0xffffff, 0xff4a5a, 0x5ae8ff][i % 3], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.scale.setScalar(1.4 + rand());
      arena.add(s);
      cars.push({ s, r: 55 + rand() * 80, y: 6 + rand() * 34, speed: (rand() < 0.5 ? -1 : 1) * (0.05 + rand() * 0.08), phase: rand() * 6.28 });
    }

    addWeather(arena, { count: 1500, radius: 32, height: 24, speed: 24, sway: 0.08, size: 0.75, colors: [0x9ec8ff, 0xc8dcff], kind: 'rain', additive: true, opacity: 0.32, seed: 9 });

    arena.onUpdate((t) => {
      beacon.material.opacity = Math.sin(t * 3) > 0.2 ? 1 : 0.15;
      for (const c of cars) {
        const a = c.phase + t * c.speed;
        c.s.position.set(Math.sin(a) * c.r, c.y + Math.sin(t * 0.5 + c.phase) * 1.5, Math.cos(a) * c.r);
      }
    });
  },
};
