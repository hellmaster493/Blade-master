// SAKURA SHRINE: a moonlit shrine courtyard at dusk. A raked gravel garden at the centre,
// a lantern-lined path through two torii to the main gate, a koi pond, a bell tower, a
// kagura dance stage and cherry trees shedding petals.
import * as THREE from 'three';
import { ARENA } from '../../config.js';
import { toon, glowTexture } from '../materials.js';
import { makeCanvas, canvasTexture, skyShader, addBarrier, addGround, addWeather, instanced, compose, prop, rng, GROUND_TEX, GROUND_PX, NOISE_GLSL, UV_VERT } from './common.js';

const POND = { x: -24, z: 12, r: 6.5 };

function groundTexture(arena, rand) {
  const S = GROUND_TEX;
  const C = S / 2;
  const PX = GROUND_PX;
  const c = makeCanvas(S);
  const g = c.getContext('2d');
  const W = (x, z) => [C + x * PX, C + z * PX]; // world (x, z) -> canvas (world +z is the canvas bottom)
  // flagstones in staggered rows
  g.fillStyle = '#2e2a30';
  g.fillRect(0, 0, S, S);
  const rowH = 1.25 * PX;
  for (let y = 0, row = 0; y < S; y += rowH, row++) {
    let x = -(row % 2) * 0.7 * PX;
    while (x < S) {
      const w = (1.1 + rand() * 1.1) * PX;
      const s = 92 + Math.floor(rand() * 26);
      g.fillStyle = `rgb(${s + 6},${s},${s + 8})`;
      g.fillRect(x + 1.5, y + 1.5, w - 3, rowH - 3);
      x += w;
    }
  }
  // the paved path to the main gate: wide, pale, well-worn slabs
  const [px0, pz0] = W(-2.6, 10);
  g.fillStyle = '#a49aa6';
  g.fillRect(px0, pz0, 5.2 * PX, (ARENA.wallRadius - 10) * PX);
  g.strokeStyle = 'rgba(40,34,46,0.55)';
  g.lineWidth = 2;
  for (let z = 10; z < ARENA.wallRadius; z += 1.3) {
    const [, y] = W(0, z);
    g.beginPath();
    g.moveTo(px0, y);
    g.lineTo(px0 + 5.2 * PX, y);
    g.stroke();
  }
  // moss creeping in from the edge, and fallen petals everywhere
  for (let i = 0; i < 6000; i++) {
    const a = rand() * Math.PI * 2;
    const r = (0.62 + rand() * 0.4) * C;
    g.fillStyle = `rgba(${60 + rand() * 30},${80 + rand() * 30},50,${0.08 + rand() * 0.12})`;
    g.beginPath();
    g.arc(C + Math.cos(a) * r, C + Math.sin(a) * r, 3 + rand() * 12, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 9000; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.pow(rand(), 0.5) * C * 1.02;
    g.fillStyle = `rgba(255,${160 + rand() * 50},${190 + rand() * 40},${0.25 + rand() * 0.45})`;
    g.save();
    g.translate(C + Math.cos(a) * r, C + Math.sin(a) * r);
    g.rotate(rand() * 3);
    g.fillRect(-2.5, -1.2, 5, 2.4);
    g.restore();
  }
  // raked gravel garden in the centre with a stone border
  const gr = 11 * PX;
  g.fillStyle = '#8e8893';
  g.beginPath();
  g.arc(C, C, gr, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(52,46,60,0.5)';
  g.lineWidth = 1.8;
  for (let r = 7; r < gr; r += 7) {
    g.beginPath();
    g.arc(C, C, r, 0, Math.PI * 2);
    g.stroke();
  }
  for (let i = 0; i < 3000; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * gr;
    g.fillStyle = `rgba(255,255,255,${rand() * 0.14})`;
    g.fillRect(C + Math.cos(a) * r, C + Math.sin(a) * r, 1.6, 1.6);
  }
  g.lineWidth = 0.6 * PX;
  g.strokeStyle = '#4d4652';
  g.beginPath();
  g.arc(C, C, gr + 0.3 * PX, 0, Math.PI * 2);
  g.stroke();
  // dark wet stone around the koi pond
  const [qx, qz] = W(POND.x, POND.z);
  g.fillStyle = '#3a3540';
  g.beginPath();
  g.arc(qx, qz, (POND.r + 1.4) * PX, 0, Math.PI * 2);
  g.fill();
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

// Dark pond water: drifting ripples, moonlight glints and a soft shore fade.
const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uDim;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float n = fbm(p * 4.0 + vec2(uTime * 0.08, -uTime * 0.05));
    float ripple = 0.5 + 0.5 * sin(r * 26.0 - uTime * 1.6 + n * 4.0);
    vec3 col = mix(vec3(0.03, 0.08, 0.12), vec3(0.08, 0.2, 0.26), n);
    col += vec3(0.6, 0.55, 0.7) * pow(ripple, 18.0) * 0.18;
    col += vec3(1.0, 0.85, 0.9) * smoothstep(0.82, 0.95, fbm(p * 9.0 - uTime * 0.2)) * 0.35;
    float a = smoothstep(1.0, 0.92, r);
    gl_FragColor = vec4(col * (0.6 + 0.4 * uDim), a * 0.95);
  }`;

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
    prop(arena, new THREE.BoxGeometry(1.6 * s, 0.5 * s, 0.95 * s), black, sx * 5.0 * s, 7.95 * s, 0, { parent: g, rot: [0, 0, sx * 0.16] });
  }
  prop(arena, new THREE.BoxGeometry(8.6 * s, 0.55 * s, 0.95 * s), black, 0, 7.85 * s, 0, o); // kasagi
  prop(arena, new THREE.BoxGeometry(8.9 * s, 0.4 * s, 0.75 * s), red, 0, 7.4 * s, 0, o); // shimaki
  prop(arena, new THREE.BoxGeometry(8.2 * s, 0.38 * s, 0.45 * s), red, 0, 5.9 * s, 0, o); // nuki
  prop(arena, new THREE.BoxGeometry(0.45 * s, 1.2 * s, 0.4 * s), red, 0, 6.65 * s, 0, o); // gakuzuka
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
      fog: [0x40243f, 0.0078],
      hemi: [0xffc4dc, 0x2a1830, 1.2],
      sun: [0xffd8cc, 2.1, [-14, 30, 28]],
      accent: [0x9a7cff, 0.55, [16, 14, -20]],
    });
    arena.setSky(SKY);
    addGround(arena, new THREE.MeshStandardMaterial({ map: groundTexture(arena, rand), roughness: 0.95, metalness: 0 }));
    const R = ARENA.wallRadius + 1.5;
    const earth = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 6, 2, 72, 1, true), toon(0x2b2230));
    earth.position.y = -1;
    arena.add(earth);
    const lawn = new THREE.Mesh(new THREE.RingGeometry(R - 0.1, 160, 72, 1), toon(0x3a3548));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -0.02;
    lawn.receiveShadow = true;
    arena.add(lawn);

    // sacred rope fence around the courtyard
    const fenceR = ARENA.wallRadius + 0.6;
    const posts = 130;
    instanced(arena, new THREE.BoxGeometry(0.28, 0.95, 0.28), toon(0x5a4a44), posts, (i, m) => {
      const a = (i / posts) * Math.PI * 2;
      compose(m, Math.sin(a) * fenceR, 0.47, Math.cos(a) * fenceR, 0, a, 0);
    });
    const rope = new THREE.Mesh(new THREE.TorusGeometry(fenceR, 0.06, 6, 220), toon(0xe8dcc4));
    rope.rotation.x = Math.PI / 2;
    rope.position.y = 0.8;
    arena.add(rope);
    addBarrier(arena, { colorA: 0xff8fc0, colorB: 0xfff0f6, strength: 0.55 });

    // gates: the main one ahead, a second one on the path, a smaller one behind
    torii(arena, 0, ARENA.wallRadius + 1.8, 0, 1.3);
    torii(arena, 0, 26, 0, 0.95);
    torii(arena, 0, -(ARENA.wallRadius + 1.4), Math.PI, 0.9);

    // zen stones in the gravel garden
    const rockMat = toon(0x6a6470);
    for (const [a, r, s] of [[2.4, 7, 1.1], [3.4, 6.2, 0.75], [4.6, 7.6, 0.9]]) {
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      prop(arena, new THREE.DodecahedronGeometry(1, 0), rockMat, x, s * 0.45, z, { scale: [s * 1.2, s * 0.8, s], rot: [rand(), rand() * 3, rand()] });
      arena.colliders.push({ x, z, r: s * 1.05, low: true });
    }

    // stone lanterns: lining the path, and around the garden
    const stone = toon(0x8a8590);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffc27a });
    const flames = [];
    for (let z = 14; z <= 40; z += 6.5) for (const x of [-3.8, 3.8]) lantern(arena, x, z, stone, glowMat, flames);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      lantern(arena, Math.sin(a) * 14.5, Math.cos(a) * 14.5, stone, glowMat, flames);
    }

    // koi pond with a stone rim and fish circling under the surface
    const waterMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uDim: { value: 1 } }, vertexShader: UV_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false });
    arena.timed(waterMat);
    arena.dimmed(waterMat, 0.4);
    const water = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 48), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(POND.x, 0.04, POND.z);
    water.renderOrder = 3;
    arena.add(water);
    const pondRim = new THREE.Mesh(new THREE.TorusGeometry(POND.r + 0.15, 0.32, 6, 48), toon(0x5a5460));
    pondRim.rotation.x = Math.PI / 2;
    pondRim.position.set(POND.x, 0.1, POND.z);
    pondRim.receiveShadow = true;
    arena.add(pondRim);
    arena.colliders.push({ x: POND.x, z: POND.z, r: POND.r + 0.2, low: true });
    const koi = [];
    const koiColors = [0xff7a2a, 0xffffff, 0xff4a2a, 0xffb060, 0xf2f2f2];
    for (let i = 0; i < 6; i++) {
      const fish = prop(arena, new THREE.SphereGeometry(0.22, 10, 6), koiColors[i % koiColors.length], 0, 0.02, 0, { scale: [0.5, 0.25, 1.4], shadow: false });
      fish.renderOrder = 4;
      koi.push({ fish, r: 1.5 + rand() * 3.8, speed: (rand() < 0.5 ? -1 : 1) * (0.25 + rand() * 0.35), phase: rand() * 6.28 });
    }

    // bell tower
    const wood = toon(0x5a2a26);
    const roof = toon(0x2a2232);
    const plinth = toon(0x6a6470);
    const bt = { x: 24, z: 16 };
    prop(arena, new THREE.BoxGeometry(4.4, 0.5, 4.4), plinth, bt.x, 0.25, bt.z);
    for (const [dx, dz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) prop(arena, new THREE.CylinderGeometry(0.16, 0.18, 3.6, 8), wood, bt.x + dx, 2.3, bt.z + dz);
    prop(arena, new THREE.ConeGeometry(3.6, 1.6, 4), roof, bt.x, 4.9, bt.z, { rot: [0, Math.PI / 4, 0] });
    prop(arena, new THREE.CylinderGeometry(0.45, 0.6, 1.1, 14), toon(0x8a6a3a), bt.x, 3.3, bt.z);
    arena.colliders.push({ x: bt.x, z: bt.z, r: 2.6 });

    // kagura dance stage: a raised wooden platform under a roof
    const st = { x: -22, z: -20 };
    prop(arena, new THREE.BoxGeometry(7, 0.9, 7), wood, st.x, 0.45, st.z);
    prop(arena, new THREE.BoxGeometry(7.2, 0.08, 7.2), toon(0x7a4a32), st.x, 0.94, st.z);
    for (const [dx, dz] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) prop(arena, new THREE.CylinderGeometry(0.18, 0.2, 4.2, 8), toon(0xc8202c), st.x + dx, 3, st.z + dz);
    prop(arena, new THREE.ConeGeometry(6.2, 2, 4), roof, st.x, 5.9, st.z, { rot: [0, Math.PI / 4, 0] });
    for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) arena.colliders.push({ x: st.x + dx, z: st.z + dz, r: 2.1 });

    // cherry trees: some inside the courtyard, more beyond the fence; one instanced mesh holds every blossom
    const bark = toon(0x4a3034);
    const blooms = [];
    const tree = (x, z, inside) => {
      const h = 4.2 + rand() * 1.6;
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
      for (let b = 0; b < 5; b++) blooms.push([new THREE.Vector3(x + (rand() - 0.5) * 3, h + 0.6 + rand() * 1.6, z + (rand() - 0.5) * 3), 1.4 + rand() * 1.0]);
      if (inside) arena.colliders.push({ x, z, r: 0.6 });
    };
    for (const a of [0.95, 1.55, 2.35, 3.9, 4.6, 5.35]) {
      const r = 30 + rand() * 7;
      tree(Math.sin(a) * r, Math.cos(a) * r, true);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.25;
      if (Math.abs(Math.sin(a)) < 0.18) continue; // keep the gates clear
      const r = 50 + rand() * 7;
      tree(Math.sin(a) * r, Math.cos(a) * r, false);
    }
    const pinks = [0xf4a6c6, 0xffc1d9, 0xe98ab4, 0xffd6e6];
    instanced(arena, new THREE.IcosahedronGeometry(1, 1), toon(0xffffff), blooms.length, (i, m) => {
      const [p, s] = blooms[i];
      compose(m, p.x, p.y, p.z, rand(), rand(), rand(), s, s * 0.72, s);
    }, { colors: () => new THREE.Color(pinks[(rand() * pinks.length) | 0]) });

    // shrine hall beyond the main gate, a pagoda and distant hills
    const hz = 68;
    prop(arena, new THREE.BoxGeometry(18, 1.4, 12), plinth, 0, 0.7, hz, { shadow: false });
    prop(arena, new THREE.BoxGeometry(12.5, 4.8, 8.5), wood, 0, 3.8, hz, { shadow: false });
    prop(arena, new THREE.ConeGeometry(11.5, 4.2, 4), roof, 0, 8.3, hz, { rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.72], shadow: false });
    prop(arena, new THREE.ConeGeometry(6.2, 2.8, 4), roof, 0, 10.8, hz, { rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.72], shadow: false });
    for (const sx of [-1, 1]) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffa860, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.position.set(sx * 3.6, 5, hz - 4.4);
      s.scale.setScalar(2.6);
      arena.add(s);
    }
    const px = -62;
    const pz = 88;
    for (let t = 0; t < 5; t++) {
      const y = 2 + t * 5.5;
      const w = 8 - t * 1.2;
      prop(arena, new THREE.BoxGeometry(w * 0.7, 4.4, w * 0.7), wood, px, y + 2.2, pz, { shadow: false });
      prop(arena, new THREE.ConeGeometry(w, 1.8, 4), roof, px, y + 5, pz, { rot: [0, Math.PI / 4, 0], shadow: false });
    }
    prop(arena, new THREE.CylinderGeometry(0.14, 0.24, 7, 6), roof, px, 32, pz, { shadow: false });
    const hill = toon(0x2e2240);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + rand() * 0.2;
      const r = 200 + rand() * 100;
      const h = 45 + rand() * 60;
      prop(arena, new THREE.ConeGeometry(50 + rand() * 45, h, 6), hill, Math.sin(a) * r, h / 2 - 6, Math.cos(a) * r, { shadow: false });
    }

    addWeather(arena, { count: 650, radius: 28, height: 18, speed: 0.9, sway: 1.4, size: 0.22, colors: [0xffb7d0, 0xff9cc0, 0xffe0ec], kind: 'petal', opacity: 0.95, seed: 5 });

    arena.onUpdate((t) => {
      for (const f of flames) {
        const k = Math.sin(t * 7 + f.seed) * 0.5 + Math.sin(t * 11.3 + f.seed * 2) * 0.5;
        f.s.scale.setScalar(1.75 + k * 0.12);
      }
      for (const k of koi) {
        const a = k.phase + t * k.speed;
        k.fish.position.set(POND.x + Math.sin(a) * k.r, 0.07, POND.z + Math.cos(a) * k.r);
        k.fish.rotation.y = a + (k.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
    });
  },
};
