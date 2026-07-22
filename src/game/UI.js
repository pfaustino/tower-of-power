import { getRepairAllCost, getRepairCost, getTowerStats, getUpgradeCost } from './TowerManager.js';
import { mountTowerPreview } from './TowerPreview.js';

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

export class UI {
  constructor() {
    this.els = {
      hud: document.getElementById('hud'),
      crystals: document.getElementById('hud-crystals'),
      lives: document.getElementById('hud-lives'),
      wave: document.getElementById('hud-wave'),
      message: document.getElementById('hud-message'),
      hint: document.getElementById('hud-hint'),
      title: document.getElementById('title-screen'),
      result: document.getElementById('result-screen'),
      resultTitle: document.getElementById('result-title'),
      resultMessage: document.getElementById('result-message'),
      towerToolbar: document.getElementById('tower-toolbar'),
      towerPanel: document.getElementById('tower-panel'),
      btnRepairAll: document.getElementById('btn-repair-all'),
      btnPlay: document.getElementById('btn-play'),
      btnResult: document.getElementById('btn-result'),
      inspector: document.getElementById('tower-inspector'),
      inspectorName: document.getElementById('inspector-name'),
      inspectorStats: document.getElementById('inspector-stats'),
      btnUpgrade: document.getElementById('btn-upgrade'),
      btnRepair: document.getElementById('btn-repair'),
      btnInspectorClose: document.getElementById('btn-inspector-close'),
      announcement: document.getElementById('wave-announcement'),
      announceTitle: document.getElementById('wave-announce-title'),
      announceSubtitle: document.getElementById('wave-announce-subtitle'),
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
    this.els.btnPlay.addEventListener('click', () => game.startGame());
    this.els.btnResult.addEventListener('click', () => game.dismissResult());
    this.els.btnUpgrade.addEventListener('click', () => game.tryUpgradeSelectedTower());
    this.els.btnRepair.addEventListener('click', () => game.tryRepairSelectedTower());
    this.els.btnRepairAll.addEventListener('click', () => game.tryRepairAllTowers());
    this.els.btnInspectorClose.addEventListener('click', () => game.deselectPlacedTower());
    this.buildTowerPanel(towerDefs);
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

  showTitle() {
    this.hideWaveAnnouncement();
    this.els.title.classList.remove('hidden');
    this.els.hud.classList.add('hidden');
    this.els.towerToolbar.classList.add('hidden');
    this.els.inspector.classList.add('hidden');
    this.els.result.classList.add('hidden');
  }

  showPlaying() {
    this.els.title.classList.add('hidden');
    this.els.result.classList.add('hidden');
    this.els.hud.classList.remove('hidden');
    this.els.towerToolbar.classList.remove('hidden');
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

  /** @param {string} title @param {string} msg */
  showResult(title, msg) {
    this.els.resultTitle.textContent = title;
    this.els.resultMessage.textContent = msg;
    this.els.result.classList.remove('hidden');
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

  /** @param {object} tower */
  showTowerInspector(tower) {
    this.els.inspector.classList.remove('hidden');
    this.updateTowerInspector(tower);
    this.els.hint.textContent =
      'Tower selected — Upgrade / Repair below · LMB place new towers · RMB cancel';
  }

  hideTowerInspector() {
    this.els.inspector.classList.add('hidden');
    if (!this.game.placementArmed) {
      this.els.hint.textContent =
        'Click a tower to inspect · 1–4 arm build · LMB place · RMB cancel · drag to pan · Space wave';
    }
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
  }
}
