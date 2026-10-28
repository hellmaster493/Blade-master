// The arena host: owns the lights, fog and sky dome, and loads one map at a time from
// world/maps. Every map shares the same playable circle (ARENA.radius) and boundary; maps
// differ in sky, ground, props (with circle colliders), lighting and weather.
// Also provides the dimming hook the ultimate's cinematic uses.
import * as THREE from 'three';
import { MAPS, mapById } from './maps/index.js';
import { SKY_VERT } from './maps/common.js';

const SHADOW_HALF = 32;
const SUN_DIST = 70;

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Arena';
    scene.add(this.group);
    this.colliders = [];
    this.dim = 1;
    this.time = 0;
    this.pixelScale = 600; // screen-space size factor for weather particles (set by the game)
    this.map = null;
    this.mapGroup = null;
    this.textures = [];
    this.timedMats = [];
    this.dimmedMats = [];
    this.updaters = [];
    this.dimHooks = [];
    this.weather = [];
    this.focus = new THREE.Vector3();
    this.sunDir = new THREE.Vector3(-18, 34, 16).normalize();
    this.buildLights();
    this.buildSky();
  }

  get maps() {
    return MAPS;
  }

  // The light rig is fixed (one hemisphere, a shadow-casting key and an accent) so switching
  // maps never changes the light count, which would force every material to recompile.
  buildLights() {
    const s = this.scene;
    s.fog = new THREE.FogExp2(0x120f22, 0.011);
    this.hemi = new THREE.HemisphereLight(0x8da0e6, 0x2b1d36, 1.25);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xd6e0ff, 2.4);
    this.sun.position.set(-18, 34, 16);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    // the shadow box follows the action (see setFocus), so the big arena keeps crisp shadows
    sc.left = -SHADOW_HALF;
    sc.right = SHADOW_HALF;
    sc.top = SHADOW_HALF;
    sc.bottom = -SHADOW_HALF;
    sc.near = 1;
    sc.far = 150;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    s.add(this.sun);
    s.add(this.sun.target);
    this.accent = new THREE.DirectionalLight(0xff4f8a, 0.7);
    this.accent.position.set(12, 18, -24);
    s.add(this.accent);
    this.riftLight = this.accent; // older name, kept for callers
    this.base = { hemi: 1.25, sun: 2.4, accent: 0.7 };
  }

  buildSky() {
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
  }

  // ------------------------------------------------------------------ map API (used by world/maps)
  add(obj) {
    this.mapGroup.add(obj);
    return obj;
  }

  /** Registers a texture to dispose when the map unloads. */
  track(texture) {
    this.textures.push(texture);
    return texture;
  }

  /** Material whose uTime uniform should follow the arena clock. */
  timed(mat) {
    this.timedMats.push(mat);
    return mat;
  }

  /** Material whose uDim uniform follows the cinematic dimming (never below `floor`). */
  dimmed(mat, floor = 0.4) {
    this.dimmedMats.push([mat, floor]);
    return mat;
  }

  onUpdate(fn) {
    this.updaters.push(fn);
  }

  onDim(fn) {
    this.dimHooks.push(fn);
  }

  setSky(fragmentShader, uniforms = {}) {
    const old = this.sky.material;
    this.sky.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDim: { value: 1 }, ...uniforms },
      vertexShader: SKY_VERT,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    old.dispose();
  }

  setLighting({ fog, hemi, sun, accent }) {
    const f = this.scene.fog;
    f.color.set(fog[0]);
    f.density = fog[1];
    this.hemi.color.set(hemi[0]);
    this.hemi.groundColor.set(hemi[1]);
    this.sun.color.set(sun[0]);
    this.sunDir.set(...sun[2]).normalize();
    this.setFocus(this.focus);
    this.accent.color.set(accent[0]);
    this.accent.position.set(...accent[2]);
    this.base = { hemi: hemi[2], sun: sun[1], accent: accent[1] };
  }

  // ------------------------------------------------------------------ loading
  /** Builds a map by id (no-op if it is already loaded). Returns the map definition. */
  load(id) {
    const def = mapById(id);
    if (this.map === def) return def;
    this.unload();
    this.map = def;
    this.mapGroup = new THREE.Group();
    this.mapGroup.name = 'Map:' + def.id;
    this.group.add(this.mapGroup);
    def.build(this);
    this.setDim(this.dim);
    this.update(0);
    return def;
  }

  unload() {
    if (!this.mapGroup) return;
    this.mapGroup.traverse((o) => {
      // sprites share one geometry across the whole app; never dispose it
      if (o.geometry && !o.isSprite) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) m.dispose();
    });
    this.group.remove(this.mapGroup);
    for (const t of this.textures) t.dispose();
    this.textures.length = 0;
    this.timedMats.length = 0;
    this.dimmedMats.length = 0;
    this.updaters.length = 0;
    this.dimHooks.length = 0;
    this.weather.length = 0;
    this.colliders.length = 0;
    this.mapGroup = null;
    this.map = null;
  }

  /** Centres the shadow box and the weather on the action (snapped to shadow texels to avoid shimmer). */
  setFocus(p) {
    this.focus.copy(p);
    const texel = (2 * SHADOW_HALF) / this.sun.shadow.mapSize.x;
    const x = Math.round(p.x / texel) * texel;
    const z = Math.round(p.z / texel) * texel;
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x + this.sunDir.x * SUN_DIST, this.sunDir.y * SUN_DIST, z + this.sunDir.z * SUN_DIST);
    for (const m of this.weather) m.uniforms.uCenter.value.set(p.x, p.z);
  }

  setPixelScale(v) {
    this.pixelScale = v;
    for (const m of this.weather) m.uniforms.uScale.value = v;
  }

  /** 1 = normal lighting, lower values dim the arena (used by the ultimate). */
  setDim(k) {
    this.dim = k;
    this.hemi.intensity = this.base.hemi * (0.25 + 0.75 * k);
    this.sun.intensity = this.base.sun * (0.3 + 0.7 * k);
    this.accent.intensity = this.base.accent * (1.6 - 0.6 * k);
    const su = this.sky.material.uniforms;
    if (su) su.uDim.value = 0.35 + 0.65 * k;
    for (const [m, floor] of this.dimmedMats) m.uniforms.uDim.value = floor + (1 - floor) * k;
    for (const fn of this.dimHooks) fn(k);
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    const su = this.sky.material.uniforms;
    if (su) su.uTime.value = t;
    for (const m of this.timedMats) m.uniforms.uTime.value = t;
    for (const fn of this.updaters) fn(t, dt);
  }
}
