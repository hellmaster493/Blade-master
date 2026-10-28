// RIFT SANCTUM: a floating stone platform under a torn night sky (the original arena).
import * as THREE from 'three';
import { ARENA } from '../../config.js';
import { toon, glowTexture } from '../materials.js';
import { makeCanvas, canvasTexture, skyShader, addBarrier, addGround, addWeather, rng } from './common.js';

function groundTexture(arena, rand) {
  const size = 1024;
  const c = makeCanvas(size);
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
      const shade = 38 + Math.floor(rand() * 18);
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
    g.fillStyle = `rgba(0,0,0,${rand() * 0.12})`;
    g.fillRect(rand() * size, rand() * size, 2 + rand() * 6, 2 + rand() * 6);
  }
  g.strokeStyle = 'rgba(10,8,16,0.55)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    let x = rand() * size;
    let y = rand() * size;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rand() - 0.5) * 60;
      y += (rand() - 0.5) * 60;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return canvasTexture(arena, c);
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

export default {
  id: 'rift',
  name: 'RIFT SANCTUM',
  tagline: 'Floating ruins under a torn sky',
  swatch: ['#1a1030', '#ff3c6a'],
  exposure: 1.15,
  build(arena) {
    const rand = rng(11);
    arena.setLighting({
      fog: [0x120f22, 0.011],
      hemi: [0x8da0e6, 0x2b1d36, 1.25],
      sun: [0xd6e0ff, 2.4, [-18, 34, 16]],
      accent: [0xff4f8a, 0.7, [12, 18, -24]],
    });
    arena.setSky(SKY);

    // platform, cliff and rim
    const R = ARENA.wallRadius + 1.5;
    addGround(arena, new THREE.MeshStandardMaterial({ map: groundTexture(arena, rand), roughness: 0.92, metalness: 0.05 }));
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.55, 9, 64, 3, true), toon(0x24222f));
    cliff.position.y = -4.5;
    arena.add(cliff);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.25, 6, 96), toon(0x3a3747));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.02;
    arena.add(rim);
    // glowing sigil at the centre
    const sigilMat = new THREE.MeshBasicMaterial({ map: sigilTexture(arena), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 });
    const sigil = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), sigilMat);
    sigil.rotation.x = -Math.PI / 2;
    sigil.position.y = 0.025;
    sigil.renderOrder = 2;
    arena.add(sigil);

    // pillars with glowing runes, braziers between them
    const stone = toon(0x4a4758);
    const stoneDark = toon(0x2f2d3b);
    const glow = new THREE.MeshBasicMaterial({ color: 0xff3c6a });
    const flames = [];
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
      arena.add(g);
      arena.colliders.push({ x, z, r: 1.15 });
      const fa = a + Math.PI / count;
      const fx = Math.sin(fa) * 25.6;
      const fz = Math.cos(fa) * 25.6;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.5, 8), stoneDark);
      bowl.position.set(fx, 1.25, fz);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.0, 6), stoneDark);
      leg.position.set(fx, 0.5, fz);
      arena.add(bowl);
      arena.add(leg);
      arena.colliders.push({ x: fx, z: fz, r: 0.6, low: true });
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: i % 2 ? 0xff4a7a : 0x7a6bff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      flame.position.set(fx, 1.9, fz);
      flame.scale.set(1.6, 2.2, 1);
      arena.add(flame);
      flames.push({ sprite: flame, seed: rand() * 10 });
    }

    // barrier + low broken wall stones along the edge
    addBarrier(arena, { colorA: 0x8c33ff, colorB: 0xff4073 });
    const geo = new THREE.BoxGeometry(1.6, 0.7, 0.8);
    const inst = new THREE.InstancedMesh(geo, toon(0x35323f), 64);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    let k = 0;
    for (let i = 0; i < 64; i++) {
      if (i % 9 === 4) continue;
      const a = (i / 64) * Math.PI * 2;
      p.set(Math.sin(a) * (ARENA.wallRadius + 0.6), 0.3, Math.cos(a) * (ARENA.wallRadius + 0.6));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      sc.set(1, 0.6 + ((i * 7) % 5) * 0.15, 1);
      m.compose(p, q, sc);
      inst.setMatrixAt(k++, m);
    }
    inst.count = k;
    inst.castShadow = true;
    inst.receiveShadow = true;
    arena.add(inst);

    // floating rocks and distant spires give the void some depth
    const rockMat = toon(0x2b2836);
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rocks = [];
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2;
      const r = 45 + rand() * 70;
      const rock = new THREE.Mesh(rockGeo, rockMat);
      const s = 1.5 + rand() * 5;
      rock.scale.set(s, s * (0.6 + rand() * 0.8), s);
      rock.position.set(Math.sin(a) * r, -6 + rand() * 26, Math.cos(a) * r);
      rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      arena.add(rock);
      rocks.push({ mesh: rock, base: rock.position.y, seed: rand() * 10 });
    }
    const spireMat = toon(0x1a1826);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + rand() * 0.2;
      const r = 150 + rand() * 60;
      const h = 30 + rand() * 60;
      const spire = new THREE.Mesh(new THREE.ConeGeometry(8 + rand() * 10, h, 5), spireMat);
      spire.position.set(Math.sin(a) * r, -20 + h / 2, Math.cos(a) * r);
      arena.add(spire);
    }

    // rift motes drifting up out of the void
    addWeather(arena, { count: 260, radius: 34, height: 16, speed: 0.7, sway: 0.9, size: 0.09, colors: [0xa04bff, 0xff4f8a, 0x7fc8ff], kind: 'soft', additive: true, rise: true, opacity: 0.7, seed: 3 });

    arena.onUpdate((t) => {
      sigilMat.opacity = (0.42 + 0.12 * Math.sin(t * 1.3)) * (0.6 + 0.4 * arena.dim);
      sigil.rotation.z = t * 0.03;
      for (const f of flames) {
        const n = Math.sin(t * 9 + f.seed) * 0.5 + Math.sin(t * 13.7 + f.seed * 2) * 0.5;
        f.sprite.scale.set(1.5 + n * 0.15, 2.1 + n * 0.3, 1);
      }
      for (const r of rocks) r.mesh.position.y = r.base + Math.sin(t * 0.3 + r.seed) * 0.8;
    });
  },
};
