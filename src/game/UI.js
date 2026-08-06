import { getRepairAllCost, getRepairCost, getSellValue, getTowerStats, getUpgradeCost } from './TowerManager.js';
import { mountTowerPreview, setTowerPreviewsActive } from './TowerPreview.js';
import {
  canFetchGlobalLeaderboard,
  fetchGlobalLeaderboard,
  isGlobalLeaderboardConfigured,
  trySubmitGlobalRun,
} from '../lib/globalLeaderboard.js';
import { getBestWaves, setLeaderboardName } from '../lib/progress.js';
import {
  getMapBestWaves,
  getMapContinueCrystals,
  getMapLastSuccessfulWave,
  getMapMeta,
  getMapNumber,
  getMapUnlockHint,
  isMapUnlocked,
  MAP_LIST,
  UNLOCK_WAVE_REQUIREMENT,
} from '../lib/maps.js';

const ATTACK_LABELS = {
  direct: 'Direct bolt — fast single target',
  ballistic: 'Ballistic splash — area damage on impact',
  oil: 'Ignited oil — ground burn zone for 5s (5s reload)',
  turret: 'Rapid pulse — slows enemies while in range',
};

/** @param {object} def */
function buildTowerTooltip(def) {
  const lines = [
    `<strong>${def.name}</strong>`,
    def.description ?? '',
    `<span class="tooltip-stat">Cost: ${def.cost} cr · HP: ${def.maxHp}</span>`,
    `<span class="tooltip-stat">Range ${def.range} · Dmg ${def.damage} · ${def.fireRate}/s</span>`,
  ];
  if (def.splashRadius) {
    lines.push(`<span class="tooltip-stat">Splash radius: ${def.splashRadius}m</span>`);
  }
  if (def.oilBurnDps) {
    lines.push(
      `<span class="tooltip-stat">Oil burn: ${def.oilBurnDps} DPS · ${def.oilRadius ?? 2}m · ${def.oilDuration ?? 5}s</span>`,
    );
  }
  if (def.armorPierce) {
    lines.push(`<span class="tooltip-stat">Armor pierce: ${Math.round(def.armorPierce * 100)}%</span>`);
  }
  if (def.slowPercent) {
    lines.push(
      `<span class="tooltip-stat">Slow: ${Math.round(def.slowPercent * 100)}% while in range</span>`,
    );
  }
  lines.push(`<span class="tooltip-ability">${ATTACK_LABELS[def.attackType] ?? 'Standard attack'}</span>`);
  return lines.filter(Boolean).join('');
}

/** @param {string} text */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @param {number} ts */
function formatRunDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** @param {string} id */
function formatDifficultyLabel(id) {
  const labels = {
    casual: 'Casual',
    normal: 'Normal',
    veteran: 'Veteran',
    hard: 'Hard',
    nightmare: 'Nightmare',
  };
  return labels[id] ?? id;
}

/**
 * Display Map # KPI from a run or global meta row.
 * @param {{ map?: number, mapId?: string } | null | undefined} source
 */
function formatMapKpi(source) {
  const fromNumber = Number(source?.map);
  if (Number.isFinite(fromNumber) && fromNumber > 0) return String(Math.floor(fromNumber));
  if (typeof source?.mapId === 'string') {
    const n = getMapNumber(source.mapId);
    if (n > 0) return String(n);
  }
  return '—';
}

/**
 * @param {{ map?: number, mapId?: string } | null | undefined} source
 */
function formatMapKpiTitle(source) {
  const id = typeof source?.mapId === 'string' ? source.mapId : null;
  if (!id) return '';
  try {
    return getMapMeta(id).name;
  } catch {
    return '';
  }
}

export class UI {
  constructor() {
    this.els = {
      hud: document.getElementById('hud'),
      mapName: document.getElementById('hud-map-name'),
      crystals: document.getElementById('hud-crystals'),
      lives: document.getElementById('hud-lives'),
      wave: document.getElementById('hud-wave'),
      message: document.getElementById('hud-message'),
      hint: document.getElementById('hud-hint'),
      title: document.getElementById('title-screen'),
      titleHome: document.getElementById('title-home'),
      titleMaps: document.getElementById('title-maps'),
      titleHeading: document.getElementById('title-heading'),
      mapSelectGrid: document.getElementById('map-select-grid'),
      btnMaps: document.getElementById('btn-maps'),
      btnMapsBack: document.getElementById('btn-maps-back'),
      result: document.getElementById('result-screen'),
      resultTitle: document.getElementById('result-title'),
      resultMessage: document.getElementById('result-message'),
      towerToolbar: document.getElementById('tower-toolbar'),
      towerPanel: document.getElementById('tower-panel'),
      btnRepairAll: document.getElementById('btn-repair-all'),
      btnNextWave: document.getElementById('btn-next-wave'),
      btnToolbarMaps: document.getElementById('btn-toolbar-maps'),
      btnLeaderboard: document.getElementById('btn-leaderboard'),
      btnResult: document.getElementById('btn-result'),
      inspector: document.getElementById('tower-inspector'),
      inspectorName: document.getElementById('inspector-name'),
      inspectorStats: document.getElementById('inspector-stats'),
      btnUpgrade: document.getElementById('btn-upgrade'),
      btnRepair: document.getElementById('btn-repair'),
      btnSell: document.getElementById('btn-sell'),
      btnInspectorClose: document.getElementById('btn-inspector-close'),
      enemyInspector: document.getElementById('enemy-inspector'),
      enemyInspectorName: document.getElementById('enemy-inspector-name'),
      enemyInspectorStats: document.getElementById('enemy-inspector-stats'),
      btnEnemyInspectorClose: document.getElementById('btn-enemy-inspector-close'),
      announcement: document.getElementById('wave-announcement'),
      announceTitle: document.getElementById('wave-announce-title'),
      announceSubtitle: document.getElementById('wave-announce-subtitle'),
      onboardingBanner: document.getElementById('onboarding-banner'),
      leaderboard: document.getElementById('leaderboard-screen'),
      resultStats: document.getElementById('result-stats'),
    };
    this.towerButtons = new Map();
    this._announceTimer = 0;
    this._announceHideTimer = 0;
  }

  /**
   * @param {import('./Game.js').Game} game
   * @param {object[]} towerDefs
   */
  bind(game, towerDefs) {
    this.game = game;
    this.els.btnLeaderboard?.addEventListener('click', () => game.showLeaderboard());
    this.els.btnMaps?.addEventListener('click', () => this.showMapSelect());
    this.els.btnMapsBack?.addEventListener('click', () => this.showTitleHome());
    this.els.btnResult.addEventListener('click', () => game.dismissResult());
    this.els.btnUpgrade.addEventListener('click', () => game.tryUpgradeSelectedTower());
    this.els.btnRepair.addEventListener('click', () => game.tryRepairSelectedTower());
    this.els.btnSell.addEventListener('click', () => game.trySellSelectedTower());
    this.els.btnRepairAll.addEventListener('click', () => game.tryRepairAllTowers());
    this.els.btnNextWave?.addEventListener('click', () => game.tryStartWave());
    this.els.btnToolbarMaps?.addEventListener('click', () => {
      if (this.els.btnToolbarMaps?.disabled) return;
      game.quitToMapSelect();
    });
    this.els.btnInspectorClose.addEventListener('click', () => game.deselectPlacedTower());
    this.els.btnEnemyInspectorClose?.addEventListener('click', () => game.deselectEnemy());
    document.getElementById('btn-leaderboard-close')?.addEventListener('click', () => game.closeLeaderboard());
    this.buildTowerPanel(towerDefs);
    this.buildMapSelect();
  }

  buildMapSelect() {
    const grid = this.els.mapSelectGrid;
    if (!grid) return;
    grid.innerHTML = '';
    this.mapCards = new Map();

    MAP_LIST.forEach((map, index) => {
      const card = document.createElement('div');
      card.className = 'map-select-card';
      card.dataset.map = map.id;
      card.innerHTML = `
        <span class="map-select-order">${index + 1}</span>
        <span class="map-select-name">${map.name}</span>
        <span class="map-select-blurb">${map.blurb}</span>
        <span class="map-select-meta"></span>
        <div class="map-select-actions">
          <button type="button" class="map-select-continue hidden">Continue</button>
          <button type="button" class="map-select-new">Play</button>
        </div>
      `;
      const continueBtn = card.querySelector('.map-select-continue');
      const newBtn = card.querySelector('.map-select-new');
      continueBtn?.addEventListener('click', () => {
        if (card.classList.contains('is-locked')) return;
        const wave = Number(continueBtn.dataset.wave) || 1;
        this.game.startGame(map.id, { startWave: wave });
      });
      newBtn?.addEventListener('click', () => {
        if (card.classList.contains('is-locked')) return;
        this.game.startGame(map.id, { startWave: 1 });
      });
      grid.appendChild(card);
      this.mapCards.set(map.id, card);
    });
  }

  /** @param {import('../lib/progress.js').ReturnType<typeof import('../lib/progress.js').loadProgress>} progress */
  updateMapSelect(progress) {
    if (!this.mapCards) return;
    for (const [index, map] of MAP_LIST.entries()) {
      const card = this.mapCards.get(map.id);
      if (!card) continue;
      const unlocked = isMapUnlocked(progress, index);
      const best = getMapBestWaves(progress, map.id);
      const last = getMapLastSuccessfulWave(progress, map.id);
      const refund = getMapContinueCrystals(progress, map.id);
      const meta = card.querySelector('.map-select-meta');
      const continueBtn = card.querySelector('.map-select-continue');
      const newBtn = card.querySelector('.map-select-new');
      card.classList.toggle('is-locked', !unlocked);
      if (continueBtn instanceof HTMLButtonElement) {
        continueBtn.disabled = !unlocked;
        const canContinue = unlocked && last > 0;
        continueBtn.classList.toggle('hidden', !canContinue);
        continueBtn.dataset.wave = String(last);
        continueBtn.textContent = canContinue
          ? (refund > 0
            ? `Continue · Wave ${last} · ${refund} cr`
            : `Continue · Wave ${last}`)
          : 'Continue';
        continueBtn.title = canContinue
          ? (refund > 0
            ? `Redo wave ${last} with ${refund} crystals (tower spend refunded)`
            : `Redo wave ${last}`)
          : '';
      }
      if (newBtn instanceof HTMLButtonElement) {
        newBtn.disabled = !unlocked;
        newBtn.textContent = unlocked && last > 0 ? 'New Run' : 'Play';
      }
      if (meta) {
        if (!unlocked) {
          meta.textContent = getMapUnlockHint(progress, map.id);
        } else if (best >= UNLOCK_WAVE_REQUIREMENT) {
          meta.textContent = last > 0
            ? `Best: ${best} · Last clear: wave ${last}`
            : `Best: ${best} waves · Unlocked next map`;
        } else if (best > 0) {
          meta.textContent = `Best: ${best} · Reach wave ${UNLOCK_WAVE_REQUIREMENT} to unlock next`;
        } else {
          meta.textContent = `Reach wave ${UNLOCK_WAVE_REQUIREMENT} to unlock the next map`;
        }
      }
      card.title = unlocked ? map.blurb : getMapUnlockHint(progress, map.id);
    }
  }

  /** @param {object[]} towerDefs */
  buildTowerPanel(towerDefs) {
    this.els.towerPanel.innerHTML = '';
    this.towerButtons.clear();

    for (const def of towerDefs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tower-btn';
      btn.dataset.tower = def.id;
      btn.innerHTML = `
        <span class="tower-hotkey">${def.hotkey ?? ''}</span>
        <canvas class="tower-preview-canvas" width="72" height="72" aria-hidden="true"></canvas>
        <span class="tower-name">${def.name}</span>
        <span class="tower-cost">${def.cost} cr</span>
        <div class="tower-tooltip" role="tooltip">${buildTowerTooltip(def)}</div>
      `;
      btn.addEventListener('click', () => this.game.selectTower(def.id));
      this.els.towerPanel.appendChild(btn);
      this.towerButtons.set(def.id, btn);

      const canvas = btn.querySelector('.tower-preview-canvas');
      if (canvas instanceof HTMLCanvasElement) {
        mountTowerPreview(canvas, def, this.game?.map?.tileSize ?? 2);
      }
    }
  }

  /** @param {string | null} selectedId */
  setSelectedTower(selectedId) {
    for (const [id, btn] of this.towerButtons) {
      btn.classList.toggle('is-selected', id === selectedId);
    }
    const def = selectedId ? this.game.towerDefs.get(selectedId) : null;
    if (def) {
      this.els.hint.textContent =
        `${def.name} ready — move cursor, LMB place, RMB cancel · ${def.cost} cr · Space starts wave`;
      return;
    }
    this.els.hint.textContent =
      'Press 1–4 or pick a tower — move cursor, LMB place, RMB cancel · Space starts wave';
  }

  /** @param {string} url */
  setTitleBackground(url) {
    this.els.title.style.backgroundImage = `url('${url}')`;
  }

  /**
   * @param {import('../lib/progress.js').ReturnType<typeof import('../lib/progress.js').loadProgress>} [progress]
   * @param {{ maps?: boolean }} [options]
   */
  showTitle(progress = this.game?.progress, options = {}) {
    this.hideWaveAnnouncement();
    this.clearOnboarding();
    document.getElementById('game-root')?.classList.add('title-active');
    this.els.title.classList.remove('hidden');
    this.els.hud.classList.add('hidden');
    this.els.towerToolbar.classList.add('hidden');
    this.els.inspector.classList.add('hidden');
    this.els.enemyInspector?.classList.add('hidden');
    this.els.result.classList.add('hidden');
    this.els.leaderboard?.classList.add('hidden');
    if (progress) this.updateMapSelect(progress);
    if (options.maps) this.showMapSelect();
    else this.showTitleHome();
    setTowerPreviewsActive(true);
  }

  showTitleHome() {
    this.els.titleHome?.classList.remove('hidden');
    this.els.titleMaps?.classList.add('hidden');
    if (this.els.titleHeading) this.els.titleHeading.textContent = 'Tower of Power';
  }

  showMapSelect() {
    this.els.titleHome?.classList.add('hidden');
    this.els.titleMaps?.classList.remove('hidden');
    if (this.game?.progress) this.updateMapSelect(this.game.progress);
  }

  /** @param {string} [mapName] */
  showPlaying(mapName) {
    document.getElementById('game-root')?.classList.remove('title-active');
    this.els.title.classList.add('hidden');
    this.els.result.classList.add('hidden');
    this.els.hud.classList.remove('hidden');
    this.els.towerToolbar.classList.remove('hidden');
    if (mapName) {
      if (this.els.mapName) this.els.mapName.textContent = mapName;
      if (this.els.titleHeading) this.els.titleHeading.textContent = mapName;
    }
    setTowerPreviewsActive(false);
  }

  /** @param {number} crystals @param {number} lives */
  setStats(crystals, lives) {
    this.els.crystals.textContent = String(Math.floor(crystals));
    this.els.lives.textContent = String(lives);
  }

  /** @param {number} current @param {number} total */
  setWave(current, total) {
    this.els.wave.textContent = total ? `${current}/${total}` : String(current);
  }

  /** @param {string} msg */
  setMessage(msg) {
    this.els.message.textContent = msg;
  }

  /** @param {{ step: 'place_tower' | 'start_wave', message: string }} opts */
  setOnboarding(opts) {
    const banner = this.els.onboardingBanner;
    if (!banner) return;
    banner.textContent = opts.message;
    banner.classList.remove('hidden');

    for (const [id, btn] of this.towerButtons) {
      // Suggest Needle Spire, but any tower (or starting with none) is allowed.
      btn.classList.toggle('onboarding-target', opts.step === 'place_tower' && id === 'needle-spire');
    }
    // Start Wave is always a valid next action during the tutorial tips.
    this.els.btnNextWave?.classList.toggle(
      'onboarding-target',
      opts.step === 'place_tower' || opts.step === 'start_wave',
    );
  }

  clearOnboarding() {
    this.els.onboardingBanner?.classList.add('hidden');
    for (const btn of this.towerButtons.values()) {
      btn.classList.remove('onboarding-target');
    }
    this.els.btnNextWave?.classList.remove('onboarding-target');
  }

  /** @param {string} title @param {string} [subtitle] @param {'start' | 'complete' | 'failure' | 'victory'} [variant] @param {number} [durationMs] */
  showWaveAnnouncement(title, subtitle = '', variant = 'start', durationMs = 2400) {
    clearTimeout(this._announceTimer);
    clearTimeout(this._announceHideTimer);

    const el = this.els.announcement;
    el.className = `wave-announcement wave-announcement--${variant}`;
    this.els.announceTitle.textContent = title;
    this.els.announceSubtitle.textContent = subtitle;

    el.classList.remove('hidden', 'is-visible');
    void el.offsetWidth;
    el.classList.add('is-visible');

    this.game?.audio?.waveAnnouncement(variant);

    this._announceTimer = window.setTimeout(() => {
      el.classList.remove('is-visible');
      this._announceHideTimer = window.setTimeout(() => {
        el.classList.add('hidden');
      }, 380);
    }, durationMs);
  }

  hideWaveAnnouncement() {
    clearTimeout(this._announceTimer);
    clearTimeout(this._announceHideTimer);
    this.els.announcement.classList.add('hidden');
    this.els.announcement.classList.remove('is-visible');
  }

  /** @param {string} title @param {string} msg @param {{ waves?: number, crystals?: number, difficulty?: string, victory?: boolean, retired?: boolean, map?: number, mapId?: string } | null} [run] */
  showResult(title, msg, run = null) {
    this.els.resultTitle.textContent = title;
    this.els.resultMessage.textContent = msg;
    if (this.els.resultStats) {
      if (run) {
        const outcome = run.victory ? 'Campaign cleared' : 'Waves cleared';
        const mapLabel = formatMapKpi(run);
        this.els.resultStats.textContent =
          `${outcome}: ${run.waves} · Map ${mapLabel} · ${run.crystals ?? 0} cr · ${formatDifficultyLabel(run.difficulty ?? 'normal')}`;
      } else {
        this.els.resultStats.textContent = '';
      }
    }
    this.els.result.classList.remove('hidden');
    this._bindResultScoreSave(run);
  }

  /**
   * @param {{ waves: number, crystals: number, difficulty: string, victory: boolean, retired?: boolean } | null} run
   */
  _bindResultScoreSave(run) {
    const nameInput = /** @type {HTMLInputElement | null} */ (document.getElementById('result-name'));
    const status = document.getElementById('result-score-status');
    const saveBtn = document.getElementById('btn-result-save-score');
    const row = document.getElementById('result-score-row');
    if (!nameInput || !status || !saveBtn || !row) return;

    const canSave = Boolean(run?.victory || run?.retired);
    row.classList.toggle('hidden', !canSave);
    if (!canSave) {
      status.textContent = '';
      return;
    }

    nameInput.value = this.game.progress.leaderboardName ?? '';

    const applyStatus = (result) => {
      if (!result) {
        status.textContent = 'Enter a name to save your score.';
        return;
      }
      if (result.error) {
        status.textContent = result.error;
        return;
      }
      if (result.ok) {
        status.textContent = `Score submitted as ${result.player}.`;
        return;
      }
      if (result.reason === 'not_configured') {
        status.textContent = 'Name saved. Global submit is not configured in this build yet.';
        return;
      }
      if (result.reason === 'no_name') {
        status.textContent = 'Enter a name to save your score.';
        return;
      }
      if (result.reason === 'failure') {
        status.textContent = 'Wave failures are not submitted to the global leaderboard.';
        return;
      }
      status.textContent = 'Could not save score.';
    };

    const save = () => applyStatus(this.game.saveAndSubmitScore(nameInput.value, run));
    saveBtn.onclick = save;
    nameInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      }
    };

    if (this.game.progress.leaderboardName?.trim()) {
      applyStatus(this.game.saveAndSubmitScore(this.game.progress.leaderboardName, run));
    }
  }

  /**
   * @param {{ leaderboardName: string, runs: object[] }} progress
   * @param {(next: object) => void} onProgress
   */
  showLeaderboard(progress, onProgress) {
    this.hideWaveAnnouncement();
    this.els.title.classList.add('hidden');
    this.els.hud.classList.add('hidden');
    this.els.towerToolbar.classList.add('hidden');
    this.els.inspector.classList.add('hidden');
    this.els.enemyInspector?.classList.add('hidden');
    this.els.result.classList.add('hidden');
    this.els.leaderboard?.classList.remove('hidden');

    const nameInput = /** @type {HTMLInputElement} */ (document.getElementById('leaderboard-name'));
    const status = document.getElementById('leaderboard-status');
    const panelLocal = document.getElementById('leaderboard-panel-local');
    const tabLocal = document.getElementById('btn-lb-local');
    const tabGlobal = document.getElementById('btn-lb-global');
    const canFetch = canFetchGlobalLeaderboard();
    const canSubmit = isGlobalLeaderboardConfigured();

    nameInput.value = progress.leaderboardName ?? '';
    status.textContent = canSubmit
      ? ''
      : canFetch
        ? 'Name saved locally. Global score submit is not configured in this build yet.'
        : 'Name saved locally. Global board unavailable.';
    if (panelLocal) panelLocal.innerHTML = this._buildLocalLeaderboard(progress);
    if (tabGlobal) {
      tabGlobal.disabled = !canFetch;
      tabGlobal.title = canFetch ? '' : 'Global board unavailable';
    }
    this._showLeaderboardTab('local');

    tabLocal.onclick = () => this._showLeaderboardTab('local');
    tabGlobal.onclick = () => {
      if (!canFetch) return;
      this._showLeaderboardTab('global');
      this._loadGlobalLeaderboard();
    };
    document.getElementById('btn-save-lb-name').onclick = () => {
      const next = setLeaderboardName(progress, nameInput.value);
      if (!next) {
        status.textContent = 'Enter a name (max 24 chars).';
        return;
      }
      onProgress(next);
      status.textContent = canSubmit
        ? 'Global name saved.'
        : canFetch
          ? 'Name saved locally. Global score submit is not configured in this build yet.'
          : 'Name saved locally. Global board unavailable.';
    };
  }

  /** @param {'local' | 'global'} tab */
  _showLeaderboardTab(tab) {
    const isLocal = tab === 'local';
    document.getElementById('btn-lb-local')?.classList.toggle('is-active', isLocal);
    document.getElementById('btn-lb-global')?.classList.toggle('is-active', !isLocal);
    document.getElementById('leaderboard-panel-local')?.classList.toggle('hidden', !isLocal);
    document.getElementById('leaderboard-panel-global')?.classList.toggle('hidden', isLocal);
  }

  /** @param {{ runs: object[] }} progress */
  _buildLocalLeaderboard(progress) {
    const runs = [...(progress.runs ?? [])].sort((a, b) => {
      const waveDiff = (b.waves ?? 0) - (a.waves ?? 0);
      if (waveDiff !== 0) return waveDiff;
      return (Number(b.map) || getMapNumber(b.mapId) || 0) - (Number(a.map) || getMapNumber(a.mapId) || 0);
    });
    const best = getBestWaves(runs);
    let rows = '<p class="leaderboard-empty">No runs yet — defend the outpost to set your first record!</p>';
    if (runs.length) {
      rows = `
        <div class="leaderboard-table-wrap">
          <table class="leaderboard-table" aria-label="Local runs">
            <thead>
              <tr>
                <th>#</th>
                <th>Waves</th>
                <th>Map #</th>
                <th>Crystals</th>
                <th>Difficulty</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${runs.map((run, i) => {
                const mapTitle = formatMapKpiTitle(run);
                return `
                <tr class="leaderboard-row${run.waves === best ? ' leaderboard-row-best' : ''}">
                  <td>${i + 1}</td>
                  <td><strong>${run.waves ?? 0}</strong>${run.victory ? ' ★' : ''}${run.waves === best ? ' <span class="leaderboard-pr">PR</span>' : ''}</td>
                  <td title="${escapeHtml(mapTitle)}">${escapeHtml(formatMapKpi(run))}</td>
                  <td>${run.crystals ?? '—'}</td>
                  <td>${escapeHtml(formatDifficultyLabel(run.difficulty ?? 'normal'))}</td>
                  <td>${formatRunDate(run.at)}</td>
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    return `
      <p class="leaderboard-sub">Best runs on this device · ${runs.length} recorded</p>
      <div class="leaderboard-bests">
        <div class="leaderboard-stat"><span>Best waves</span><strong>${best > 0 ? best : '—'}</strong></div>
        <div class="leaderboard-stat"><span>Runs logged</span><strong>${runs.length}</strong></div>
      </div>
      <h3 class="leaderboard-section-title">Recent runs</h3>
      ${rows}
    `;
  }

  async _loadGlobalLeaderboard() {
    const loading = document.getElementById('global-loading');
    const rowsEl = document.getElementById('global-leaderboard-rows');
    if (!loading || !rowsEl) return;

    loading.classList.remove('hidden');
    rowsEl.innerHTML = '';
    const result = await fetchGlobalLeaderboard(50);
    loading.classList.add('hidden');

    if (!result.ok) {
      rowsEl.innerHTML = `<p class="leaderboard-empty">${escapeHtml(result.error)}</p>`;
      return;
    }
    rowsEl.innerHTML = this._buildGlobalLeaderboard(result.rows);
  }

  /** @param {Array<{ player: string, value: number, meta?: object | null }>} rows */
  _buildGlobalLeaderboard(rows) {
    if (!rows.length) {
      return '<p class="leaderboard-empty">No global scores yet — be the first!</p>';
    }
    // API ranks by waves (value). Stable secondary: Map # desc when present.
    const sorted = [...rows].sort((a, b) => {
      const waveDiff = (b.value ?? 0) - (a.value ?? 0);
      if (waveDiff !== 0) return waveDiff;
      return (Number(b.meta?.map) || 0) - (Number(a.meta?.map) || 0);
    });
    return `
      <div class="leaderboard-table-wrap">
        <table class="leaderboard-table" aria-label="Global top runs">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Waves</th>
              <th>Map #</th>
              <th>Crystals</th>
              <th>Difficulty</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((row, i) => {
              const mapTitle = formatMapKpiTitle(row.meta);
              return `
              <tr class="leaderboard-row${i === 0 ? ' leaderboard-row-best' : ''}">
                <td>${i + 1}</td>
                <td>${escapeHtml(row.player)}</td>
                <td><strong>${row.value}</strong>${row.meta?.victory ? ' ★' : ''}</td>
                <td title="${escapeHtml(mapTitle)}">${escapeHtml(formatMapKpi(row.meta))}</td>
                <td>${row.meta?.crystals ?? '—'}</td>
                <td>${escapeHtml(formatDifficultyLabel(row.meta?.difficulty ?? 'normal'))}</td>
              </tr>
            `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /** @param {number} crystals */
  updateTowerAffordability(crystals) {
    for (const [id, btn] of this.towerButtons) {
      const def = this.game.towerDefs.get(id);
      btn.disabled = !def || crystals < def.cost;
    }
    if (this.game.selectedPlacedTower) {
      this.updateTowerInspector(this.game.selectedPlacedTower);
    }
  }

  updateRepairAllButton() {
    const waveActive = this.game.waves.active;
    const cost = getRepairAllCost(this.game.towers.towers);
    const crystals = this.game.crystals;

    if (waveActive) {
      this.els.btnRepairAll.textContent = 'Repair All';
      this.els.btnRepairAll.disabled = true;
      this.els.btnRepairAll.title = 'Unavailable during an active wave';
      return;
    }

    if (cost <= 0) {
      this.els.btnRepairAll.textContent = 'Repair All';
      this.els.btnRepairAll.disabled = true;
      this.els.btnRepairAll.title = 'All towers fully repaired';
      return;
    }

    this.els.btnRepairAll.textContent = `Repair All · ${cost} cr`;
    this.els.btnRepairAll.disabled = crystals < cost;
    this.els.btnRepairAll.title = `Restore all tower HP for ${cost} crystals`;
  }

  updateNextWaveButton() {
    const btn = this.els.btnNextWave;
    if (!btn) return;

    const waves = this.game.waves;
    const total = waves.waves.length;
    const nextWave = waves.waveIndex + 1;

    let text;
    let disabled;
    let title;

    if (waves.isComplete) {
      text = 'All Waves Cleared';
      disabled = true;
      title = 'Campaign complete';
    } else if (waves.active) {
      const inbound = waves.spawnsRemaining;
      const onField = this.game.enemies.count;
      const pending = this.game.enemies.pendingSpawns;
      disabled = true;
      if (onField === 0 && inbound > 0) {
        text = `Wave ${nextWave} · ${inbound} inbound`;
        title = 'More enemies are still spawning for this wave';
      } else if (onField === 0 && pending > 0) {
        text = `Wave ${nextWave} · spawning`;
        title = 'Last enemies are still loading in';
      } else {
        text = `Wave ${nextWave} active`;
        title = 'Finish the current wave before starting the next one';
      }
    } else {
      text = `Start Wave ${nextWave}`;
      disabled = false;
      title = `Start wave ${nextWave} of ${total} (Space)`;
    }

    const key = `${text}\0${disabled}\0${title}`;
    if (this._nextWaveBtnKey !== key) {
      this._nextWaveBtnKey = key;
      btn.textContent = text;
      btn.disabled = disabled;
      btn.title = title;
    }

    this.updateToolbarMapsButton();
  }

  /** ← Maps is only available between waves. */
  updateToolbarMapsButton() {
    const btn = this.els.btnToolbarMaps;
    if (!btn) return;
    const betweenWaves = this.game.state === 'playing'
      && !this.game.waves.active
      && !this.game.waves.isComplete;
    btn.disabled = !betweenWaves;
    btn.title = betweenWaves
      ? 'Return to map select (saves last successful wave to the leaderboard)'
      : 'Available between waves';
  }

  /** @param {object} tower */
  showTowerInspector(tower) {
    this.els.enemyInspector?.classList.add('hidden');
    this.els.inspector.classList.remove('hidden');
    this.updateTowerInspector(tower);
    this.els.hint.textContent =
      'Tower selected — Upgrade / Repair below · LMB place new towers · RMB cancel';
  }

  hideTowerInspector() {
    this.els.inspector.classList.add('hidden');
    if (!this.game.placementArmed && !this.game.selectedEnemy) {
      this.els.hint.textContent =
        'Click tower or UFO to inspect · 1–4 arm build · LMB place · RMB cancel · drag to pan · Space wave';
    }
  }

  /** @param {object} enemy */
  showEnemyInspector(enemy) {
    this.els.inspector.classList.add('hidden');
    this.els.enemyInspector?.classList.remove('hidden');
    this.updateEnemyInspector(enemy);
    this.els.hint.textContent =
      'UFO selected — stats update live · click empty ground or RMB to close';
  }

  hideEnemyInspector() {
    this.els.enemyInspector?.classList.add('hidden');
    if (!this.game.placementArmed && !this.game.selectedPlacedTower) {
      this.els.hint.textContent =
        'Click tower or UFO to inspect · 1–4 arm build · LMB place · RMB cancel · drag to pan · Space wave';
    }
  }

  /** @param {object} enemy */
  updateEnemyInspector(enemy) {
    if (!this.els.enemyInspectorName || !this.els.enemyInspectorStats) return;
    const def = enemy.def;
    const name = def?.name ?? 'Unknown UFO';
    const bossTag = enemy.isBoss ? ' · BOSS' : '';
    this.els.enemyInspectorName.textContent = `${name}${bossTag}`;

    const speed = this.game.enemies.getMoveSpeed(enemy);
    const baseSpeed = enemy.speed ?? def?.speed ?? 0;
    const slowed = enemy.slowTimer > 0 && speed < baseSpeed - 0.001;
    const defensePct = Math.round((enemy.defense ?? 0) * 100);
    const lines = [
      `HP ${Math.max(0, Math.ceil(enemy.hp))}/${Math.ceil(enemy.maxHp)} · Speed ${speed.toFixed(2)}${slowed ? ' (slowed)' : ''}`,
      `Defense ${defensePct}% · Leak ${def?.leakDamage ?? 1} · Wave ${enemy.waveNumber ?? 1}`,
      `Reward ${enemy.reward ?? def?.reward ?? 0} cr · Drop ${enemy.crystalDrop ?? def?.crystalDrop ?? 0} crystals`,
    ];
    if (enemy.canAttack && enemy.attackDamage > 0) {
      lines.push(
        `Returns fire · ${Math.round(enemy.attackDamage)} dmg · range ${enemy.attackRange.toFixed(1)} · rate ${enemy.attackRate.toFixed(2)}/s`,
      );
    } else {
      lines.push('Does not return fire this wave');
    }
    this.els.enemyInspectorStats.textContent = lines.join('\n');
  }

  /** @param {object} tower */
  updateTowerInspector(tower) {
    const stats = getTowerStats(tower);
    const upgradeCost = getUpgradeCost(tower);
    const repairCost = getRepairCost(tower);
    const crystals = this.game.crystals;
    const maxLevel = tower.def.maxLevel ?? 10;

    this.els.inspectorName.textContent = tower.disabled || tower.hp <= 0
      ? `${tower.def.name} · Lv ${tower.level} · DISABLED`
      : `${tower.def.name} · Lv ${tower.level}`;
    this.els.inspectorStats.textContent =
      `HP ${Math.ceil(tower.hp)}/${tower.maxHp} · Range ${stats.range.toFixed(1)}` +
      (tower.def.oilBurnDps
        ? ` · Burn ${Math.round(stats.oilBurnDps)} DPS · ${stats.oilDuration}s zone`
        : ` · Dmg ${Math.round(stats.damage)}`) +
      (tower.def.armorPierce ? ` · Pierce ${Math.round(tower.def.armorPierce * 100)}%` : '') +
      (stats.slowPercent > 0
        ? ` · Slow ${Math.round(stats.slowPercent * 100)}% (${stats.slowDuration.toFixed(1)}s)`
        : '');

    if (tower.disabled || tower.hp <= 0) {
      this.els.btnUpgrade.textContent = 'Repair first';
      this.els.btnUpgrade.disabled = true;
    } else if (upgradeCost === null) {
      this.els.btnUpgrade.textContent = `Max level (${maxLevel})`;
      this.els.btnUpgrade.disabled = true;
    } else {
      this.els.btnUpgrade.textContent = `Upgrade · ${upgradeCost} cr`;
      this.els.btnUpgrade.disabled = crystals < upgradeCost;
    }

    if (repairCost <= 0) {
      this.els.btnRepair.textContent = 'Fully repaired';
      this.els.btnRepair.disabled = true;
    } else {
      this.els.btnRepair.textContent = `Repair · ${repairCost} cr`;
      this.els.btnRepair.disabled = crystals < repairCost;
    }

    const sellValue = getSellValue(tower);
    this.els.btnSell.textContent = `Sell · +${sellValue} cr`;
    this.els.btnSell.disabled = false;
  }
}
