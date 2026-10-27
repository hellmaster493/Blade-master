// Title / character select, pause, settings, controls and results screens.
import { PORTRAIT, LOGO_MARK, ICONS } from './icons.js';
import { KAIRO, DAMAGE } from '../config.js';

export class Menus {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.title = root.querySelector('#title-screen');
    this.pause = root.querySelector('#pause-menu');
    this.results = root.querySelector('#results');
    this.settings = root.querySelector('#settings-panel');
    this.controls = root.querySelector('#controls-panel');
    this.returnTo = null;
    this.fill();
    this.wire();
  }

  fill() {
    this.root.querySelector('.logo-icon').innerHTML = LOGO_MARK;
    this.root.querySelector('.card-portrait').innerHTML = PORTRAIT;
    const icons = this.root.querySelectorAll('[data-icon]');
    icons.forEach((n) => (n.innerHTML = ICONS[n.dataset.icon] || ''));
    const stats = this.root.querySelector('.card-stats');
    stats.innerHTML = `
      <div><span>Health</span><b>${KAIRO.maxHealth}</b></div>
      <div><span>Run speed</span><b>${KAIRO.runSpeed} m/s</b></div>
      <div><span>Combo</span><b>${DAMAGE.quickDraw} · ${DAMAGE.crosswind} · ${DAMAGE.galeBreaker}</b></div>
      <div><span>Dash i-frames</span><b>${Math.round(KAIRO.dash.iframes * 1000)} ms</b></div>`;
  }

  wire() {
    const g = this.game;
    const on = (sel, fn) => this.root.querySelectorAll(sel).forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault();
      g.audio.unlock();
      g.audio.play('ui');
      fn(b);
    }));
    on('[data-mode]', (b) => g.startMatch(b.dataset.mode));
    on('[data-action="resume"]', () => g.resume());
    on('[data-action="restart"]', () => g.startMatch(g.mode));
    on('[data-action="quit"]', () => g.quitToTitle());
    on('[data-action="settings"]', (b) => this.open(this.settings, b.closest('.screen')));
    on('[data-action="controls"]', (b) => this.open(this.controls, b.closest('.screen')));
    on('[data-action="back"]', () => this.back());

    const s = g.settings;
    const vol = this.root.querySelector('#set-volume');
    const mute = this.root.querySelector('#set-mute');
    const sens = this.root.querySelector('#set-sens');
    const shake = this.root.querySelector('#set-shake');
    const bloom = this.root.querySelector('#set-bloom');
    vol.value = Math.round(s.volume * 100);
    mute.checked = s.muted;
    sens.value = Math.round(s.sensitivity * 100);
    shake.value = Math.round(s.shake * 100);
    bloom.checked = s.bloom;
    const apply = () => {
      g.applySettings({
        volume: vol.value / 100,
        muted: mute.checked,
        sensitivity: sens.value / 100,
        shake: shake.value / 100,
        bloom: bloom.checked,
      });
      this.syncLabels();
    };
    for (const i of [vol, mute, sens, shake, bloom]) i.addEventListener('input', apply);
    this.inputs = { vol, mute, sens, shake, bloom };
    this.syncLabels();
  }

  syncLabels() {
    const { vol, sens, shake } = this.inputs;
    this.root.querySelector('#lbl-volume').textContent = vol.value + '%';
    this.root.querySelector('#lbl-sens').textContent = (sens.value / 100).toFixed(2) + 'x';
    this.root.querySelector('#lbl-shake').textContent = shake.value + '%';
  }

  refreshSettings() {
    const s = this.game.settings;
    this.inputs.mute.checked = s.muted;
    this.inputs.vol.value = Math.round(s.volume * 100);
    this.syncLabels();
  }

  hideAll() {
    for (const s of [this.title, this.pause, this.results, this.settings, this.controls]) s.classList.add('hidden');
  }

  open(panel, from) {
    this.returnTo = from;
    this.hideAll();
    panel.classList.remove('hidden');
  }

  back() {
    this.hideAll();
    if (this.returnTo) this.returnTo.classList.remove('hidden');
  }

  showTitle() {
    this.hideAll();
    this.title.classList.remove('hidden');
  }

  showPause() {
    this.hideAll();
    this.pause.classList.remove('hidden');
  }

  showResults(victory, stats) {
    this.hideAll();
    const r = this.results;
    r.classList.toggle('victory', victory);
    r.classList.toggle('defeat', !victory);
    r.querySelector('.res-title').textContent = victory ? 'VICTORY' : 'DEFEATED';
    r.querySelector('.res-sub').textContent = victory ? 'The Rift is sealed. Kurokaze returns to its sheath.' : 'The Blade Master falls... but the Tempest will rise again.';
    const t = Math.floor(stats.time);
    r.querySelector('.res-stats').innerHTML = `
      <div><span>Time</span><b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b></div>
      <div><span>Max combo</span><b>${stats.maxCombo}</b></div>
      <div><span>Damage dealt</span><b>${Math.round(stats.damage)}</b></div>
      <div><span>Enemies defeated</span><b>${stats.kills}</b></div>
      <div><span>Perfect dodges</span><b>${stats.perfect}</b></div>`;
    r.classList.remove('hidden');
  }
}
