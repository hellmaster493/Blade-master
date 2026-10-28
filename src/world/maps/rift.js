// RIFT SANCTUM: a floating stone platform under a torn night sky (the original arena),
// laid out as rings: an inner sanctum of rune pillars, ruined gateways, broken walls and rift
// crystals in the middle ring, and shattered pillars around the rim.
import * as THREE from 'three';
import { ARENA } from '../../config.js';
import { toon, glowTexture } from '../materials.js';
import { makeCanvas, canvasTexture, skyShader, addBarrier, addGround, addWeather, instanced, compose, prop, rng, GROUND_TEX, GROUND_PX } from './common.js';

function groundTextures(arena, rand) {
  const S = GROUND_TEX;
  const C = S / 2;
  const PX = GROUND_PX;
  const base = makeCanvas(S);
  const glow = makeCanvas(S);
  const g = base.getContext('2d');
  const e = glow.getContext('2d');
  g.fillStyle = '#2a2b36';
  g.fillRect(0, 0, S, S);
  e.fillStyle = '#000';
  e.fillRect(0, 0, S, S);
  // concentric tile rings with radial seams (about 2 m per ring)
  const rings = Math.round((ARENA.wallRadius + 1.5) / 2.05);
  for (let r = 0; r < rings; r++) {
    const r0 = (r / rings) * C;
    const r1 = ((r + 1) / rings) * C;
    const segs = 6 + r * 6;
    const outer = r / rings > 0.82;
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2 + r * 0.3;
      const a1 = ((s + 1) / segs) * Math.PI * 2 + r * 0.3;
      const shade = (outer ? 30 : 38) + Math.floor(rand() * 18);
      g.fillStyle = `rgb(${shade},${shade + 1},${shade + 10})`;
      g.beginPath();
      g.arc(C, C, r1 - 2, a0 + 0.004, a1 - 0.004);
      g.arc(C, C, r0 + 2, a1 - 0.004, a0 + 0.004, true);
      g.closePath();
      g.fill();
    }
  }
  // grime
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(0,0,0,${rand() * 0.12})`;
    g.fillRect(rand() * S, rand() * S, 2 + rand() * 8, 2 + rand() * 8);
  }
  // cracks; the ones in the outer ring glow with rift light
  const crack = (x, y, n, glowing) => {
    let a = rand() * 6.28;
    g.beginPath();
    e.beginPath();
    g.moveTo(x, y);
    e.moveTo(x, y);
    for (let k = 0; k < n; k++) {
      a += (rand() - 0.5) * 1.2;
      x += Math.cos(a) * 0.9 * PX;
      y += Math.sin(a) * 0.9 * PX;
      g.lineTo(x, y);
      e.lineTo(x, y);
    }
    g.strokeStyle = 'rgba(10,8,16,0.6)';
    g.lineWidth = 2.5;
    g.stroke();
    if (glowing) {
      e.strokeStyle = rand() < 0.5 ? '#a04bff' : '#ff3c8a';
      e.lineWidth = 2 + rand() * 2;
      e.stroke();
    }
  };
  for (let i = 0; i < 110; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * C * 0.95;
    crack(C + Math.cos(a) * r, C + Math.sin(a) * r, 5 + ((rand() * 6) | 0), r > C * 0.78 && rand() < 0.7);
  }
  return { map: canvasTexture(arena, base), emissiveMap: canvasTexture(arena, glow) };
}

function sigilTexture(arena) {
  const size = 1024;
  const c = makeCanvas(size);
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
  return canvasTexture(arena, c);
}

const SKY = skyShader(/* glsl */ `
  vec3 horizon = vec3(0.16, 0.1, 0.24);
  vec3 zenith = vec3(0.015, 0.02, 0.06);
  col = mix(horizon, zenith, pow(max(h, 0.0), 0.55));
  col = mix(col, vec3(0.03, 0.02, 0.05), smoothstep(0.0, -0.3, h));
  col += vec3(0.8, 0.85, 1.0) * stars(d, 260.0, uTime) * smoothstep(0.05, 0.4, h);
  // the rift: a glowing tear across the sky
  vec3 rc = normalize(vec3(0.35, 0.55, -0.75));
  vec3 ax = normalize(cross(rc, vec3(0.2, 1.0, 0.1)));
  vec3 ay = normalize(cross(ax, rc));
  float u = dot(d, ax);
  float v = dot(d, ay);
  float facing = step(0.0, dot(d, rc));
  float wobble = sin(u * 18.0 + uTime * 0.6) * 0.012 + sin(u * 41.0 - uTime) * 0.006;
  float len = smoothstep(0.75, 0.0, abs(u));
  float width = 0.018 + 0.05 * len;
  float core = smoothstep(width, 0.0, abs(v - wobble)) * len * facing;
  float glow = smoothstep(width * 7.0, 0.0, abs(v - wobble)) * len * facing;
  col += vec3(1.0, 0.2, 0.42) * glow * 0.55 + vec3(1.0, 0.85, 0.95) * core * 1.4;
  col += vec3(0.45, 0.1, 0.6) * smoothstep(0.6, 0.0, length(vec2(u, v * 2.0))) * 0.35 * facing;
`);

const polar = (a, r) => [Math.sin(a) * r, Math.cos(a) * r];

export default {
  id: 'rift',
  name: 'RIFT SANCTUM',
  tagline: 'Floating ruins under a torn sky',
  swatch: ['#1a1030', '#ff3c6a'],
  exposure: 1.15,
  build(arena) {
    const rand = rng(11);
    arena.setLighting({
      fog: [0x120f22, 0.0085],
      hemi: [0x8da0e6, 0x2b1d36, 1.25],
      sun: [0xd6e0ff, 2.4, [-18, 34, 16]],
      accent: [0xff4f8a, 0.7, [12, 18, -24]],
    });
    arena.setSky(SKY);

    // platform, cliff and rim
    const R = ARENA.wallRadius + 1.5;
    addGround(arena, new THREE.MeshStandardMaterial({ ...groundTextures(arena, rand), emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.92, metalness: 0.05 }));
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.55, 12, 72, 3, true), toon(0x24222f));
    cliff.position.y = -6;
    arena.add(cliff);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.3, 6, 128), toon(0x3a3747));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.02;
    arena.add(rim);
    const sigilMat = new THREE.MeshBasicMaterial({ map: sigilTexture(arena), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 });
    const sigil = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), sigilMat);
    sigil.rotation.x = -Math.PI / 2;
    sigil.position.y = 0.025;
    sigil.renderOrder = 2;
    arena.add(sigil);

    const stone = toon(0x4a4758);
    const stoneDark = toon(0x2f2d3b);
    const runeGlow = new THREE.MeshBasicMaterial({ color: 0xff3c6a });
    const flames = [];
    const brazier = (x, z, color) => {
      prop(arena, new THREE.CylinderGeometry(0.55, 0.3, 0.5, 8), stoneDark, x, 1.25, z);
      prop(arena, new THREE.CylinderGeometry(0.12, 0.2, 1.0, 6), stoneDark, x, 0.5, z);
      arena.colliders.push({ x, z, r: 0.6, low: true });
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      flame.position.set(x, 1.9, z);
      flame.scale.set(1.6, 2.2, 1);
      arena.add(flame);
      flames.push({ sprite: flame, seed: rand() * 10 });
    };

    // ---- inner sanctum: six rune pillars with braziers between them
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.26;
      const [x, z] = polar(a, 16);
      const h = 4 + (i % 3) * 1.6;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      prop(arena, new THREE.CylinderGeometry(1.25, 1.4, 0.6, 8), stoneDark, 0, 0.3, 0, { parent: g });
      prop(arena, new THREE.CylinderGeometry(0.8, 0.95, h, 8), stone, 0, 0.6 + h / 2, 0, { parent: g });
      prop(arena, new THREE.CylinderGeometry(0.95, 0.75, 0.5, 8, 1), stoneDark, 0, 0.7 + h, 0, { parent: g, rot: [0, 0, (i % 2 ? 1 : -1) * 0.15] });
      prop(arena, new THREE.BoxGeometry(0.12, h * 0.5, 0.05), runeGlow, 0, 0.6 + h * 0.45, 0.84, { parent: g, shadow: false });
      g.lookAt(0, 0, 0);
      arena.add(g);
      arena.colliders.push({ x, z, r: 1.15 });
      brazier(...polar(a + Math.PI / 6, 18.5), i % 2 ? 0xff4a7a : 0x7a6bff);
    }

    // ---- middle ring: four ruined gateways (one has collapsed)
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const [cx, cz] = polar(a, 29);
      const g = new THREE.Group();
      g.position.set(cx, 0, cz);
      g.rotation.y = a;
      arena.add(g);
      const fallen = i === 2;
      for (const sx of [-2.4, 2.4]) {
        const h = fallen && sx > 0 ? 2.4 : 6.2;
        prop(arena, new THREE.BoxGeometry(1.1, h, 1.1), stone, sx, h / 2, 0, { parent: g });
        prop(arena, new THREE.BoxGeometry(1.4, 0.5, 1.4), stoneDark, sx, 0.25, 0, { parent: g });
        prop(arena, new THREE.BoxGeometry(0.1, h * 0.55, 0.05), runeGlow, sx, h * 0.5, 0.56, { parent: g, shadow: false });
        const c = Math.cos(a);
        const s = Math.sin(a);
        arena.colliders.push({ x: cx + sx * c, z: cz - sx * s, r: 0.85 });
      }
      if (fallen) {
        prop(arena, new THREE.BoxGeometry(6.2, 0.9, 1.3), stoneDark, 0.8, 0.45, 2.2, { parent: g, rot: [0, 0.5, 0.12] });
      } else {
        prop(arena, new THREE.BoxGeometry(6.6, 0.9, 1.4), stoneDark, 0, 6.6, 0, { parent: g });
      }
    }

    // ---- broken wall arcs between the gateways (waist to head height: good cover)
    const blocks = [];
    for (let i = 0; i < 4; i++) {
      const mid = (i * Math.PI) / 2;
      const r = 35.5 + (i % 2) * 1.2;
      for (let k = -5; k <= 5; k++) {
        if (rand() < 0.22) continue; // gaps you can run through
        const a = mid + k * 0.047;
        const h = 0.9 + rand() * 1.4;
        const [x, z] = polar(a, r);
        blocks.push([x, z, a, h]);
        arena.colliders.push({ x, z, r: 0.95, low: h < 2 });
      }
    }
    instanced(arena, new THREE.BoxGeometry(1.75, 1, 0.9), toon(0x3a3747), blocks.length, (i, m) => {
      const [x, z, a, h] = blocks[i];
      compose(m, x, h / 2, z, (rand() - 0.5) * 0.08, a, (rand() - 0.5) * 0.1, 1, h, 1);
    });

    // ---- rift crystals breaking through the floor
    const crystalMat = toon(0xb07cff, { emissive: 0x4a1a8a });
    const shards = [];
    const glows = [];
    const spots = [[0.9, 24], [2.0, 33], [2.75, 22], [3.6, 31], [4.5, 25], [5.3, 34], [6.05, 30]];
    for (const [a, r] of spots) {
      const [cx, cz] = polar(a, r);
      const n = 4 + ((rand() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const h = k === 0 ? 3.6 + rand() : 1.2 + rand() * 1.8;
        shards.push([cx + (k ? (rand() - 0.5) * 1.6 : 0), h * 0.42, cz + (k ? (rand() - 0.5) * 1.6 : 0), (rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.5, 0.38 + rand() * 0.2, h * 0.5]);
      }
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xa04bff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
      s.position.set(cx, 1, cz);
      s.scale.set(4.5, 2.8, 1);
      arena.add(s);
      glows.push(s);
      arena.colliders.push({ x: cx, z: cz, r: 1.15 });
    }
    instanced(arena, new THREE.OctahedronGeometry(1, 0), crystalMat, shards.length, (i, m) => {
      const [x, y, z, rx, ry, rz, w, h] = shards[i];
      compose(m, x, y, z, rx, ry, rz, w, h, w);
    });

    // ---- the rim: shattered pillars and braziers
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.1;
      const [x, z] = polar(a, 41.5);
      const h = 3 + rand() * 5;
      prop(arena, new THREE.CylinderGeometry(0.75, 0.95, h, 8), stone, x, h / 2, z, { rot: [(rand() - 0.5) * 0.15, rand() * 3, (rand() - 0.5) * 0.15] });
      prop(arena, new THREE.CylinderGeometry(1.2, 1.35, 0.5, 8), stoneDark, x, 0.25, z);
      arena.colliders.push({ x, z, r: 1.1 });
      brazier(...polar(a + Math.PI / 8, 41), i % 2 ? 0xff4a7a : 0x7a6bff);
    }

    // barrier + low broken wall stones along the edge
    addBarrier(arena, { colorA: 0x8c33ff, colorB: 0xff4073 });
    const n = 110;
    instanced(arena, new THREE.BoxGeometry(1.6, 0.7, 0.8), toon(0x35323f), n, (i, m) => {
      if (i % 9 === 4) return false;
      const a = (i / n) * Math.PI * 2;
      compose(m, Math.sin(a) * (ARENA.wallRadius + 0.6), 0.3, Math.cos(a) * (ARENA.wallRadius + 0.6), 0, a, 0, 1, 0.6 + ((i * 7) % 5) * 0.15, 1);
    });

    // floating rocks and distant spires give the void some depth
    const rockMat = toon(0x2b2836);
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rocks = [];
    for (let i = 0; i < 34; i++) {
      const a = rand() * Math.PI * 2;
      const r = 62 + rand() * 80;
      const rock = new THREE.Mesh(rockGeo, rockMat);
      const s = 1.8 + rand() * 6;
      rock.scale.set(s, s * (0.6 + rand() * 0.8), s);
      rock.position.set(Math.sin(a) * r, -8 + rand() * 30, Math.cos(a) * r);
      rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      arena.add(rock);
      rocks.push({ mesh: rock, base: rock.position.y, seed: rand() * 10 });
    }
    const spireMat = toon(0x1a1826);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + rand() * 0.2;
      const r = 180 + rand() * 60;
      const h = 34 + rand() * 66;
      prop(arena, new THREE.ConeGeometry(9 + rand() * 11, h, 5), spireMat, Math.sin(a) * r, -20 + h / 2, Math.cos(a) * r, { shadow: false });
    }

    addWeather(arena, { count: 280, radius: 28, height: 16, speed: 0.7, sway: 0.9, size: 0.09, colors: [0xa04bff, 0xff4f8a, 0x7fc8ff], kind: 'soft', additive: true, rise: true, opacity: 0.7, seed: 3 });

    arena.onUpdate((t) => {
      sigilMat.opacity = (0.42 + 0.12 * Math.sin(t * 1.3)) * (0.6 + 0.4 * arena.dim);
      sigil.rotation.z = t * 0.03;
      for (const f of flames) {
        const k = Math.sin(t * 9 + f.seed) * 0.5 + Math.sin(t * 13.7 + f.seed * 2) * 0.5;
        f.sprite.scale.set(1.5 + k * 0.15, 2.1 + k * 0.3, 1);
      }
      for (let i = 0; i < glows.length; i++) glows[i].material.opacity = 0.55 + 0.2 * Math.sin(t * 1.3 + i);
      for (const r of rocks) r.mesh.position.y = r.base + Math.sin(t * 0.3 + r.seed) * 0.8;
    });
  },
};
