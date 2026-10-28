// Procedural human swordfighters for the NPC clans. They share Kairo's skeleton (same joint
// names and proportions), so KairoAnimator drives them with the same locomotion, IK and
// swordplay; only the outfit, hair, headgear and colours change.
import * as THREE from 'three';
import { toon } from '../world/materials.js';
import { mergeStaticParts } from '../characters/meshMerge.js';
import { DIMS, Builder, cyl, spikeGeo, headGeometry, buildArm, buildLeg, coatPanel, buildSword } from '../characters/kairo/kairoModel.js';

const _eyes = new Map();

// Crowds need fewer draw calls than the hero: one outline thickness (so more parts merge)
// and no shadow casting (fighters get a cheap blob shadow instead).
class CrowdBuilder extends Builder {
  part(parent, geo, mat, opts = {}) {
    return super.part(parent, geo, mat, { ...opts, outline: opts.outline === 0 ? 0 : 0.008, shadow: false });
  }
}

/** Anime eye with a coloured iris (cached per colour). */
function eyeTexture(iris) {
  if (_eyes.has(iris)) return _eyes.get(iris);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f1ee';
  g.beginPath();
  g.moveTo(8, 52);
  g.quadraticCurveTo(50, 16, 118, 36);
  g.quadraticCurveTo(110, 80, 60, 84);
  g.quadraticCurveTo(24, 82, 8, 52);
  g.fill();
  const col = new THREE.Color(iris);
  const dark = col.clone().multiplyScalar(0.3);
  const grd = g.createRadialGradient(66, 56, 4, 66, 54, 30);
  grd.addColorStop(0, '#' + col.clone().lerp(new THREE.Color(1, 1, 1), 0.35).getHexString());
  grd.addColorStop(0.5, '#' + col.getHexString());
  grd.addColorStop(1, '#' + dark.getHexString());
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(66, 56, 22, 26, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0b0b10';
  g.beginPath();
  g.ellipse(66, 57, 9, 12, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.arc(58, 46, 6, 0, Math.PI * 2);
  g.fill();
  // upper lash line
  g.strokeStyle = '#0b0b10';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(8, 52);
  g.quadraticCurveTo(50, 16, 118, 36);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _eyes.set(iris, t);
  return t;
}

function makeMaterials(look) {
  return {
    skin: toon(look.skin, { soft: true }),
    hair: toon(look.hair),
    coat: toon(look.coat),
    coatLining: toon(look.lining, { side: THREE.BackSide }),
    lining: toon(look.lining),
    suit: toon(look.suit),
    trousers: toon(look.trousers),
    black: toon(look.black),
    armor: toon(look.armor),
    crimson: toon(look.accent), // the shared limb/sword builders call the accent colour "crimson"
    glove: toon(look.glove),
    leather: toon(0x2a2020),
    gear: toon(look.gearColor || look.accent),
    straw: toon(0xc9a86a),
    silver: new THREE.MeshPhongMaterial({ color: 0xaab2c0, specular: 0xffffff, shininess: 80 }),
    lacquer: new THREE.MeshPhongMaterial({ color: 0x0b0b10, specular: 0x6a6f80, shininess: 70 }),
    mouth: toon(0x7a3a3c),
    brow: toon(look.brow || 0x15161c),
    mark: new THREE.MeshBasicMaterial({ color: look.glow }),
    eye: new THREE.MeshBasicMaterial({ map: eyeTexture(look.eye), transparent: true, alphaTest: 0.35 }),
  };
}

function buildHair(b, head, m, look) {
  const C = new THREE.Vector3(0, 0.112, -0.006);
  const style = look.hairStyle;
  if (style !== 'shaved') {
    b.part(head, new THREE.SphereGeometry(0.122, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), m.hair, { p: [C.x, C.y, C.z], r: [-0.4, 0, 0], s: [0.95, 1, 1.03], outline: 0.008 });
  }
  const spike = (x, y, z, dx, dy, dz, len, rad, outline = 0.005) => b.part(head, spikeGeo(rad, len, new THREE.Vector3(dx, dy, dz)), m.hair, { p: [x, y, z], outline });
  if (style === 'topknot') {
    b.part(head, cyl(0.03, 0.036, 0.075, 10), m.hair, { p: [0, 0.235, -0.05], r: [-0.5, 0, 0], outline: 0.006 });
    b.part(head, new THREE.TorusGeometry(0.03, 0.008, 6, 12), m.gear, { p: [0, 0.215, -0.035], r: [Math.PI / 2 - 0.5, 0, 0], outline: 0.004 });
    for (const sx of [1, -1]) spike(sx * 0.1, 0.15, 0.03, sx * 0.1, -1, 0.15, 0.12, 0.028);
  } else if (style === 'wild') {
    for (let i = 0; i < 11; i++) {
      const th = Math.PI + (i / 10 - 0.5) * 4.4;
      const ph = 0.4 + (i % 3) * 0.45;
      const dir = new THREE.Vector3(Math.sin(th) * Math.sin(ph), Math.cos(ph), Math.cos(th) * Math.sin(ph));
      const pos = dir.clone().multiplyScalar(0.105).add(C);
      dir.multiplyScalar(0.8).add(new THREE.Vector3(0, 0.1, -0.5));
      spike(pos.x, pos.y, pos.z, dir.x, dir.y, dir.z, 0.13 + (i % 4) * 0.025, 0.042);
    }
    for (const [x, dx] of [[0.06, -0.3], [0.0, -0.1], [-0.06, 0.2]]) spike(x, 0.2, 0.08, dx, -1, 0.4, 0.11, 0.032);
  } else if (style === 'long') {
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6 - 0.5) * 2.6;
      spike(Math.sin(a) * 0.1, 0.12, Math.cos(a) * 0.1 - 0.01, Math.sin(a) * 0.25, -1, Math.cos(a) * 0.2 - 0.15, 0.32 + (i % 2) * 0.06, 0.042);
    }
    for (const sx of [1, -1]) spike(sx * 0.1, 0.16, 0.05, sx * 0.08, -1, 0.1, 0.26, 0.03);
    for (const [x, dx] of [[0.05, -0.35], [-0.02, -0.45], [-0.07, -0.3]]) spike(x, 0.2, 0.085, dx, -1, 0.45, 0.12, 0.032);
  } else if (style === 'bob') {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8 - 0.5) * 3.6;
      spike(Math.sin(a) * 0.112, 0.13, Math.cos(a) * 0.105, Math.sin(a) * 0.4, -1, Math.cos(a) * 0.3, 0.15, 0.04);
    }
    for (const [x, dx] of [[0.06, -0.2], [0.02, -0.2], [-0.03, 0.1], [-0.07, 0.2]]) spike(x, 0.2, 0.085, dx, -1, 0.5, 0.1, 0.03);
  }
  // ponytail joint always exists (the animator's hair spring drives it)
  const tail = b.joint('ponytail', head, 0, 0.075, -0.1);
  tail.rotation.x = 0.45;
  if (style === 'long' || look.ponytail) {
    b.part(tail, new THREE.TorusGeometry(0.024, 0.009, 6, 14), m.gear, { p: [0, -0.01, 0], r: [Math.PI / 2, 0, 0], outline: 0.004 });
    b.part(tail, spikeGeo(0.04, style === 'long' ? 0.42 : 0.3, new THREE.Vector3(0, -1, -0.1)), m.hair, { p: [0, -0.015, 0], outline: 0.006 });
  }
}

function buildHeadgear(b, head, m, look) {
  const g = look.headgear;
  if (g === 'band') {
    b.part(head, cyl(0.121, 0.121, 0.032, 20, true), m.gear, { p: [0, 0.155, -0.004], r: [0.18, 0, 0], s: [0.97, 1, 1.02], outline: 0.004 });
    for (const sx of [1, -1]) b.part(head, new THREE.BoxGeometry(0.022, 0.17, 0.005), m.gear, { p: [sx * 0.025, 0.08, -0.125], r: [0.3, 0, sx * 0.25], outline: 0.003 });
  } else if (g === 'kasa') {
    b.part(head, new THREE.ConeGeometry(0.36, 0.15, 18, 1, true), m.straw, { p: [0, 0.29, -0.005], outline: 0.008 });
    b.part(head, cyl(0.06, 0.06, 0.025, 10), m.straw, { p: [0, 0.215, 0], outline: 0.004 });
  } else if (g === 'mask') {
    b.part(head, cyl(0.118, 0.112, 0.088, 16, true, -1.45, 2.9), m.gear, { p: [0, 0.058, 0.004], outline: 0.005 });
  }
}

/**
 * Builds a fighter from a look description:
 *   { skin, hair, hairStyle, headgear, coat, lining, suit, trousers, black, armor, accent, glove, glow, eye, pads, coatLength }
 * @returns {{ root, joints, sword, sheathedSlot, panels, materials, flashMats }}
 */
export function buildFighter(look) {
  const b = new CrowdBuilder(null);
  const m = makeMaterials(look);
  const root = new THREE.Group();
  root.name = 'FighterModel';

  const hips = b.joint('hips', root, 0, DIMS.hipsHeight, 0);
  b.part(hips, cyl(0.145, 0.158, 0.2, 14), m.trousers, { p: [0, -0.04, 0], s: [1, 1, 0.76] });
  b.part(hips, cyl(0.152, 0.152, 0.055, 14), m.leather, { p: [0, 0.075, 0], s: [1, 1, 0.8], outline: 0.008 });
  b.part(hips, cyl(0.16, 0.162, 0.04, 14), m.crimson, { p: [0, 0.045, 0], s: [1, 1, 0.8], outline: 0.006 });
  b.part(hips, new THREE.BoxGeometry(0.035, 0.18, 0.008), m.crimson, { p: [-0.11, -0.05, 0.11], r: [0.05, -0.5, 0.2], outline: 0.004 });
  const len = look.coatLength || 0.6;
  const panels = [
    coatPanel(b, hips, 'coatBL', Math.PI - 0.5, 0.13, 0.15, len, m),
    coatPanel(b, hips, 'coatBR', -Math.PI + 0.5, 0.13, 0.15, len, m),
    coatPanel(b, hips, 'coatSL', 1.85, 0.14, 0.15, len * 0.88, m),
    coatPanel(b, hips, 'coatSR', -1.85, 0.14, 0.15, len * 0.88, m),
  ];

  const sheath = b.joint('sheath', hips, 0.17, 0.035, 0.05);
  sheath.rotation.set(-0.42, -0.2, 0, 'YXZ');
  b.part(sheath, cyl(0.024, 0.021, 0.95, 10), m.lacquer, { p: [0, 0, -0.395], r: [Math.PI / 2, 0, 0], s: [0.62, 1, 1], outline: 0.006 });
  const sheathedSlot = new THREE.Object3D();
  sheathedSlot.name = 'sheathedSlot';
  sheathedSlot.position.set(0, 0, 0.1);
  sheathedSlot.rotation.set(-Math.PI / 2, 0, 0);
  sheath.add(sheathedSlot);

  const spine = b.joint('spine', hips, 0, 0.08, 0);
  const chest = b.joint('chest', spine, 0, 0.2, 0);
  b.part(chest, cyl(0.172, 0.138, 0.46, 14), m.suit, { p: [0, 0.03, 0], s: [1, 1, 0.72] });
  const ts = 0.55;
  b.part(chest, cyl(0.19, 0.172, 0.5, 16, true, ts, Math.PI * 2 - ts * 2), m.coat, { p: [0, 0.03, 0], s: [1, 1, 0.8], outline: 0.01 });
  b.part(chest, cyl(0.186, 0.168, 0.49, 16, true, ts, Math.PI * 2 - ts * 2), m.coatLining, { p: [0, 0.03, 0], s: [1, 1, 0.8], outline: 0 });
  b.part(chest, cyl(0.12, 0.14, 0.11, 14, true, 0.8, Math.PI * 2 - 1.6), m.coat, { p: [0, 0.3, -0.005], s: [1, 1, 0.85], outline: 0.008 });
  // chest plate and clan crest on the back
  b.part(chest, new THREE.BoxGeometry(0.2, 0.15, 0.04), m.armor, { p: [0, 0.11, 0.105], r: [-0.14, 0, 0], outline: 0.007 });
  b.part(chest, new THREE.CircleGeometry(0.075, 20), m.mark, { p: [0, 0.1, -0.152], r: [0, Math.PI, 0], outline: 0, shadow: false });
  const pads = look.pads || 'left';
  if (pads !== 'none') {
    for (const sx of pads === 'both' ? [1, -1] : [1]) {
      b.part(chest, new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.armor, { p: [sx * 0.215, 0.215, 0], r: [0, 0, -sx * 0.55], s: [1, 0.75, 1], outline: 0.008 });
      const rim = new THREE.TorusGeometry(0.098, 0.006, 6, 20);
      rim.rotateX(Math.PI / 2);
      b.part(chest, rim, m.crimson, { p: [sx * 0.215, 0.215, 0], r: [0, 0, -sx * 0.55], outline: 0 });
    }
  }

  const neck = b.joint('neck', chest, 0, 0.27, 0);
  b.part(neck, cyl(0.046, 0.05, 0.11, 10), m.skin, { p: [0, 0.03, 0], outline: 0.006 });
  const head = b.joint('head', neck, 0, 0.075, 0.005);
  b.part(head, headGeometry(0.112), m.skin, { p: [0, 0.105, 0.004] });
  for (const sx of [1, -1]) {
    b.part(head, new THREE.SphereGeometry(0.026, 8, 8), m.skin, { p: [sx * 0.098, 0.088, -0.008], s: [0.38, 1, 0.7], outline: 0.006 });
    const eg = new THREE.PlaneGeometry(0.054, 0.04);
    if (sx < 0) {
      const uv = eg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    }
    b.part(head, eg, m.eye, { p: [sx * 0.041, 0.096, 0.1], r: [0, sx * 0.34, 0], outline: 0, shadow: false });
    b.part(head, new THREE.BoxGeometry(0.046, look.thickBrows ? 0.012 : 0.0075, 0.008), m.brow, { p: [sx * 0.043, 0.132, 0.1], r: [0, sx * 0.3, sx * (look.browAngle ?? 0.18)], outline: 0 });
  }
  b.part(head, new THREE.ConeGeometry(0.008, 0.024, 4), m.skin, { p: [0, 0.075, 0.111], r: [1.9, 0, 0], outline: 0.003 });
  if (look.headgear !== 'mask') b.part(head, new THREE.BoxGeometry(0.03, 0.005, 0.004), m.mouth, { p: [0, 0.047, 0.106], r: [-0.3, 0, 0], outline: 0 });
  if (look.scar) b.part(head, new THREE.BoxGeometry(0.004, 0.05, 0.004), m.mouth, { p: [0.045, 0.1, 0.106], r: [0, 0.3, 0.3], outline: 0 });
  buildHair(b, head, m, look);
  buildHeadgear(b, head, m, look);

  const armR = buildArm(b, chest, -1, m);
  buildArm(b, chest, 1, m);
  buildLeg(b, hips, -1, m);
  buildLeg(b, hips, 1, m);

  const sword = buildSword(b, m);
  sword.group.position.set(0, 0.055, 0);
  armR.hand.add(sword.group);
  // a plain steel blade: the energy lines take the clan glow faintly, the aura shell stays off
  if (sword.energyMat) {
    sword.energyMat.color.set(look.glow);
    sword.energyMat.opacity = 0.18;
  }
  sword.group.traverse((o) => {
    if (o.isMesh && o.material === sword.auraMat) o.visible = false;
  });

  root.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  mergeStaticParts(root);
  const outlines = [];
  root.traverse((o) => {
    if (o.isMesh && o.userData.isOutline) outlines.push(o);
  });

  // every toon material can flash white when this fighter is hit
  const flashMats = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) if (mat && mat.isMeshToonMaterial && mat.emissive && !flashMats.includes(mat)) flashMats.push(mat);
  });

  return { root, joints: b.joints, sword, sheathedSlot, panels, materials: m, flashMats, outlines };
}

