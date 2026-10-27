// Anime Legends: Rift Arena — game orchestrator.
// One requestAnimationFrame loop drives everything. Simulation time is scaled for hit-stop
// and slow-motion and sub-stepped so timing and hit detection hold at any frame rate.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Emitter } from './core/events.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { CombatSystem } from './combat/combat.js';
import { Arena } from './world/arena.js';
import { CameraRig } from './world/cameraRig.js';
import { FX, COLORS } from './fx/fx.js';
import { Kairo } from './characters/kairo/kairo.js';
import { buildKairo } from './characters/kairo/kairoModel.js';
import { Projectiles } from './enemies/projectiles.js';
import { WaveDirector } from './enemies/director.js';
import { RiftGhoul } from './enemies/riftGhoul.js';
import { ShadeCaster } from './enemies/shadeCaster.js';
import { RiftWarden } from './enemies/boss.js';
import { HUD } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { ScreenFX } from './ui/screenfx.js';
import { KAIRO, LOCK_ON_RANGE } from './config.js';
import { clamp } from './core/mathutils.js';

const SETTINGS_KEY = 'rift-arena-settings-v1';
const DEFAULT_SETTINGS = { volume: 0.7, muted: false, sensitivity: 1, shake: 1, bloom: true };
const MAX_STEP = 1 / 60;
const MAX_SUBSTEPS = 6;

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_SETTINGS };
}

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.ui = uiRoot;
    this.state = 'title';
    this.mode = 'assault';
    this.simTime = 0;
    this.matchTime = 0;
    this.hitstopT = 0;
    this.slowT = 0;
    this.slowScale = 1;
    this.matchOver = false;
    this.trainingAggro = false;
    this.trainingCharge = false;
    this.pendingResult = null;
    this.debug = { manual: false, frames: 0 };
    this.settings = loadSettings();

    // ---- renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.45, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // ---- systems
    this.events = new Emitter();
    this.input = new Input();
    this.audio = new AudioEngine();
    this.combat = new CombatSystem(this.events);
    this.arena = new Arena(this.scene);
    this.fx = new FX(this.scene);
    this.fx.initAfterimages((mat) => {
      const k = buildKairo(mat);
      return { root: k.root, joints: k.joints };
    }, 12);
    this.cameraRig = new CameraRig(this.camera);
    this.player = new Kairo(this);
    this.scene.add(this.player.object);
    this.combat.register(this.player);
    this.projectiles = new Projectiles(this);
    this.director = new WaveDirector(this);
    this.screen = new ScreenFX(uiRoot);
    this.fx.screen = this.screen;
    this.hud = new HUD(uiRoot.querySelector('#hud'), this);
    this.menus = new Menus(uiRoot, this);
    this.cinematic = this.createCinematic();
    this.applySettings(this.settings, false);
    this.wireEvents();
    this.wireInput();

    this.resetWorld();
    if (!new URLSearchParams(location.search).has('noprewarm')) this.prewarm();
    this.enterTitle();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ setup
  createCinematic() {
    const game = this;
    return {
      active: false,
      begin() {
        this.active = true;
        game.screen.letterbox(true);
        game.screen.vignette(true, 0.7);
      },
      setDim(k) {
        game.arena.setDim(clamp(k, 0, 1));
      },
      end(immediate = false) {
        this.active = false;
        game.screen.letterbox(false);
        game.screen.vignette(false);
        if (immediate) game.arena.setDim(1);
      },
    };
  }

  wireEvents() {
    const ev = this.events;
    ev.on('hit', ({ target, hit, result }) => {
      if (target === this.player) return;
      const pos = hit.point || target.anchor(new THREE.Vector3());
      this.hud.damageNumber(pos, result.damage, { crimson: hit.crimson, heavy: hit.kind === 'heavy' });
    });
    ev.on('kill', ({ target }) => {
      if (target !== this.player) this.director.kills++;
    });
    ev.on('combo', ({ count }) => this.hud.comboHit(count));
    ev.on('comboEnd', () => this.hud.comboEnd());
    ev.on('cooldownReady', (id) => {
      if (id !== 'dash') this.audio.play('ready');
    });
    ev.on('ultimateReady', () => {
      this.hud.message('CRIMSON TEMPEST READY', 'ult-msg', 1.6);
      this.audio.play('ready');
    });
    ev.on('denied', (id) => this.hud.denied(id));
    ev.on('waveStart', (w) => {
      this.hud.showBanner(w.name, w.title);
      this.audio.play(w.boss ? 'roar' : 'wave');
    });
    ev.on('waveClear', () => {
      this.hud.message('WAVE CLEAR', 'clear-msg', 1.8);
      const heal = KAIRO.maxHealth * 0.15;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
    });
    ev.on('victory', () => this.onVictory());
    ev.on('playerDefeated', () => this.onDefeat());
    ev.on('poiseBreak', (e) => {
      if (e.isBoss) this.hud.message('GUARD BREAK!', 'small-msg', 1.0);
    });
    ev.on('bossPhase', () => this.hud.message('THE WARDEN IS ENRAGED', 'boss-msg', 1.8));
  }

  wireInput() {
    const input = this.input;
    input.attach(this.canvas);
    input.onEscape = () => {
      if (this.state === 'playing' && !this.matchOver) this.pause();
      else if (this.state === 'paused') this.resume();
    };
    input.onPointerLockLost = () => {
      if (this.state === 'playing' && !this.matchOver) this.pause();
    };
    input.onFocusLost = () => {
      if (this.state === 'playing' && !this.matchOver) this.pause();
    };
  }

  applySettings(s, save = true) {
    this.settings = { ...this.settings, ...s };
    this.audio.setVolume(this.settings.volume);
    this.audio.setMuted(this.settings.muted);
    this.cameraRig.sensitivity = this.settings.sensitivity;
    this.cameraRig.shakeScale = this.settings.shake;
    if (save) {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
      } catch {
        /* ignore */
      }
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.screen.resize();
  }

  /**
   * Compiles every shader up front (pooled effects and each enemy type are briefly made
   * visible) so the first slash, ultimate or boss spawn never stalls on shader compilation.
   */
  prewarm() {
    const temp = [new RiftGhoul(this), new ShadeCaster(this), new RiftWarden(this)];
    temp.forEach((e, i) => {
      e.position.set(60 + i * 5, 0, 60);
      this.scene.add(e.object);
    });
    const hidden = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    try {
      this.renderer.compile(this.scene, this.camera);
      this.composer.render();
    } catch (err) {
      console.warn('Shader prewarm skipped:', err);
    }
    for (const o of hidden) o.visible = false;
    for (const e of temp) e.dispose();
  }

  // ------------------------------------------------------------------ flow
  get controllable() {
    return this.state === 'playing' && !this.matchOver && !this.player.isDefeated();
  }

  resetWorld() {
    this.player.reset(new THREE.Vector3(0, 0, -3), 0);
    this.director.reset();
    this.fx.clear();
    this.projectiles.clear();
    this.combat.clear();
    this.combat.register(this.player);
    this.cinematic.end(true);
    this.screen.clear();
    this.hud.reset();
    this.cameraRig.reset(0, this.player.position);
    this.hitstopT = 0;
    this.slowT = 0;
    this.simTime = 0;
    this.matchTime = 0;
    this.matchOver = false;
    this.trainingAggro = false;
    this.pendingResult = null;
    this.player.lockTarget = null;
  }

  enterTitle() {
    this.state = 'title';
    this.input.enabled = false;
    this.input.clear();
    this.hud.show(false);
    this.menus.showTitle();
    this.cameraRig.title = true;
    this.player.facing = 0;
    this.player.glowTarget = 0.45;
  }

  startMatch(mode = 'assault') {
    this.audio.unlock();
    this.mode = mode;
    this.resetWorld();
    this.state = 'playing';
    this.trainingCharge = mode === 'training';
    this.cameraRig.title = false;
    this.cameraRig.reset(0, this.player.position);
    this.camera.fov = this.cameraRig.fovBase;
    this.camera.updateProjectionMatrix();
    this.menus.hideAll();
    this.hud.show(true);
    this.input.enabled = true;
    this.input.clear();
    this.input.requestPointerLock();
    this.director.start(mode);
    if (mode === 'training') this.hud.showBanner('TRAINING GROUNDS', 'Master the Blade');
    this.events.emit('matchStart', { mode });
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.input.clear();
    this.input.exitPointerLock();
    this.menus.showPause();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.menus.hideAll();
    this.state = 'playing';
    this.input.enabled = true;
    this.input.clear();
    this.input.requestPointerLock();
    this.last = performance.now();
  }

  quitToTitle() {
    this.input.exitPointerLock();
    this.resetWorld();
    this.enterTitle();
  }

  onVictory() {
    if (this.matchOver) return;
    this.matchOver = true;
    this.player.lockTarget = null;
    this.player.celebrate();
    this.hud.message('VICTORY', 'victory-msg', 2.6);
    this.audio.play('victory');
    this.pendingResult = { victory: true, t: 3.6 };
  }

  onDefeat() {
    if (this.matchOver) return;
    this.matchOver = true;
    this.player.lockTarget = null;
    this.hud.message('DEFEATED', 'defeat-msg', 2.4);
    this.audio.play('defeat');
    this.pendingResult = { victory: false, t: 2.8 };
  }

  showResults(victory) {
    this.state = 'over';
    this.input.enabled = false;
    this.input.exitPointerLock();
    const p = this.player;
    this.menus.showResults(victory, {
      time: this.matchTime, maxCombo: p.maxCombo, damage: p.damageDealt, kills: this.director.kills, perfect: p.perfectDodges,
    });
  }

  // ------------------------------------------------------------------ gameplay hooks
  hitstop(d) {
    if (d > 0) this.hitstopT = Math.min(0.16, Math.max(this.hitstopT, d));
  }

  slowmo(duration, scale) {
    this.slowT = Math.max(this.slowT, duration);
    this.slowScale = scale;
  }

  shake(amount) {
    if (amount > 0) this.cameraRig.shake(amount);
  }

  onPerfectDodge(k) {
    this.slowmo(KAIRO.dash.perfectSlowmo, 0.35);
    this.hud.message('PERFECT DODGE', 'perfect-msg', 1.2);
    this.audio.play('perfectDodge');
    this.screen.flash('blue', 0.22);
    const c = k.chestWorld(new THREE.Vector3());
    this.fx.flash({ position: c, color: COLORS.blue, size: 3, life: 0.3, kind: 'glow', opacity: 0.7 });
    this.fx.ring({ position: k.position, radius: 2.6, life: 0.4, width: 0.12, inner: COLORS.blue, outer: 0xffffff });
    this.cameraRig.kick(6);
    this.events.emit('perfectDodge', k);
  }

  onPlayerHit(enemy, res, hit) {
    this.hud.damageNumber(this.player.chestWorld(new THREE.Vector3()), res.damage, { player: true });
    this.screen.hurtPulse(0.55);
    this.shake(0.35);
    this.hitstop(0.05);
    this.fx.sparks(this.player.chestWorld(new THREE.Vector3()), { count: 10, speed: 6, colors: [COLORS.violet, 0xff6a7a], size: 0.06 });
  }

  toggleLock() {
    const p = this.player;
    if (p.lockTarget && !p.lockTarget.isDefeated()) {
      p.lockTarget = null;
    } else {
      p.lockTarget = this.combat.nearestOpponent('player', p.position, LOCK_ON_RANGE);
    }
    this.audio.play('ui');
  }

  cycleLock() {
    const p = this.player;
    const list = this.combat.opponents('player').sort((a, b) => a.position.distanceTo(p.position) - b.position.distanceTo(p.position));
    if (!list.length) return;
    const i = list.indexOf(p.lockTarget);
    p.lockTarget = list[(i + 1) % list.length];
    this.audio.play('ui');
  }

  onLockTargetLost() {
    const p = this.player;
    p.lockTarget = this.combat.nearestOpponent('player', p.position, 14);
  }

  // ------------------------------------------------------------------ loop
  loop(now) {
    requestAnimationFrame(this.loop);
    const realDt = clamp((now - this.last) / 1000, 0, 0.1);
    this.last = now;
    if (this.debug.manual) return;
    this.frame(realDt, true);
  }

  /** One rendered frame. `realDt` is wall-clock time; simulation time is derived from it. */
  frame(realDt, render = true) {
    this.debug.frames++;
    const input = this.input;
    if (this.state === 'playing' || this.state === 'over') {
      if (this.controllable) {
        if (input.wasPressed('KeyF')) this.toggleLock();
        if (input.wasPressed('Tab')) this.cycleLock();
        if (input.wasPressed('KeyT') && this.mode === 'training') {
          this.trainingAggro = !this.trainingAggro;
          this.hud.message(this.trainingAggro ? 'DUMMIES ATTACK: ON' : 'DUMMIES ATTACK: OFF', 'small-msg', 1);
        }
      }
      if (input.wasPressed('KeyM')) {
        this.applySettings({ muted: !this.settings.muted });
        this.menus.refreshSettings();
      }
      this.simulate(realDt);
      if (this.pendingResult) {
        this.pendingResult.t -= realDt;
        if (this.pendingResult.t <= 0) {
          const v = this.pendingResult.victory;
          this.pendingResult = null;
          this.showResults(v);
        }
      }
      this.cameraRig.update(realDt, {
        player: this.player,
        target: this.player.validLockTarget(),
        input: this.controllable ? input : null,
        colliders: this.arena.colliders,
      });
      this.hud.update(realDt);
    } else if (this.state === 'title') {
      this.player.update(realDt);
      this.fx.update(realDt);
      this.fx.updateTrail(this.simTime);
      this.cameraRig.update(realDt, { player: this.player, target: null, input: null, colliders: [] });
    }
    this.arena.update(realDt);
    this.screen.update(realDt, this.state === 'playing' ? clamp(1 - this.player.hp / (this.player.maxHp * 0.3), 0, 1) : 0);
    if (render) this.render();
    input.endFrame();
  }

  simulate(realDt) {
    let scale = 1;
    if (this.hitstopT > 0) {
      this.hitstopT -= realDt;
      scale = 0.04;
    } else if (this.slowT > 0) {
      this.slowT -= realDt;
      scale = this.slowScale;
    }
    const simDt = realDt * scale;
    const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(simDt / MAX_STEP - 1e-6)));
    const h = Math.min(simDt / steps, MAX_STEP);
    for (let i = 0; i < steps; i++) {
      this.step(h);
      // edge-triggered presses are consumed by the first sub-step only
      if (i === 0) this.input.pressed.clear();
    }
    if (this.state === 'playing' && !this.matchOver) this.matchTime += realDt;
    this.fx.update(simDt);
    this.fx.updateTrail(this.simTime);
    if (!this.cinematic.active && this.arena.dim < 1) this.arena.setDim(Math.min(1, this.arena.dim + realDt * 1.8));
  }

  step(h) {
    this.simTime += h;
    this.player.update(h);
    this.director.update(h);
    this.projectiles.update(h);
  }

  render() {
    if (this.settings.bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
