// Draw-call reduction for procedural rigs: merges the static meshes attached to each joint
// that share a material, outline thickness and shadow flag into a single mesh.
// Joints (Object3D) are untouched, so procedural animation keeps working.
import * as THREE from 'three';
import { addOutline } from '../world/materials.js';

function mergeGeometries(list) {
  let vCount = 0;
  let iCount = 0;
  const hasUv = list.every((g) => g.attributes.uv);
  for (const g of list) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nrm = new Float32Array(vCount * 3);
  const uv = hasUv ? new Float32Array(vCount * 2) : null;
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const p = g.attributes.position;
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos[(vo + i) * 3] = p.getX(i);
      pos[(vo + i) * 3 + 1] = p.getY(i);
      pos[(vo + i) * 3 + 2] = p.getZ(i);
      nrm[(vo + i) * 3] = n.getX(i);
      nrm[(vo + i) * 3 + 1] = n.getY(i);
      nrm[(vo + i) * 3 + 2] = n.getZ(i);
      if (uv) {
        uv[(vo + i) * 2] = g.attributes.uv.getX(i);
        uv[(vo + i) * 2 + 1] = g.attributes.uv.getY(i);
      }
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
      io += g.index.count;
    } else {
      for (let i = 0; i < p.count; i++) idx[io + i] = vo + i;
      io += p.count;
    }
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/**
 * Merges mergeable child meshes of every node under `root`.
 * A mesh is mergeable when it has a single material, no children other than its outline,
 * and is not flagged `userData.noMerge`. Outline hulls are rebuilt on the merged mesh.
 */
export function mergeStaticParts(root) {
  const nodes = [];
  root.traverse((o) => {
    if (!o.isMesh) nodes.push(o);
  });
  let before = 0;
  let after = 0;
  for (const node of nodes) {
    const groups = new Map();
    for (const child of [...node.children]) {
      if (!child.isMesh || child.userData.isOutline) continue;
      before++;
      if (child.userData.noMerge || Array.isArray(child.material)) continue;
      const extra = child.children.filter((c) => !c.userData.isOutline);
      if (extra.length) continue;
      const outline = child.children.find((c) => c.userData.isOutline);
      const thickness = outline ? outline.material.uniforms.uThickness.value : 0;
      const key = `${child.material.uuid}|${thickness}|${child.castShadow}|${child.renderOrder}`;
      if (!groups.has(key)) groups.set(key, { material: child.material, thickness, castShadow: child.castShadow, renderOrder: child.renderOrder, meshes: [] });
      groups.get(key).meshes.push(child);
    }
    for (const g of groups.values()) {
      if (g.meshes.length < 2) continue;
      const geos = g.meshes.map((m) => {
        m.updateMatrix();
        const geo = m.geometry.clone();
        geo.applyMatrix4(m.matrix);
        return geo;
      });
      const merged = new THREE.Mesh(mergeGeometries(geos), g.material);
      merged.castShadow = g.castShadow;
      merged.renderOrder = g.renderOrder;
      merged.userData.merged = g.meshes.length;
      if (g.thickness > 0) addOutline(merged, g.thickness);
      for (const m of g.meshes) {
        node.remove(m);
        m.geometry.dispose();
      }
      for (const geo of geos) geo.dispose();
      node.add(merged);
    }
  }
  root.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline) after++;
  });
  return { before, after };
}
