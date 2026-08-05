import { DIFFICULTIES } from './Settings.js';

export class PauseMenu {
  constructor() {
    this.els = {
      root: document.getElementById('pause-menu'),
      title: document.getElementById('pause-menu-title'),
      tabs: document.querySelectorAll('.pause-tab'),
      panels: document.querySelectorAll('.pause-panel'),
      sound: document.getElementById('setting-sfx'),
      soundVal: document.getElementById('setting-sfx-val'),
      music: document.getElementById('setting-music'),
      musicVal: document.getElementById('setting-music-val'),
      light: document.getElementById('setting-light'),
      lightVal: document.getElementById('setting-light-val'),
      difficultyList: document.getElementById('difficulty-list'),
      btnResume: document.getElementById('btn-pause-resume'),
      btnQuitMaps: document.getElementById('btn-quit-maps'),
      btnClose: document.getElementById('btn-pause-close'),
    };
    this.open = false;
    this.activeTab = 'settings';
    this._buildDifficultyButtons();
  }

  _buildDifficultyButtons() {
    this.difficultyButtons = new Map();
    this.els.difficultyList.innerHTML = '';

    for (const def of DIFFICULTIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'difficulty-btn';
      btn.dataset.difficulty = def.id;
      btn.innerHTML = `
        <span class="difficulty-label">${def.label}</span>
        <span class="difficulty-blurb">${def.blurb}</span>
      `;
      this.els.difficultyList.appendChild(btn);
      this.difficultyButtons.set(def.id, btn);
    }
  }

  /**
   * @param {import('./Game.js').Game} game
   */
  bind(game) {
    this.game = game;

    for (const tab of this.els.tabs) {
      tab.addEventListener('click', () => {
        const id = tab.dataset.tab;
        if (id) this.setTab(id);
      });
    }

    this.els.music.addEventListener('input', () => {
      const v = Number(this.els.music.value);
      this.els.musicVal.textContent = `${Math.round(v * 100)}%`;
      game.settings.setMusicVolume(v);
      game.audio.setMusicVolume(v);
    });

    this.els.sound.addEventListener('input', () => {
      const v = Number(this.els.sound.value);
      this.els.soundVal.textContent = `${Math.round(v * 100)}%`;
      game.settings.setSfxVolume(v);
      game.audio.setSfxVolume(v);
    });

    this.els.light.addEventListener('input', () => {
      const v = Number(this.els.light.value);
      this.els.lightVal.textContent = v.toFixed(2);
      game.settings.setLightLevel(v);
      game.setLightLevel(v);
    });

    for (const [id, btn] of this.difficultyButtons) {
      btn.addEventListener('click', () => {
        game.settings.setDifficulty(id);
        this.syncDifficulty();
        game.audio.uiClick();
      });
    }

    this.els.btnResume.addEventListener('click', () => game.closePauseMenu());
    this.els.btnQuitMaps?.addEventListener('click', () => game.quitToMapSelect());
    this.els.btnClose.addEventListener('click', () => game.closePauseMenu());

    game.settings.onChange(() => this.syncFromSettings());
    this.syncFromSettings();
  }

  syncFromSettings() {
    const { sfxVolume, musicVolume, lightLevel } = this.game.settings;
    this.els.music.value = String(musicVolume);
    this.els.musicVal.textContent = `${Math.round(musicVolume * 100)}%`;
    this.els.sound.value = String(sfxVolume);
    this.els.soundVal.textContent = `${Math.round(sfxVolume * 100)}%`;
    this.els.light.value = String(lightLevel);
    this.els.lightVal.textContent = lightLevel.toFixed(2);
    this.syncDifficulty();
  }

  syncDifficulty() {
    const current = this.game.settings.difficulty;
    for (const [id, btn] of this.difficultyButtons) {
      btn.classList.toggle('is-selected', id === current);
    }
  }

  /** @param {string} tabId */
  setTab(tabId) {
    this.activeTab = tabId;
    for (const tab of this.els.tabs) {
      tab.classList.toggle('is-active', tab.dataset.tab === tabId);
    }
    for (const panel of this.els.panels) {
      panel.classList.toggle('hidden', panel.dataset.panel !== tabId);
    }
  }

  /** @param {'playing' | 'title' | 'other'} mode */
  show(mode) {
    this.open = true;
    this.els.root.classList.remove('hidden');
    this.els.title.textContent = mode === 'playing' ? 'Paused' : 'Menu';
    this.els.btnResume.classList.toggle('hidden', mode !== 'playing');
    this.els.btnQuitMaps?.classList.toggle('hidden', mode !== 'playing');
    this.els.btnClose.classList.toggle('hidden', mode === 'playing');
    this.setTab(this.activeTab);
  }

  hide() {
    this.open = false;
    this.els.root.classList.add('hidden');
  }
}
