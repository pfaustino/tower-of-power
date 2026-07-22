import * as THREE from 'three';
import mapData from '../../data/maps/tutorial.json';
import towersData from '../../data/towers.json';
import enemiesData from '../../data/enemies.json';
import wavesConfig from '../../data/waves.json';
import { generateWaves } from './WaveGenerator.js';
import { waveClearBonus } from './WaveScaling.js';
import { preloadModels } from './AssetLoader.js';
import { MapBoard } from './MapBoard.js';
import { TowerManager, getRepairAllCost, getRepairCost, getUpgradeCost } from './TowerManager.js';
import { EnemyManager } from './EnemyManager.js';
import { WaveManager } from './WaveManager.js';
import { Input } from './Input.js';
import { UI } from './UI.js';
import { AudioManager } from './AudioManager.js';
import { EffectsManager } from './EffectsManager.js';
import { CrystalPickupManager } from './CrystalPickupManager.js';
import { Settings } from './Settings.js';
import { PauseMenu } from './PauseMenu.js';
import { initDevPanel } from '../dev/DevPanel.js';

/** @typedef {'title' | 'playing' | 'result' | 'gameover'} GameState */

export class Game {
  constructor() {
    this.state = /** @type {GameState} */ ('title');
    this.crystals = 0;
    this.lives = 0;
    this.selectedTowerId = 'needle-spire';
    this.placementArmed = false;
    this._placementToken = 0;
    this.selectedPlacedTower = null;
    this.paused = false;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();

    this.ui = new UI();
    this.settings = new Settings();
    this.pauseMenu = new PauseMenu();
    this.audio = new AudioManager();
    this.effects = new EffectsManager(this);
    this.crystalPickups = new CrystalPickupManager(this);
    this.input = new Input();
    this.map = new MapBoard(this);
    this.towers = new TowerManager(this);
    this.enemies = new EnemyManager(this);
    this.waves = new WaveManager(this);

    this.towerDefs = new Map(towersData.towers.map((t) => [t.id, t]));
    this._raf = 0;
  }

  async init() {
    this.setupRenderer();
    this.setupScene();
    this.setupLights();

    await preloadModels([
      'tile', 'tile-dirt', 'tile-straight', 'tile-corner-round', 'tile-spawn', 'tile-end',
      'tile-crystal', 'tower-round-base', 'tower-round-build-a', 'tower-round-build-c',
      'tower-square-build-a', 'tower-square-build-c', 'tower-square-build-d',
      'weapon-ballista', 'weapon-catapult', 'weapon-cannon', 'weapon-turret',
      'enemy-ufo-a', 'enemy-ufo-b', 'enemy-ufo-c', 'enemy-ufo-d',
      'enemy-ufo-a-weapon', 'enemy-ufo-b-weapon', 'enemy-ufo-c-weapon', 'enemy-ufo-d-weapon',
      'enemy-ufo-beam', 'enemy-ufo-beam-burst',
      'selection-a',
    ]);

    await this.effects.initModels();

    await this.map.build(mapData);
    this.scene.add(this.map.group);
    this.scene.add(this.towers.group);
    this.scene.add(this.enemies.group);
    this.scene.add(this.effects.group);
    this.scene.add(this.crystalPickups.group);

    this.enemies.setDefs(enemiesData.enemies);
    this.waves.setWaves(generateWaves(wavesConfig.totalWaves ?? 100));

    this.input.init(this);
    this.ui.bind(this, towersData.towers);
    this.pauseMenu.bind(this);
    this.audio.setVolume(this.settings.soundVolume);
    this.ui.showTitle();

    initDevPanel({
      getStatus: () =>
        `${this.state} · ${this.crystals}cr · ${this.lives}hp · wave ${this.waves.currentWave} · ${this.settings.getDifficultyProfile().label}`,
      actions: [
        { label: '+100 crystals', fn: () => { this.crystals += 100; this.refreshHud(); } },
        { label: 'Start wave', fn: () => this.tryStartWave() },
        { label: 'Spawn scout', fn: () => this.enemies.spawn('scout') },
        { label: 'Win wave', fn: () => this.winCurrentWave() },
      ],
      inputs: [
        {
          label: 'Jump wave',
          min: 1,
          max: wavesConfig.totalWaves ?? 100,
          value: 7,
          onSubmit: (n) => this.jumpToWave(n),
        },
      ],
    });

    window.addEventListener('resize', () => this.onResize());
    this.animate();
  }

  setupRenderer() {
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.baseExposure = 1.45;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xd0eaff);
    this.scene.fog = new THREE.Fog(0xd8eeff, 45, 80);

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );
    this.camera.position.set(0, 22, 18);
    this.camera.lookAt(0, 0, 0);
    this.cameraTarget = new THREE.Vector3(0, 0, 0);
    this.cameraZoom = 1;
    this.baseCameraOffset = new THREE.Vector3(0, 22, 18);
    this.cameraPanMinX = -12;
    this.cameraPanMaxX = 12;
  }

  updateCameraPosition() {
    const offset = this.baseCameraOffset.clone().multiplyScalar(this.cameraZoom);
    this.camera.position.copy(this.cameraTarget).add(offset);
    this.camera.lookAt(this.cameraTarget);
  }

  /** @param {number} screenDeltaX */
  panCamera(screenDeltaX) {
    const speed = 0.03 * this.cameraZoom;
    this.cameraTarget.x = THREE.MathUtils.clamp(
      this.cameraTarget.x - screenDeltaX * speed,
      this.cameraPanMinX,
      this.cameraPanMaxX,
    );
    this.updateCameraPosition();
  }

  canPanCamera() {
    return this.state === 'playing' && !this.paused && !this.placementArmed && !this.selectedPlacedTower;
  }

  togglePauseMenu() {
    if (this.pauseMenu.open) {
      this.closePauseMenu();
      return;
    }
    if (this.state === 'playing') {
      this.openPauseMenu('playing');
      return;
    }
    if (this.state === 'title') {
      this.openPauseMenu('title');
    }
  }

  /** @param {'playing' | 'title'} mode */
  openPauseMenu(mode) {
    this.paused = mode === 'playing';
    this.pauseMenu.show(mode);
    if (this.paused) {
      this.cancelPlacement();
      this.deselectPlacedTower();
    }
  }

  closePauseMenu() {
    if (!this.pauseMenu.open) return;
    this.paused = false;
    this.pauseMenu.hide();
  }

  /** @param {number} delta */
  adjustCameraZoom(delta) {
    this.cameraZoom = THREE.MathUtils.clamp(this.cameraZoom + delta, 0.55, 1.75);
    this.updateCameraPosition();
  }

  setupLights() {
    this.lightLevel = this.settings.lightLevel;
    this.baseLightIntensities = {
      ambient: 0.7,
      hemi: 1.6,
      sun: 2.8,
      fill: 0.75,
      rim: 0.35,
    };

    const ambient = new THREE.AmbientLight(0xfff8f0, this.baseLightIntensities.ambient);
    this.scene.add(ambient);
    this.ambientLight = ambient;

    const hemi = new THREE.HemisphereLight(0xfff4d8, 0xb8d4a0, this.baseLightIntensities.hemi);
    this.scene.add(hemi);
    this.hemiLight = hemi;

    const sun = new THREE.DirectionalLight(0xfffaf0, this.baseLightIntensities.sun);
    sun.position.set(10, 24, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 60;
    sun.shadow.camera.left = -28;
    sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 28;
    sun.shadow.camera.bottom = -28;
    this.scene.add(sun);
    this.sun = sun;

    const fill = new THREE.DirectionalLight(0xc8e0ff, this.baseLightIntensities.fill);
    fill.position.set(-14, 10, -10);
    this.scene.add(fill);
    this.fillLight = fill;

    const rim = new THREE.DirectionalLight(0xffe8c8, this.baseLightIntensities.rim);
    rim.position.set(0, 8, -16);
    this.scene.add(rim);
    this.rimLight = rim;
    this.setLightLevel(this.lightLevel);
  }

  /** @param {number} level */
  setLightLevel(level) {
    this.lightLevel = level;
    const b = this.baseLightIntensities;
    this.renderer.toneMappingExposure = this.baseExposure * level;
    this.ambientLight.intensity = b.ambient * level;
    this.hemiLight.intensity = b.hemi * level;
    this.sun.intensity = b.sun * level;
    this.fillLight.intensity = b.fill * level;
    this.rimLight.intensity = b.rim * level;
  }

  async startGame() {
    this.audio.unlock();
    this.closePauseMenu();
    this.crystalPickups.clear();
    this.crystals = mapData.startCrystals;
    this.lives = mapData.startLives;
    this.waves.setWaves(generateWaves(wavesConfig.totalWaves ?? 100));
    this.cameraTarget.set(0, 0, 0);
    this.updateCameraPosition();
    this.state = 'playing';
    this.ui.showPlaying();
    this.selectTower(this.selectedTowerId);
    this.refreshHud();
    this.ui.setMessage('Pick a tower (1–4), move cursor, LMB to place · RMB cancels');
    this.ui.setWave(0, this.waves.waves.length);
  }

  /**
   * @param {number} gx
   * @param {number} gz
   */
  canDropAt(gx, gz) {
    if (!this.placementArmed || !this.selectedTowerId) return false;
    const def = this.towerDefs.get(this.selectedTowerId);
    if (!def || this.crystals < def.cost) return false;
    return this.map.canPlaceTower(gx, gz);
  }

  /** @param {string} id */
  async selectTower(id) {
    if (!this.towerDefs.has(id)) return;
    const def = this.towerDefs.get(id);
    if (!def || this.crystals < def.cost) {
      this.ui.setMessage(`Need ${def?.cost ?? 0} crystals`);
      return;
    }
    this.deselectPlacedTower();
    this.selectedTowerId = id;
    this.ui.setSelectedTower(id);
    this.audio.uiClick();
    await this.armPlacement(id);
    this.refreshHud();
  }

  /** @param {string} id */
  async armPlacement(id) {
    const def = this.towerDefs.get(id);
    if (!def) return;

    const token = ++this._placementToken;
    await this.towers.showPlacementGhost(def);
    if (token !== this._placementToken) return;

    this.placementArmed = true;
    const { x, z } = this.input.hoverGrid;
    if (x >= 0 && z >= 0) {
      const valid = this.canDropAt(x, z);
      this.map.showSelection(x, z, valid);
      this.towers.updatePlacementGhost(x, z, valid);
    }
  }

  cancelPlacement() {
    this._placementToken++;
    this.placementArmed = false;
    this.selectedTowerId = null;
    this.towers.hidePlacementGhost();
    this.map.hideSelection();
    this.ui.setSelectedTower(null);
    this.refreshHud();
  }

  /** @param {object} tower */
  selectPlacedTower(tower) {
    if (this.placementArmed) {
      this.cancelPlacement();
    }
    this.selectedPlacedTower = tower;
    this.towers.setSelectionHighlight(tower);
    this.towers.showRangeRing(tower);
    this.ui.showTowerInspector(tower);
    this.audio.uiClick();
  }

  deselectPlacedTower() {
    if (!this.selectedPlacedTower) return;
    this.selectedPlacedTower = null;
    this.towers.setSelectionHighlight(null);
    this.towers.hideRangeRing();
    this.ui.hideTowerInspector();
  }

  async tryUpgradeSelectedTower() {
    const tower = this.selectedPlacedTower;
    if (!tower) return;
    if (tower.disabled || tower.hp <= 0) {
      this.ui.setMessage('Repair the tower before upgrading');
      return;
    }
    const cost = getUpgradeCost(tower);
    if (cost === null) {
      this.ui.setMessage('Tower is max level');
      return;
    }
    if (this.crystals < cost) {
      this.ui.setMessage(`Need ${cost} crystals to upgrade`);
      return;
    }
    this.crystals -= cost;
    await this.towers.upgrade(tower);
    this.audio.placeTower();
    this.refreshHud();
    this.ui.showTowerInspector(tower);
    this.ui.setMessage(`${tower.def.name} upgraded to level ${tower.level}`);
  }

  tryRepairSelectedTower() {
    const tower = this.selectedPlacedTower;
    if (!tower) return;
    const cost = getRepairCost(tower);
    if (cost <= 0) {
      this.ui.setMessage('Tower does not need repair');
      return;
    }
    if (this.crystals < cost) {
      this.ui.setMessage(`Need ${cost} crystals to repair`);
      return;
    }
    this.crystals -= cost;
    const wasDisabled = tower.disabled;
    this.towers.repair(tower);
    this.audio.uiClick();
    this.refreshHud();
    this.ui.showTowerInspector(tower);
    this.ui.setMessage(wasDisabled ? `${tower.def.name} restored` : `${tower.def.name} repaired`);
  }

  tryRepairAllTowers() {
    if (this.state !== 'playing') return;
    if (this.waves.active) {
      this.ui.setMessage('Cannot repair while a wave is active');
      return;
    }
    const cost = getRepairAllCost(this.towers.towers);
    if (cost <= 0) {
      this.ui.setMessage('All towers are fully repaired');
      return;
    }
    if (this.crystals < cost) {
      this.ui.setMessage(`Need ${cost} crystals to repair all towers`);
      return;
    }
    this.crystals -= cost;
    for (const tower of this.towers.towers) {
      this.towers.repair(tower);
    }
    this.audio.uiClick();
    this.refreshHud();
    this.ui.setMessage('All towers repaired');
  }

  /**
   * @param {number} gx
   * @param {number} gz
   */
  trySelectPlacedTower(gx, gz) {
    const tower = this.towers.pickAt(gx, gz);
    if (tower) {
      this.selectPlacedTower(tower);
      return;
    }
    this.deselectPlacedTower();
  }

  tryStartWave() {
    if (this.state !== 'playing' || this.paused) return;
    if (this.waves.startNextWave()) {
      this.refreshHud();
      return;
    }
    if (this.waves.isComplete) {
      this.ui.setMessage('All waves cleared — outpost secured!');
    } else {
      this.ui.setMessage('Wave already in progress…');
    }
  }

  /**
   * Dev: instantly complete the current wave.
   */
  winCurrentWave() {
    if (this.state !== 'playing') return;
    if (!this.waves.forceCompleteWave()) {
      this.enemies.clearCombat();
      this.ui.setMessage('No active wave — cleared enemies');
      return;
    }
    this.refreshHud();
  }

  /**
   * Dev: jump to a wave (1-based) and start it immediately.
   * @param {number} waveNumber
   */
  jumpToWave(waveNumber) {
    if (this.state !== 'playing') return;
    const total = this.waves.waves.length;
    const n = Math.floor(waveNumber);
    if (n < 1 || n > total) {
      this.ui.setMessage(`Wave must be between 1 and ${total}`);
      return;
    }
    this.enemies.clearCombat();
    this.waves.jumpTo(n);
    this.ui.setWave(n - 1, total);
    this.refreshHud();
    if (this.waves.startNextWave()) {
      this.refreshHud();
      this.ui.setMessage(`Jumped to wave ${n}`);
    }
  }

  /**
   * @param {number} gx
   * @param {number} gz
   */
  async tryPlaceTower(gx, gz) {
    if (!this.placementArmed) return;
    const def = this.towerDefs.get(this.selectedTowerId);
    if (!def) return;
    if (!this.map.canPlaceTower(gx, gz)) {
      this.ui.setMessage('Cannot build here');
      return;
    }
    if (this.crystals < def.cost) {
      this.ui.setMessage(`Need ${def.cost} crystals`);
      this.cancelPlacement();
      return;
    }

    await this.towers.place(def, gx, gz);
    this.crystals -= def.cost;
    this.audio.placeTower();
    this.refreshHud();
    this.ui.setMessage(`${def.name} deployed — LMB to place another · RMB to cancel`);

    if (this.crystals >= def.cost) {
      await this.armPlacement(def.id);
    } else {
      this.cancelPlacement();
    }
  }

  /** @param {number} amount */
  collectCrystals(amount) {
    this.crystals += amount;
    this.audio.crystalCollect();
    this.refreshHud();
  }

  /**
   * @param {object} enemy
   * @param {THREE.Vector3} position
   */
  onEnemyKilled(enemy, position) {
    const drop = enemy.crystalDrop ?? enemy.def.crystalDrop ?? 8;
    this.crystalPickups.spawn(position, drop);
    this.audio.enemyDeath();
    if (enemy.isBoss) {
      this.ui.setMessage(`${enemy.def.name} destroyed! +${drop} crystals incoming`);
    }
  }

  /**
   * @param {object} def
   * @param {boolean} [isBoss]
   */
  onEnemyLeak(def, isBoss = false) {
    const leakDmg = isBoss ? def.leakDamage + 1 : def.leakDamage;
    this.lives -= leakDmg;
    for (const tower of [...this.towers.towers]) {
      if (tower.disabled) continue;
      tower.hp = Math.max(0, tower.hp - 12);
      tower.hpBar?.setRatio(tower.hp / tower.maxHp);
      this.towers.syncTowerHpBarVisibility(tower);
      if (tower.hp <= 0) this.towers.disableTower(tower);
    }
    this.audio.leak();
    this.effects.spawnLeak(this.map.outpostPosition);
    this.map.flashOutpost();
    this.refreshHud();
    this.ui.setMessage(
      isBoss
        ? `BOSS breached the outpost! −${leakDmg} Outpost HP (${this.lives} left)`
        : `UFO breached the outpost! −${leakDmg} Outpost HP (${this.lives} left)`,
    );
    if (this.lives <= 0) {
      this.state = 'gameover';
      this.ui.showWaveAnnouncement('Wave Failed', 'Outpost Overrun', 'failure', 3000);
      window.setTimeout(() => {
        this.ui.showResult('Outpost Lost', 'The UFOs overran your castle. Rebuild and try again.');
      }, 2000);
    }
  }

  onWaveComplete() {
    if (this.waves.isComplete) {
      this.state = 'result';
      this.ui.showWaveAnnouncement('Victory', 'All 100 Waves Cleared', 'victory', 3500);
      window.setTimeout(() => {
        this.ui.showResult('Victory!', 'All 100 waves repelled. The crystal outpost holds.');
      }, 2200);
      return;
    }
    const completed = this.waves.waveIndex;
    const bonus = waveClearBonus(completed, this.settings.getDifficultyProfile());
    this.crystals += bonus;
    const next = completed + 1;
    const bossNote = next % 10 === 0 ? ' Boss wave next!' : '';
    this.ui.showWaveAnnouncement('Wave Cleared', `Wave ${completed} · +${bonus} crystals`, 'complete');
    this.ui.setMessage(`Wave ${completed} cleared! +${bonus} crystals.${bossNote} Press Space for wave ${next}.`);
    this.refreshHud();
  }

  dismissResult() {
    if (this.state === 'gameover' || this.state === 'result') {
      this.closePauseMenu();
      this.resetMatch();
      this.ui.showTitle();
      this.state = 'title';
    }
  }

  resetMatch() {
    this.deselectPlacedTower();
    this.cancelPlacement();
    this.towers.hideRangeRing();
    for (const t of [...this.towers.towers]) {
      this.towers.destroyTower(t, { silent: true });
    }
    this.towers.towers = [];
    this.towers.projectiles = [];
    this.effects.clearOilPatches();
    this.map.occupied.clear();
    this.enemies.clearCombat();
    this.crystalPickups.clear();
    for (const e of [...this.enemies.alive]) {
      this.enemies.remove(e);
    }
    this.map.hideSelection();
  }

  refreshHud() {
    this.ui.setStats(this.crystals, this.lives);
    this.map.setOutpostHealth(this.lives);
    this.ui.updateTowerAffordability(this.crystals);
    this.ui.updateRepairAllButton();
    if (this.selectedPlacedTower) {
      this.ui.updateTowerInspector(this.selectedPlacedTower);
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    this._raf = requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.state === 'playing' && !this.paused) {
      this.waves.update(dt);
      this.enemies.update(dt);
      this.towers.update(dt);
      this.effects.update(dt);
      this.crystalPickups.update(dt);
      this.map.update(dt);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
