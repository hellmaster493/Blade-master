// Pooled additive impact flashes (camera-facing sprites).
import * as THREE from 'three';
import { glowTexture, starTexture } from '../world/materials.js';
import { Ease } from '../core/mathutils.js';

export class Flashes {
  constructor(scene, capacity = 28) {
    this.items = [];
    const tex = { glow: glowTexture(), star: starTexture() };
    for (let i = 0; i < capacity; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex.star,
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.renderOrder = 16;
      scene.add(sprite);
      this.items.push({ sprite, mat, active: false, t: 0, life: 0.2, size: 1, opacity: 1 });
    }
    this.tex = tex;
  }

  spawn({ position, color = 0xffffff, size = 1.2, life = 0.18, kind = 'star', rotation = Math.random() * Math.PI, opacity = 1 }) {
    let it = this.items.find((x) => !x.active);
    if (!it) it = this.items.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    it.active = true;
    it.t = 0;
    it.life = life;
    it.size = size;
    it.opacity = opacity;
    it.mat.map = this.tex[kind] || this.tex.star;
    it.mat.color.set(color);
    it.mat.rotation = rotation;
    it.mat.opacity = opacity;
    it.sprite.position.copy(position);
    it.sprite.scale.setScalar(size * 0.3);
    it.sprite.visible = true;
    return it;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt;
      const k = it.t / it.life;
      if (k >= 1) {
        it.active = false;
        it.sprite.visible = false;
        continue;
      }
      it.sprite.scale.setScalar(it.size * (0.3 + 0.7 * Ease.outExpo(k)));
      it.mat.opacity = it.opacity * (1 - Ease.inQuad(k));
    }
  }

  clear() {
    for (const it of this.items) {
      it.active = false;
      it.sprite.visible = false;
    }
  }

  get activeCount() {
    return this.items.reduce((n, it) => n + (it.active ? 1 : 0), 0);
  }
}
