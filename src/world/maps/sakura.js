// SAKURA SHRINE: a moonlit shrine courtyard at dusk. Raked gravel, stone lanterns,
// vermilion torii gates and cherry trees shedding petals.
import * as THREE from 'three';
import { ARENA } from '../../config.js';
import { toon, glowTexture } from '../materials.js';
import { makeCanvas, canvasTexture, skyShader, addBarrier, addGround, addWeather, instanced, compose, prop, rng } from './common.js';

const PX = 1024 / (2 * (ARENA.wallRadius + 1.5)); // ground texture pixels per metre

function groundTexture(arena, rand) {
  const size = 1024;
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  // flagstones in staggered rows
  g.fillStyle = '#2e2a30';
  g.fillRect(0, 0, size, size);
  const rowH = 1.25 * PX;
  for (let y = 0, row = 0; y < size; y += rowH, row++) {
    let x = -(row % 2) * 0.7 * PX;
    while (x < size) {
      const w = (1.1 + rand() * 1.1) * PX;
      const s = 92 + Math.floor(rand() * 26);
      g.fillStyle = `rgb(${s + 6},${s},${s + 8})`;
      g.fillRect(x + 1.5, y + 1.5, w - 3, rowH - 3);
      x += w;
    }
  }
  // moss creeping in from the edge and scattered fallen petals
  for (let i = 0; i < 1800; i++) {
    const a = rand() * Math.PI * 2;
    const r = (0.62 + rand() * 0.4) * 512;
    g.fillStyle = `rgba(${60 + rand() * 30},${80 + rand() * 30},${50},${0.08 + rand() * 0.12})`;
    g.beginPath();
    g.arc(512 + Math.cos(a) * r, 512 + Math.sin(a) * r, 3 + rand() * 10, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 2600; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.pow(rand(), 0.5) * 520;
    g.fillStyle = `rgba(255,${160 + rand() * 50},${190 + rand() * 40},${0.25 + rand() * 0.45})`;
    g.save();
    g.translate(512 + Math.cos(a) * r, 512 + Math.sin(a) * r);
    g.rotate(rand() * 3);
    g.fillRect(-2, -1, 4, 2);
    g.restore();
  }
  // raked gravel garden in the centre with a stone border
  const gr = 9 * PX;
  g.fillStyle = '#8e8893';
  g.beginPath();
  g.arc(512, 512, gr, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(52,46,60,0.5)';
  g.lineWidth = 1.6;
  for (let r = 6; r < gr; r += 6) {
    g.beginPath();
    g.arc(512, 512, r, 0, Math.PI * 2);
    g.stroke();
  }
  for (let i = 0; i < 1400; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * gr;
    g.fillStyle = `rgba(255,255,255,${rand() * 0.14})`;
    g.fillRect(512 + Math.cos(a) * r, 512 + Math.sin(a) * r, 1.5, 1.5);
  }
  g.lineWidth = 0.6 * PX;
  g.strokeStyle = '#4d4652';
  g.beginPath();
  g.arc(512, 512, gr + 0.3 * PX, 0, Math.PI * 2);
  g.stroke();
  // stepping stones from the garden towards the main gate (world +z is the canvas bottom)
  for (let i = 0; i < 9; i++) {
    const y = 512 + gr + (1.2 + i * 1.75) * PX;
    const x = 512 + Math.sin(i * 1.3) * 0.5 * PX;
    g.fillStyle = '#857d8a';
    g.beginPath();
    g.ellipse(x, y, 0.75 * PX, 0.55 * PX, rand(), 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(30,24,34,0.6)';
    g.lineWidth = 2;
    g.stroke();
  }
  return canvasTexture(arena, c);
}

const SKY = skyShader(/* glsl */ `
  float hh = max(h, 0.0);
  col = mix(vec3(1.0, 0.56, 0.52), vec3(0.47, 0.22, 0.46), smoothstep(0.0, 0.2, hh));
  col = mix(col, vec3(0.06, 0.05, 0.17), smoothstep(0.16, 0.75, hh));
  col = mix(col, vec3(0.14, 0.08, 0.16), smoothstep(0.0, -0.25, h));
  col += vec3(1.0, 0.9, 0.95) * stars(d, 240.0, uTime) * smoothstep(0.35, 0.75, hh) * 0.8;
  // a huge full moon over the main gate
  vec3 md = normalize(vec3(-0.42, 0.3, 0.86));
  float m = dot(d, md);
  float disc = smoothstep(0.9974, 0.9981, m);
  float halo = pow(max(m, 0.0), 160.0) * 0.55 + pow(max(m, 0.0), 14.0) * 0.16;
  float mottle = 0.86 + 0.14 * fbm(d.xy * 90.0);
  col = mix(col, vec3(1.0, 0.95, 0.9) * mottle, disc);
  col += vec3(1.0, 0.72, 0.8) * halo;
  // soft clouds lit pink by the moon
  vec2 cp = d.xz / max(d.y + 0.15, 0.05);
  float cl = fbm(cp * 0.9 + vec2(uTime * 0.012, 0.0));
  float cloud = smoothstep(0.55, 0.82, cl) * smoothstep(0.02, 0.22, hh) * smoothstep(0.75, 0.3, hh);
  col = mix(col, vec3(0.95, 0.62, 0.74) * (0.55 + halo * 2.0), cloud * 0.55);
`);

function torii(arena, x, z, rotY, s) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  arena.add(g);
  const red = toon(0xc8202c);
  const black = toon(0x1c1418);
  const o = { parent: g };
  for (const sx of [-1, 1]) {
    prop(arena, new THREE.CylinderGeometry(0.4 * s, 0.46 * s, 7.4 * s, 12), red, sx * 3.1 * s, 3.7 * s, 0, o);
    prop(arena, new THREE.CylinderGeometry(0.55 * s, 0.6 * s, 0.6 * s, 12), black, sx * 3.1 * s, 0.3 * s, 0, o);
    // upswept ends of the top beam
    prop(arena, new THREE.BoxGeometry(1.6 * s, 0.5 * s, 0.95 * s), black, sx * 5.0 * s, 7.95 * s, 0, { parent: g, rot: [0, 0, sx * 0.16] });
  }
  prop(arena, new THREE.BoxGeometry(8.6 * s, 0.55 * s, 0.95 * s), black, 0, 7.85 * s, 0, o); // kasagi
  prop(arena, new THREE.BoxGeometry(8.9 * s, 0.4 * s, 0.75 * s), red, 0, 7.4 * s, 0, o); // shimaki
  prop(arena, new THREE.BoxGeometry(8.2 * s, 0.38 * s, 0.45 * s), red, 0, 5.9 * s, 0, o); // nuki
  prop(arena, new THREE.BoxGeometry(0.45 * s, 1.2 * s, 0.4 * s), red, 0, 6.65 * s, 0, o); // gakuzuka
  // the posts keep the camera out
  const c = Math.cos(rotY);
  const sn = Math.sin(rotY);
  for (const sx of [-1, 1]) arena.colliders.push({ x: x + sx * 3.1 * s * c, z: z - sx * 3.1 * s * sn, r: 0.55 * s });
}

function lantern(arena, x, z, stone, glowMat, sprites) {
  const parts = [
    [new THREE.CylinderGeometry(0.45, 0.55, 0.3, 6), 0.15],
    [new THREE.CylinderGeometry(0.16, 0.2, 0.9, 6), 0.75],
    [new THREE.CylinderGeometry(0.5, 0.4, 0.18, 6), 1.28],
    [new THREE.ConeGeometry(0.64, 0.42, 6), 2.08],
    [new THREE.SphereGeometry(0.1, 8, 6), 2.36],
  ];
  for (const [geo, y] of parts) prop(arena, geo, stone, x, y, z);
  prop(arena, new THREE.BoxGeometry(0.5, 0.48, 0.5), glowMat, x, 1.62, z, { shadow: false });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffa860, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
  s.position.set(x, 1.65, z);
  s.scale.setScalar(1.8);
  arena.add(s);
  sprites.push({ s, seed: x * 3.1 + z });
  arena.colliders.push({ x, z, r: 0.55, low: true });
}

export default {
  id: 'sakura',
  name: 'SAKURA SHRINE',
  tagline: 'Moonlit courtyard, falling petals',
  swatch: ['#3a2048', '#ffb7d0'],
  exposure: 1.1,
  build(arena) {
    const rand = rng(23);
    arena.setLighting({
      fog: [0x40243f, 0.0095],
      hemi: [0xffc4dc, 0x2a1830, 1.2],
      sun: [0xffd8cc, 2.1, [-14, 30, 28]],
      accent: [0x9a7cff, 0.55, [16, 14, -20]],
    });
    arena.setSky(SKY);
    addGround(arena, new THREE.MeshStandardMaterial({ map: groundTexture(arena, rand), roughness: 0.95, metalness: 0 }));
    const R = ARENA.wallRadius + 1.5;
    const earth = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 6, 2, 64, 1, true), toon(0x2b2230));
    earth.position.y = -1;
    arena.add(earth);
    // grassy outer grounds beyond the wall
    const lawn = new THREE.Mesh(new THREE.RingGeometry(R - 0.1, 140, 64, 1), toon(0x3a3548));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -0.02;
    lawn.receiveShadow = true;
    arena.add(lawn);

    // sacred rope fence around the courtyard
    const fenceR = ARENA.wallRadius + 0.6;
    instanced(arena, new THREE.BoxGeometry(0.28, 0.95, 0.28), toon(0x5a4a44), 72, (i, m) => {
      const a = (i / 72) * Math.PI * 2;
      compose(m, Math.sin(a) * fenceR, 0.47, Math.cos(a) * fenceR, 0, a, 0);
    });
    const rope = new THREE.Mesh(new THREE.TorusGeometry(fenceR, 0.06, 6, 160), toon(0xe8dcc4));
    rope.rotation.x = Math.PI / 2;
    rope.position.y = 0.8;
    arena.add(rope);
    addBarrier(arena, { colorA: 0xff8fc0, colorB: 0xfff0f6, strength: 0.55 });

    // the main gate ahead and a smaller one behind
    torii(arena, 0, ARENA.wallRadius + 1.6, 0, 1.15);
    torii(arena, 0, -(ARENA.wallRadius + 1.4), Math.PI, 0.85);

    // stone lanterns
    const stone = toon(0x8a8590);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffc27a });
    const flames = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      lantern(arena, Math.sin(a) * 22.5, Math.cos(a) * 22.5, stone, glowMat, flames);
    }

    // cherry trees outside the fence: one instanced mesh holds every blossom cluster
    const bark = toon(0x4a3034);
    const blooms = [];
    const treeAngles = [0.6, 1.25, 1.95, 2.55, 3.75, 4.35, 5.05, 5.7];
    for (const a of treeAngles) {
      const r = 31 + rand() * 3.5;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      const h = 4.2 + rand() * 1.4;
      const lean = (rand() - 0.5) * 0.25;
      prop(arena, new THREE.CylinderGeometry(0.32, 0.55, h, 7), bark, x, h / 2, z, { rot: [lean, 0, lean] });
      const top = new THREE.Vector3(x, h, z);
      for (let b = 0; b < 3; b++) {
        const ba = rand() * Math.PI * 2;
        const len = 2.2 + rand() * 1.2;
        const dir = new THREE.Vector3(Math.cos(ba), 0.8, Math.sin(ba)).normalize();
        const mid = top.clone().addScaledVector(dir, len / 2);
        const br = prop(arena, new THREE.CylinderGeometry(0.1, 0.2, len, 6), bark, mid.x, mid.y, mid.z);
        br.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        blooms.push([top.clone().addScaledVector(dir, len), 1.5 + rand() * 0.8]);
      }
      for (let b = 0; b < 5; b++) {
        blooms.push([new THREE.Vector3(x + (rand() - 0.5) * 3, h + 0.6 + rand() * 1.6, z + (rand() - 0.5) * 3), 1.4 + rand() * 1.0]);
      }
    }
    const pinks = [0xf4a6c6, 0xffc1d9, 0xe98ab4, 0xffd6e6];
    instanced(arena, new THREE.IcosahedronGeometry(1, 1), toon(0xffffff), blooms.length, (i, m) => {
      const [p, s] = blooms[i];
      compose(m, p.x, p.y, p.z, rand(), rand(), rand(), s, s * 0.72, s);
    }, { colors: () => new THREE.Color(pinks[(rand() * pinks.length) | 0]) });

    // shrine hall beyond the main gate, a pagoda and distant hills
    const wood = toon(0x5a2a26);
    const roof = toon(0x2a2232);
    const plinth = toon(0x6a6470);
    prop(arena, new THREE.BoxGeometry(16, 1.2, 11), plinth, 0, 0.6, 58);
    prop(arena, new THREE.BoxGeometry(11, 4.2, 7.5), wood, 0, 3.3, 58);
    const hallRoof = prop(arena, new THREE.ConeGeometry(10, 3.6, 4), roof, 0, 7.2, 58, { rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.72] });
    hallRoof.castShadow = false;
    prop(arena, new THREE.ConeGeometry(5.5, 2.4, 4), roof, 0, 9.4, 58, { rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.72] });
    for (const sx of [-1, 1]) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffa860, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.position.set(sx * 3.2, 4.4, 53.9);
      s.scale.setScalar(2.4);
      arena.add(s);
    }
    const px = -46;
    const pz = 76;
    for (let t = 0; t < 4; t++) {
      const y = 2 + t * 5;
      const w = 7 - t * 1.2;
      prop(arena, new THREE.BoxGeometry(w * 0.7, 4, w * 0.7), wood, px, y + 2, pz, { shadow: false });
      prop(arena, new THREE.ConeGeometry(w, 1.6, 4), roof, px, y + 4.6, pz, { rot: [0, Math.PI / 4, 0], shadow: false });
    }
    prop(arena, new THREE.CylinderGeometry(0.12, 0.2, 6, 6), roof, px, 25, pz, { shadow: false });
    const hill = toon(0x2e2240);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rand() * 0.2;
      const r = 170 + rand() * 90;
      const h = 40 + rand() * 55;
      prop(arena, new THREE.ConeGeometry(45 + rand() * 40, h, 6), hill, Math.sin(a) * r, h / 2 - 6, Math.cos(a) * r, { shadow: false });
    }

    addWeather(arena, { count: 650, radius: 34, height: 18, speed: 0.9, sway: 1.4, size: 0.22, colors: [0xffb7d0, 0xff9cc0, 0xffe0ec], kind: 'petal', opacity: 0.95, seed: 5 });

    arena.onUpdate((t) => {
      for (const f of flames) {
        const n = Math.sin(t * 7 + f.seed) * 0.5 + Math.sin(t * 11.3 + f.seed * 2) * 0.5;
        f.s.scale.setScalar(1.75 + n * 0.12);
      }
    });
  },
};
