// Procedural, original stylized model for KAIRO — THE BLADE MASTER, plus the katana Kurokaze.
// Built from layered low-poly meshes with cel shading and inverted-hull outlines.
// Character faces local +Z; its left is +X; feet rest at y = 0.
import * as THREE from 'three';
import { toon, addOutline, eyeTexture, wrapTexture, emblemTexture } from '../../world/materials.js';
import { mergeStaticParts } from '../meshMerge.js';

export const DIMS = {
  hipsHeight: 0.98,
  upperArm: 0.28,
  foreArm: 0.26,
  thigh: 0.43,
  shin: 0.42,
  ankleHeight: 0.065,
  // sword-local sample points for trails / hit FX
  swordBase: new THREE.Vector3(0, 0.3, 0),
  swordTip: new THREE.Vector3(0, 1.03, 0),
  bladeLength: 1.0,
};

export const KAIRO_COLORS = {
  skin: 0xf2d2be,
  hair: 0x1d2029,
  coat: 0x1b2444,
  coatLining: 0xa3132a,
  suit: 0x121626,
  trousers: 0x161b2e,
  black: 0x0e0f15,
  armor: 0x262935,
  crimson: 0xc4152c,
  glove: 0x15161d,
  leather: 0x1c1517,
};

function makeMaterials() {
  const c = KAIRO_COLORS;
  return {
    skin: toon(c.skin, { soft: true }),
    hair: toon(c.hair),
    coat: toon(c.coat),
    coatLining: toon(c.coatLining, { side: THREE.BackSide }),
    lining: toon(c.coatLining),
    suit: toon(c.suit),
    trousers: toon(c.trousers),
    black: toon(c.black),
    armor: toon(c.armor),
    crimson: toon(c.crimson),
    glove: toon(c.glove),
    leather: toon(c.leather),
    silver: new THREE.MeshPhongMaterial({ color: 0xaab2c0, specular: 0xffffff, shininess: 80 }),
    lacquer: new THREE.MeshPhongMaterial({ color: 0x0b0b10, specular: 0x6a6f80, shininess: 70 }),
    mouth: toon(0x7a3238),
    brow: toon(0x15161c),
    // Glowing crimson markings; colour is driven at runtime by the glow level.
    mark: new THREE.MeshBasicMaterial({ color: 0x80101e }),
    emblem: new THREE.MeshBasicMaterial({ map: emblemTexture(), transparent: true, alphaTest: 0.2, color: 0x9a1424, depthWrite: true }),
    eye: new THREE.MeshBasicMaterial({ map: eyeTexture(), transparent: true, alphaTest: 0.35 }),
  };
}

// ---------------------------------------------------------------------------

export class Builder {
  constructor(ghostMaterial) {
    this.ghost = ghostMaterial || null;
    this.joints = new Map();
    this.meshes = [];
  }

  joint(name, parent, x = 0, y = 0, z = 0) {
    const j = new THREE.Object3D();
    j.name = name;
    j.position.set(x, y, z);
    j.rotation.order = 'YXZ';
    parent.add(j);
    this.joints.set(name, j);
    return j;
  }

  /** Adds a mesh with its scale baked into the geometry (keeps outline thickness uniform). */
  part(parent, geo, mat, { p = [0, 0, 0], r = [0, 0, 0], s = null, outline = 0.011, shadow = true, detail = false, name = '' } = {}) {
    if (this.ghost && detail) {
      geo.dispose();
      return null;
    }
    if (s) geo.scale(s[0], s[1], s[2]);
    const material = this.ghost ? this.ghost : mat;
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = name;
    mesh.position.set(p[0], p[1], p[2]);
    mesh.rotation.set(r[0], r[1], r[2]);
    if (!this.ghost) {
      mesh.castShadow = shadow;
      mesh.receiveShadow = false;
      if (outline > 0) addOutline(mesh, outline);
    }
    parent.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }
}

export function cyl(rt, rb, h, seg = 12, open = false, ts = 0, tl = Math.PI * 2) {
  return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, ts, tl);
}

/** A cone whose base sits at the origin and tip points along `dir`. */
export function spikeGeo(radius, length, dir, seg = 4) {
  const g = new THREE.ConeGeometry(radius, length, seg, 1);
  g.translate(0, length / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.applyQuaternion(q);
  return g;
}

// ---------------------------------------------------------------------------
// Kurokaze — The Black Gale. Blade along +Y, cutting edge faces +Z, guard at y = 0.

function bladeGeometry({ length = 1.0, w0 = 0.034, w1 = 0.027, sori = 0.045, t0 = 0.0072, stations = 26, y0 = 0.03 } = {}) {
  const kissaki = 0.9;
  const ring = [];
  for (let i = 0; i <= stations; i++) {
    const s = i / stations;
    const y = y0 + s * length;
    const zc = -sori * s * s;
    const w = w0 + (w1 - w0) * s;
    let spineZ = zc - w / 2;
    let edgeZ = zc + w / 2;
    let t = t0 * (1 - 0.35 * s);
    if (s > kissaki) {
      const u = (s - kissaki) / (1 - kissaki);
      edgeZ = spineZ + w * Math.cos(u * Math.PI * 0.5);
      spineZ += w * 0.12 * u * u;
      t *= 1 - u * 0.85;
      if (i === stations) {
        edgeZ = spineZ;
        t = 0;
      }
    }
    const ridgeZ = spineZ + 0.32 * (edgeZ - spineZ);
    ring.push([
      [0, y, edgeZ], // 0 edge
      [t, y, ridgeZ], // 1 ridge +x
      [t * 0.7, y, spineZ], // 2 spine +x
      [-t * 0.7, y, spineZ], // 3 spine -x
      [-t, y, ridgeZ], // 4 ridge -x
    ]);
  }
  // Each facet strip owns its vertices: smooth along the length, sharp across facets.
  const strips = [
    [0, 1, 1], // edge bevel +x (polished edge material)
    [1, 2, 0],
    [2, 3, 0],
    [3, 4, 0],
    [4, 0, 1], // edge bevel -x
  ];
  const pos = [];
  const index = [];
  const groups = [];
  let v = 0;
  for (const [a, b, matIndex] of strips) {
    const start = index.length;
    for (let i = 0; i <= stations; i++) {
      pos.push(...ring[i][a], ...ring[i][b]);
    }
    for (let i = 0; i < stations; i++) {
      const k = v + i * 2;
      index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
    v += (stations + 1) * 2;
    groups.push([start, index.length - start, matIndex]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  for (const [s, c, m] of groups) geo.addGroup(s, c, m);
  geo.computeVertexNormals();
  return { geo, ring };
}

function energyLineGeometry(ring, side) {
  // thin strip on the blade flat, between the ridge and the edge
  const pos = [];
  const idx = [];
  const n = ring.length;
  for (let i = 0; i < n - 2; i++) {
    const e = ring[i][0];
    const r = ring[i][side > 0 ? 1 : 4];
    const x = r[0] * 0.78 + side * 0.0009;
    const zA = r[2] + (e[2] - r[2]) * 0.3;
    const zB = r[2] + (e[2] - r[2]) * 0.52;
    pos.push(x, r[1], zA, x, r[1], zB);
  }
  for (let i = 0; i < n - 3; i++) {
    const k = i * 2;
    idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

function auraGeometry(ring) {
  // soft glow sheet in the blade plane, a bit wider than the blade
  const pos = [];
  const uv = [];
  const idx = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const e = ring[i][0];
    const s = ring[i][2];
    const y = e[1];
    pos.push(0, y, s[2] - 0.035, 0, y, e[2] + 0.045);
    uv.push(0, i / (n - 1), 1, i / (n - 1));
  }
  // extend past the tip
  pos.push(0, ring[n - 1][0][1] + 0.08, ring[n - 1][0][2] - 0.01, 0, ring[n - 1][0][1] + 0.08, ring[n - 1][0][2] + 0.01);
  uv.push(0, 1, 1, 1);
  for (let i = 0; i < n; i++) {
    const k = i * 2;
    idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

export function buildSword(b, mats) {
  const group = new THREE.Group();
  group.name = 'Kurokaze';
  const steel = new THREE.MeshPhongMaterial({ color: 0x9aa3b4, specular: 0xffffff, shininess: 110, emissive: 0x0c1018 });
  const edge = new THREE.MeshPhongMaterial({ color: 0xe9eef7, specular: 0xffffff, shininess: 160, emissive: 0x1e2836 });
  const { geo, ring } = bladeGeometry();
  const blade = new THREE.Mesh(geo, b.ghost ? b.ghost : [steel, edge]);
  blade.name = 'blade';
  if (!b.ghost) {
    blade.castShadow = true;
    addOutline(blade, 0.0035);
  }
  group.add(blade);

  let energyMat = null;
  let auraMat = null;
  if (!b.ghost) {
    energyMat = new THREE.MeshBasicMaterial({
      color: 0x6fd0ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    for (const side of [1, -1]) {
      const line = new THREE.Mesh(energyLineGeometry(ring, side), energyMat);
      line.renderOrder = 3;
      group.add(line);
    }
    auraMat = new THREE.ShaderMaterial({
      uniforms: { uIntensity: { value: 0.2 }, uColor: { value: new THREE.Color(0x58c0ff) }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uIntensity;
        uniform vec3 uColor;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float across = 1.0 - abs(vUv.x - 0.55) * 2.0;
          across = clamp(across, 0.0, 1.0);
          float flow = 0.65 + 0.35 * sin(vUv.y * 26.0 - uTime * 14.0);
          float a = pow(across, 1.6) * flow * uIntensity * smoothstep(0.0, 0.08, vUv.y);
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const aura = new THREE.Mesh(auraGeometry(ring), auraMat);
    aura.renderOrder = 4;
    group.add(aura);
  }

  // habaki (blade collar)
  b.part(group, new THREE.BoxGeometry(0.014, 0.032, 0.04), mats.silver, { p: [0, 0.016, -0.001], outline: 0.003 });
  // seppa washers + crimson circular tsuba (guard)
  b.part(group, cyl(0.026, 0.026, 0.004, 16), mats.silver, { p: [0, 0.002, 0], outline: 0 });
  b.part(group, cyl(0.026, 0.026, 0.004, 16), mats.silver, { p: [0, -0.014, 0], outline: 0 });
  b.part(group, cyl(0.046, 0.046, 0.01, 28), mats.crimson, { p: [0, -0.006, 0], s: [1, 1, 0.88], outline: 0.004 });
  b.part(group, new THREE.TorusGeometry(0.046, 0.0065, 8, 28), mats.crimson, { p: [0, -0.006, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.88, 1], outline: 0.003 });
  b.part(group, new THREE.TorusGeometry(0.03, 0.0035, 6, 24), mats.black, { p: [0, -0.001, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.88, 1], outline: 0, detail: true });
  // tsuka (wrapped handle), fuchi collar and kashira pommel
  const handle = b.part(group, cyl(0.0168, 0.0178, 0.25, 10), new THREE.MeshToonMaterial({ map: wrapTexture(), color: 0xffffff }), { p: [0, -0.142, 0], s: [0.8, 1, 1], outline: 0.004 });
  if (handle && !b.ghost) handle.material.gradientMap = mats.black.gradientMap;
  b.part(group, cyl(0.019, 0.019, 0.018, 12), mats.silver, { p: [0, -0.022, 0], s: [0.82, 1, 1], outline: 0.002 });
  b.part(group, cyl(0.0185, 0.016, 0.022, 12), mats.silver, { p: [0, -0.276, 0], s: [0.82, 1, 1], outline: 0.003 });
  // short crimson tassel cord
  b.part(group, cyl(0.004, 0.004, 0.09, 5), mats.crimson, { p: [0, -0.32, -0.004], r: [0.25, 0, 0], outline: 0, detail: true });
  return { group, energyMat, auraMat, steel, edge };
}

// ---------------------------------------------------------------------------

/** Sphere sculpted into an anime head: rounded cranium, tapered V-jaw and a soft pointed chin. */
export function headGeometry(r) {
  const g = new THREE.SphereGeometry(r, 28, 22);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const ny = y / r;
    if (ny < 0.1) {
      const k = Math.pow(Math.min(1, (0.1 - ny) / 1.1), 1.25);
      x *= 1 - 0.5 * k;
      z *= 1 - 0.22 * k;
      // pull the front of the jaw forward into a chin
      if (z > 0) z += r * 0.16 * k * (1 - Math.abs(x) / r);
      y -= r * 0.22 * k;
    }
    // flatten the face plane slightly and widen the cheekbones
    if (z > 0 && ny > -0.2 && ny < 0.5) z *= 0.96;
    p.setXYZ(i, x * 0.92, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function buildHead(b, head, m) {
  b.part(head, headGeometry(0.112), m.skin, { p: [0, 0.105, 0.004] });
  // ears
  for (const sx of [1, -1]) {
    b.part(head, new THREE.SphereGeometry(0.026, 8, 8), m.skin, { p: [sx * 0.098, 0.088, -0.008], s: [0.38, 1, 0.7], outline: 0.006, detail: true });
  }
  // eyes (canvas texture, mirrored for the right eye)
  for (const sx of [1, -1]) {
    const g = new THREE.PlaneGeometry(0.056, 0.042);
    if (sx < 0) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    }
    b.part(head, g, m.eye, { p: [sx * 0.041, 0.096, 0.1], r: [0, sx * 0.34, 0], outline: 0, shadow: false, detail: true });
    // sharp, determined brows
    b.part(head, new THREE.BoxGeometry(0.046, 0.0075, 0.008), m.brow, { p: [sx * 0.043, 0.132, 0.1], r: [0, sx * 0.3, sx * 0.24], outline: 0, detail: true });
  }
  // nose + mouth
  b.part(head, new THREE.ConeGeometry(0.008, 0.024, 4), m.skin, { p: [0, 0.075, 0.111], r: [1.9, 0, 0], outline: 0.003, detail: true });
  b.part(head, new THREE.BoxGeometry(0.026, 0.0045, 0.004), m.mouth, { p: [0, 0.047, 0.106], r: [-0.3, 0, 0], outline: 0, detail: true });
  // crimson cheek markings (glow during specials)
  b.part(head, new THREE.BoxGeometry(0.026, 0.0045, 0.003), m.mark, { p: [0.058, 0.074, 0.088], r: [0, 0.55, -0.45], outline: 0, detail: true });
  b.part(head, new THREE.BoxGeometry(0.018, 0.0045, 0.003), m.mark, { p: [0.064, 0.062, 0.084], r: [0, 0.6, -0.45], outline: 0, detail: true });

  // ---- hair ----
  b.part(head, new THREE.SphereGeometry(0.123, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), m.hair, { p: [0, 0.112, -0.006], r: [-0.45, 0, 0], s: [0.94, 1.0, 1.02], outline: 0.009 });
  const C = new THREE.Vector3(0, 0.112, -0.006);
  const tmp = new THREE.Vector3();
  const addSpike = (pos, dir, len, rad, outline = 0.006) => {
    b.part(head, spikeGeo(rad, len, dir), m.hair, { p: [pos.x, pos.y, pos.z], outline });
  };
  // layered swept-back spikes over the crown and back
  const rows = [
    { phi: 0.35, n: 5, from: -1.1, to: 1.1, len: 0.2, rad: 0.05 },
    { phi: 0.85, n: 6, from: -1.9, to: 1.9, len: 0.18, rad: 0.048 },
    { phi: 1.35, n: 7, from: -2.4, to: 2.4, len: 0.17, rad: 0.045 },
    { phi: 1.85, n: 6, from: -2.2, to: 2.2, len: 0.15, rad: 0.04 },
  ];
  for (const row of rows) {
    for (let i = 0; i < row.n; i++) {
      const th = Math.PI + row.from + ((row.to - row.from) * i) / Math.max(1, row.n - 1);
      // point on the cap (theta measured around +Y from +Z)
      const sp = Math.sin(row.phi);
      tmp.set(Math.sin(th) * sp, Math.cos(row.phi), Math.cos(th) * sp);
      const pos = tmp.clone().multiplyScalar(0.11).add(C);
      const dir = tmp.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, -0.35, -0.75));
      const jitter = ((i * 37) % 7) / 7 - 0.5;
      addSpike(pos, dir, row.len * (0.85 + 0.3 * Math.abs(jitter)), row.rad);
    }
  }
  // sharp crown spikes for a distinctive silhouette
  addSpike(new THREE.Vector3(0.02, 0.22, -0.02), new THREE.Vector3(0.15, 0.75, -0.65), 0.17, 0.045);
  addSpike(new THREE.Vector3(-0.04, 0.215, -0.03), new THREE.Vector3(-0.35, 0.65, -0.65), 0.16, 0.042);
  addSpike(new THREE.Vector3(0.05, 0.2, -0.06), new THREE.Vector3(0.55, 0.45, -0.7), 0.15, 0.04);
  // bangs: sweep across the forehead towards Kairo's right, one long strand between the eyes
  const bangs = [
    [0.075, 0.195, 0.07, -0.25, -1, 0.42, 0.11, 0.036],
    [0.045, 0.2, 0.085, -0.4, -1, 0.45, 0.13, 0.038],
    [0.012, 0.205, 0.09, -0.5, -1, 0.45, 0.15, 0.036],
    [-0.022, 0.2, 0.088, -0.55, -1, 0.4, 0.13, 0.034],
    [-0.055, 0.19, 0.08, -0.6, -1, 0.35, 0.12, 0.032],
    [-0.085, 0.175, 0.06, -0.45, -1, 0.25, 0.1, 0.03],
    [0.002, 0.19, 0.098, -0.1, -1, 0.25, 0.115, 0.022],
  ];
  for (const [x, y, z, dx, dy, dz, len, rad] of bangs) {
    addSpike(new THREE.Vector3(x, y, z), new THREE.Vector3(dx, dy, dz), len, rad, 0.005);
  }
  // side locks framing the face
  addSpike(new THREE.Vector3(0.1, 0.15, 0.04), new THREE.Vector3(0.12, -1, 0.18), 0.17, 0.03, 0.005);
  addSpike(new THREE.Vector3(-0.1, 0.15, 0.04), new THREE.Vector3(-0.12, -1, 0.18), 0.18, 0.03, 0.005);
  addSpike(new THREE.Vector3(0.105, 0.16, -0.02), new THREE.Vector3(0.3, -1, -0.2), 0.14, 0.032, 0.005);
  addSpike(new THREE.Vector3(-0.105, 0.16, -0.02), new THREE.Vector3(-0.3, -1, -0.2), 0.14, 0.032, 0.005);

  // low ponytail with a crimson cord (secondary motion joint)
  const tail = b.joint('ponytail', head, 0, 0.075, -0.1);
  tail.rotation.x = 0.45;
  b.part(tail, new THREE.TorusGeometry(0.024, 0.009, 6, 14), m.crimson, { p: [0, -0.01, 0], r: [Math.PI / 2, 0, 0], outline: 0.004 });
  b.part(tail, spikeGeo(0.036, 0.3, new THREE.Vector3(0, -1, -0.12)), m.hair, { p: [0, -0.015, 0], outline: 0.006 });
  b.part(tail, spikeGeo(0.028, 0.24, new THREE.Vector3(0.25, -1, -0.05)), m.hair, { p: [0.008, -0.015, 0], outline: 0.005 });
  b.part(tail, spikeGeo(0.028, 0.22, new THREE.Vector3(-0.25, -1, -0.1)), m.hair, { p: [-0.008, -0.015, 0], outline: 0.005 });
}

export function buildArm(b, chest, side, m) {
  // side: -1 = right arm (on -X), +1 = left arm
  const s = side > 0 ? 'L' : 'R';
  const shoulder = b.joint('shoulder' + s, chest, side * 0.205, 0.2, -0.01);
  b.part(shoulder, cyl(0.064, 0.055, DIMS.upperArm, 10), m.coat, { p: [0, -DIMS.upperArm / 2, 0] });
  b.part(shoulder, cyl(0.06, 0.06, 0.028, 10), m.lining, { p: [0, -DIMS.upperArm + 0.012, 0], outline: 0.006 });
  const elbow = b.joint('elbow' + s, shoulder, 0, -DIMS.upperArm, 0);
  b.part(elbow, cyl(0.05, 0.043, DIMS.foreArm - 0.02, 10), m.black, { p: [0, -DIMS.foreArm / 2 + 0.005, 0] });
  // armour plate on the back of the forearm with a glowing marking line
  b.part(elbow, new THREE.BoxGeometry(0.056, 0.17, 0.02), m.armor, { p: [0, -0.13, 0.04], outline: 0.006 });
  b.part(elbow, new THREE.BoxGeometry(0.01, 0.15, 0.006), m.mark, { p: [0, -0.13, 0.052], outline: 0, detail: true });
  b.part(elbow, new THREE.BoxGeometry(0.03, 0.006, 0.006), m.mark, { p: [0, -0.07, 0.052], outline: 0, detail: true });
  const hand = b.joint('hand' + s, elbow, 0, -DIMS.foreArm, 0);
  if (side < 0) {
    // closed fist around the handle (handle runs along hand +Y)
    b.part(hand, new THREE.BoxGeometry(0.07, 0.085, 0.078), m.glove, { p: [0.004, 0.0, -0.004], outline: 0.007 });
    b.part(hand, new THREE.BoxGeometry(0.02, 0.05, 0.03), m.glove, { p: [0.03, 0.02, 0.03], outline: 0.004, detail: true });
  } else {
    // open guard hand
    b.part(hand, new THREE.BoxGeometry(0.07, 0.095, 0.032), m.glove, { p: [0, -0.05, 0], outline: 0.006 });
    b.part(hand, new THREE.BoxGeometry(0.022, 0.05, 0.022), m.glove, { p: [-0.038, -0.035, 0.012], r: [0, 0, -0.5], outline: 0.004, detail: true });
  }
  return { shoulder, elbow, hand };
}

export function buildLeg(b, hips, side, m) {
  const s = side > 0 ? 'L' : 'R';
  const thigh = b.joint('thigh' + s, hips, side * 0.092, -0.07, 0);
  b.part(thigh, cyl(0.084, 0.062, DIMS.thigh, 10), m.trousers, { p: [0, -DIMS.thigh / 2, 0] });
  const knee = b.joint('knee' + s, thigh, 0, -DIMS.thigh, 0);
  b.part(knee, cyl(0.061, 0.056, 0.16, 10), m.trousers, { p: [0, -0.07, 0] });
  b.part(knee, cyl(0.063, 0.052, 0.27, 10), m.black, { p: [0, -0.28, 0] });
  b.part(knee, cyl(0.067, 0.067, 0.024, 10), m.crimson, { p: [0, -0.15, 0], outline: 0.005 });
  b.part(knee, new THREE.BoxGeometry(0.072, 0.085, 0.03), m.armor, { p: [0, -0.02, 0.058], r: [0.1, 0, 0], outline: 0.006 });
  const foot = b.joint('foot' + s, knee, 0, -DIMS.shin, 0);
  b.part(foot, new THREE.BoxGeometry(0.088, 0.072, 0.2), m.black, { p: [0, -0.03, 0.045], outline: 0.007 });
  b.part(foot, new THREE.BoxGeometry(0.09, 0.02, 0.07), m.armor, { p: [0, -0.005, 0.11], outline: 0.004, detail: true });
  return { thigh, knee, foot };
}

export function coatPanel(b, hips, name, yaw, radius, width, length, m) {
  const j = b.joint(name, hips, Math.sin(yaw) * radius, 0.07, Math.cos(yaw) * radius);
  j.rotation.set(-0.1, yaw, 0);
  j.userData.outward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  j.userData.yaw = yaw;
  const geo = new THREE.BoxGeometry(width, length, 0.014);
  geo.translate(0, -length / 2, 0);
  const mats = b.ghost ? b.ghost : [m.coat, m.coat, m.coat, m.coat, m.coat, m.lining];
  // box faces: +x, -x, +y, -y, +z (outer, navy), -z (inner, crimson lining)
  if (b.ghost) {
    b.part(j, geo, mats, { outline: 0 });
  } else {
    const mesh = new THREE.Mesh(geo, [m.coat, m.coat, m.coat, m.coat, m.coat, m.lining]);
    mesh.castShadow = true;
    addOutline(mesh, 0.009);
    j.add(mesh);
    b.meshes.push(mesh);
    // crimson trim at the hem
    b.part(j, new THREE.BoxGeometry(width + 0.002, 0.03, 0.017), m.crimson, { p: [0, -length + 0.02, 0], outline: 0 });
  }
  return j;
}

/**
 * Builds Kairo. Pass `ghostMaterial` to create a simplified single-material copy for afterimages.
 * @returns {{ root, joints, sword, materials, meshes }}
 */
export function buildKairo(ghostMaterial = null) {
  const b = new Builder(ghostMaterial);
  const m = makeMaterials();
  const root = new THREE.Group();
  root.name = 'KairoModel';

  const hips = b.joint('hips', root, 0, DIMS.hipsHeight, 0);
  b.part(hips, cyl(0.145, 0.158, 0.2, 14), m.trousers, { p: [0, -0.04, 0], s: [1, 1, 0.76] });
  b.part(hips, cyl(0.152, 0.152, 0.055, 14), m.leather, { p: [0, 0.075, 0], s: [1, 1, 0.8], outline: 0.008 });
  b.part(hips, cyl(0.16, 0.162, 0.035, 14), m.crimson, { p: [0, 0.045, 0], s: [1, 1, 0.8], outline: 0.006 });
  b.part(hips, new THREE.BoxGeometry(0.04, 0.03, 0.012), m.silver, { p: [0, 0.075, 0.123], outline: 0.004, detail: true });
  // sash knot with hanging ends
  b.part(hips, new THREE.SphereGeometry(0.026, 8, 8), m.crimson, { p: [-0.1, 0.045, 0.1], outline: 0.005, detail: true });
  b.part(hips, new THREE.BoxGeometry(0.035, 0.2, 0.008), m.crimson, { p: [-0.11, -0.05, 0.11], r: [0.05, -0.5, 0.2], outline: 0.004 });
  b.part(hips, new THREE.BoxGeometry(0.03, 0.15, 0.008), m.crimson, { p: [-0.075, -0.03, 0.12], r: [0.05, -0.4, -0.15], outline: 0.004, detail: true });

  // split coat skirt: four hinged panels that flow with movement
  const panels = [
    coatPanel(b, hips, 'coatBL', Math.PI - 0.5, 0.13, 0.15, 0.68, m),
    coatPanel(b, hips, 'coatBR', -Math.PI + 0.5, 0.13, 0.15, 0.68, m),
    coatPanel(b, hips, 'coatSL', 1.85, 0.14, 0.15, 0.6, m),
    coatPanel(b, hips, 'coatSR', -1.85, 0.14, 0.15, 0.6, m),
  ];

  // sheath (saya) at the left hip, angled back and down
  const sheath = b.joint('sheath', hips, 0.17, 0.035, 0.05);
  sheath.rotation.set(-0.42, -0.2, 0, 'YXZ');
  const sayaLen = 1.0;
  b.part(sheath, cyl(0.024, 0.021, sayaLen, 10), m.lacquer, { p: [0, 0, -sayaLen / 2 + 0.08], r: [Math.PI / 2, 0, 0], s: [0.62, 1, 1], outline: 0.007 });
  b.part(sheath, cyl(0.026, 0.026, 0.03, 10), m.silver, { p: [0, 0, 0.08], r: [Math.PI / 2, 0, 0], s: [0.64, 1, 1], outline: 0.003 });
  b.part(sheath, cyl(0.023, 0.018, 0.04, 10), m.silver, { p: [0, 0, 0.08 - sayaLen + 0.01], r: [Math.PI / 2, 0, 0], s: [0.64, 1, 1], outline: 0.003 });
  for (const z of [0.02, -0.05]) {
    b.part(sheath, new THREE.TorusGeometry(0.024, 0.0055, 6, 12), m.crimson, { p: [0, 0, z], s: [0.66, 1, 1], outline: 0.003, detail: true });
  }

  const spine = b.joint('spine', hips, 0, 0.08, 0);
  const chest = b.joint('chest', spine, 0, 0.2, 0);
  b.part(chest, cyl(0.172, 0.138, 0.46, 14), m.suit, { p: [0, 0.03, 0], s: [1, 1, 0.72] });
  // chest armour with glowing crimson trim
  b.part(chest, new THREE.BoxGeometry(0.2, 0.15, 0.04), m.armor, { p: [0, 0.11, 0.105], r: [-0.14, 0, 0], outline: 0.007 });
  b.part(chest, new THREE.BoxGeometry(0.2, 0.008, 0.006), m.mark, { p: [0, 0.04, 0.126], r: [-0.14, 0, 0], outline: 0, detail: true });
  b.part(chest, new THREE.BoxGeometry(0.008, 0.11, 0.006), m.mark, { p: [0, 0.11, 0.13], r: [-0.14, 0, 0], outline: 0, detail: true });
  // long coat shell, open at the front, crimson lining inside
  const ts = 0.62;
  const tl = Math.PI * 2 - ts * 2;
  b.part(chest, cyl(0.19, 0.172, 0.5, 18, true, ts, tl), m.coat, { p: [0, 0.03, 0], s: [1, 1, 0.8], outline: 0.01 });
  b.part(chest, cyl(0.186, 0.168, 0.49, 18, true, ts, tl), m.coatLining, { p: [0, 0.03, 0], s: [1, 1, 0.8], outline: 0, detail: true });
  // high collar
  b.part(chest, cyl(0.12, 0.14, 0.13, 14, true, 0.75, Math.PI * 2 - 1.5), m.coat, { p: [0, 0.3, -0.005], s: [1, 1, 0.85], outline: 0.008 });
  b.part(chest, cyl(0.117, 0.137, 0.125, 14, true, 0.75, Math.PI * 2 - 1.5), m.coatLining, { p: [0, 0.3, -0.005], s: [1, 1, 0.85], outline: 0, detail: true });
  // asymmetric armour: layered pauldron on the left (off-hand) shoulder, light plate on the right
  b.part(chest, new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.armor, { p: [0.215, 0.215, 0], r: [0, 0, -0.55], s: [1, 0.75, 1], outline: 0.008 });
  b.part(chest, new THREE.SphereGeometry(0.085, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.coat, { p: [0.25, 0.17, 0], r: [0, 0, -0.85], s: [1, 0.7, 1], outline: 0.008 });
  const rim = new THREE.TorusGeometry(0.098, 0.006, 6, 20);
  rim.rotateX(Math.PI / 2);
  b.part(chest, rim, m.crimson, { p: [0.215, 0.215, 0], r: [0, 0, -0.55], outline: 0, detail: true });
  b.part(chest, new THREE.SphereGeometry(0.075, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.armor, { p: [-0.21, 0.215, 0], r: [0, 0, 0.6], s: [1, 0.6, 1], outline: 0.007 });
  // back emblem
  b.part(chest, new THREE.PlaneGeometry(0.2, 0.2), m.emblem, { p: [0, 0.08, -0.15], r: [0, Math.PI, 0], outline: 0, shadow: false, detail: true });

  const neck = b.joint('neck', chest, 0, 0.27, 0);
  b.part(neck, cyl(0.046, 0.05, 0.11, 10), m.skin, { p: [0, 0.03, 0], outline: 0.006 });
  const head = b.joint('head', neck, 0, 0.075, 0.005);
  buildHead(b, head, m);

  const armR = buildArm(b, chest, -1, m);
  const armL = buildArm(b, chest, 1, m);
  buildLeg(b, hips, -1, m);
  buildLeg(b, hips, 1, m);

  // Kurokaze in the right hand; grip sits just below the guard.
  const sword = buildSword(b, m);
  sword.group.position.set(0, 0.055, 0);
  armR.hand.add(sword.group);

  // Sheathed transform: handle protrudes from the saya mouth, blade inside (used for victory).
  const sheathedSlot = new THREE.Object3D();
  sheathedSlot.name = 'sheathedSlot';
  sheathedSlot.position.set(0, 0, 0.1);
  sheathedSlot.rotation.set(-Math.PI / 2, 0, 0); // blade +Y -> back along the saya, edge up
  sheath.add(sheathedSlot);

  // fewer draw calls: merge static parts per joint (joints stay animated)
  const merge = mergeStaticParts(root);

  return {
    root,
    joints: b.joints,
    sword,
    sheathedSlot,
    panels,
    materials: m,
    partCount: b.meshes.length,
    drawMeshes: merge.after,
  };
}
