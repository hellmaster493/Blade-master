// Entry point: boots the game and exposes a small debug/test API on window.__RIFT__.
import * as THREE from 'three';
import { Game } from './game.js';

function fatal(msg) {
  const el = document.getElementById('fatal');
  el.textContent = msg;
  el.classList.remove('hidden');
  const loading = document.getElementById('loading');
  if (loading) loading.remove();
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

if (!webglAvailable()) {
  fatal('WebGL is not available in this browser, so the arena cannot be rendered.');
} else {
  let game;
  try {
    game = new Game(document.getElementById('game'), document.getElementById('ui'));
  } catch (err) {
    console.error(err);
    fatal('Failed to start: ' + err.message);
  }
  if (game) {
    document.getElementById('loading').remove();
    window.__RIFT__ = createDebugApi(game);
  }
}

/** Deterministic hooks for automated tests (step the simulation without real time). */
function createDebugApi(game) {
  const v = new THREE.Vector3();
  const api = {
    game,
    THREE,
    /** Stop the real-time loop so tests can advance time explicitly. */
    manual(on = true) {
      game.debug.manual = on;
      game.last = performance.now();
    },
    step(dt = 1 / 60, n = 1, render = false) {
      for (let i = 0; i < n; i++) game.frame(dt, render && i === n - 1);
    },
    render() {
      game.render();
    },
    press(code) {
      game.input.inject(code, true);
    },
    release(code) {
      game.input.inject(code, false);
    },
    tap(code) {
      game.input.tap(code);
    },
    spawn(type, x, z, opts) {
      const e = game.director.spawn(type, x, z, opts);
      e.state = 'chase';
      e.stateT = 0;
      e.object.scale.setScalar(e.cfg.scale);
      return e.id;
    },
    enemy(id) {
      return game.director.enemies.find((e) => e.id === id);
    },
    clearEnemies() {
      for (const e of game.director.enemies) {
        game.combat.unregister(e);
        e.dispose();
      }
      game.director.enemies.length = 0;
      game.director.queue.length = 0;
      game.director.boss = null;
      game.director.tokens = 0;
    },
    setEnergy(x) {
      game.player.energy = x;
    },
    snapshot() {
      const k = game.player;
      const sword = k.sword.group;
      const hand = k.model.joints.get('handR');
      return {
        state: game.state,
        mode: game.mode,
        simTime: game.simTime,
        kairo: {
          state: k.state,
          action: k.act.move ? k.act.move.id : k.ultimate.active ? 'ultimate:' + k.ultimate.stage : null,
          actionT: k.act.t,
          pos: k.position.toArray().map((n) => +n.toFixed(3)),
          facing: +k.facing.toFixed(3),
          vel: k.velocity.toArray().map((n) => +n.toFixed(3)),
          hp: k.hp,
          energy: +k.energy.toFixed(2),
          grounded: k.grounded,
          invuln: k.invulnT,
          comboStep: k.comboStep,
          hitCount: k.hitCount,
          damageDealt: k.damageDealt,
          perfectDodges: k.perfectDodges,
          lock: k.lockTarget ? k.lockTarget.id : null,
          cooldowns: { crescent: k.cooldowns.remaining('crescent'), cyclone: k.cooldowns.remaining('cyclone'), dash: k.cooldowns.remaining('dash') },
          swordParent: sword.parent ? sword.parent.name : null,
          swordHandDist: +sword.getWorldPosition(v).distanceTo(hand.getWorldPosition(new THREE.Vector3())).toFixed(3),
          ultimateActive: k.ultimate.active,
          ultimateStage: k.ultimate.stage,
          sheathed: k.swordSheathed,
        },
        enemies: game.director.enemies.map((e) => ({ id: e.id, type: e.type, hp: e.hp, state: e.state, pos: e.position.toArray().map((n) => +n.toFixed(2)) })),
        director: { state: game.director.state, wave: game.director.wave, alive: game.director.aliveCount },
        fx: game.fx.stats(),
        projectiles: game.projectiles.activeCount,
        hitstop: game.hitstopT,
        dim: game.arena.dim,
        cinematic: game.cinematic.active,
        matchOver: game.matchOver,
      };
    },
  };
  return api;
}
