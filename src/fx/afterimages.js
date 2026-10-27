// Pooled translucent copies of the character for dash / flash-step afterimages.
// Ghost rigs are built once with the same joint names as the live rig, then posed by copying transforms.
import * as THREE from 'three';

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

export class Afterimages {
  /** @param buildGhost (material) => { root: THREE.Object3D, joints: Map<string, THREE.Object3D> } */
  constructor(scene, buildGhost, capacity = 10) {
    this.items = [];
    for (let i = 0; i < capacity; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x5ec8ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ghost = buildGhost(mat);
      ghost.root.visible = false;
      ghost.root.matrixAutoUpdate = true;
      scene.add(ghost.root);
      this.items.push({ ghost, mat, active: false, t: 0, life: 0.3, opacity: 0.5 });
    }
  }

  /** @param source { root, joints } of the live character. */
  spawn(source, { color = 0x5ec8ff, life = 0.32, opacity = 0.45 } = {}) {
    let it = this.items.find((x) => !x.active);
    if (!it) it = this.items.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    it.active = true;
    it.t = 0;
    it.life = life;
    it.opacity = opacity;
    it.mat.color.set(color);
    it.mat.opacity = opacity;
    const g = it.ghost;
    source.root.updateWorldMatrix(true, false);
    source.root.matrixWorld.decompose(_p, _q, _s);
    g.root.position.copy(_p);
    g.root.quaternion.copy(_q);
    g.root.scale.copy(_s);
    for (const [name, joint] of source.joints) {
      const gj = g.joints.get(name);
      if (!gj) continue;
      gj.position.copy(joint.position);
      gj.quaternion.copy(joint.quaternion);
    }
    g.root.visible = true;
    return it;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt;
      const k = it.t / it.life;
      if (k >= 1) {
        it.active = false;
        it.ghost.root.visible = false;
        continue;
      }
      it.mat.opacity = it.opacity * (1 - k) * (1 - k);
    }
  }

  clear() {
    for (const it of this.items) {
      it.active = false;
      it.ghost.root.visible = false;
    }
  }

  get activeCount() {
    return this.items.reduce((n, it) => n + (it.active ? 1 : 0), 0);
  }
}
