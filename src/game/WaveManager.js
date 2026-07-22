export class WaveManager {
  /**
   * @param {import('./Game.js').Game} game
   */
  constructor(game) {
    this.game = game;
    this.waves = [];
    this.waveIndex = 0;
    this.active = false;
    this.queue = [];
    this.spawnTimer = 0;
    this.waitingForClear = false;
  }

  /** @param {object[]} waves */
  setWaves(waves) {
    this.waves = waves;
    this.waveIndex = 0;
    this.active = false;
    this.queue = [];
    this.waitingForClear = false;
  }

  startNextWave() {
    if (this.active || this.waitingForClear) return false;
    if (this.waveIndex >= this.waves.length) return false;

    const wave = this.waves[this.waveIndex];
    this.queue = [];
    let t = 0;
    for (const group of wave.groups) {
      t += group.delay ?? 0;
      for (let i = 0; i < group.count; i++) {
        this.queue.push({ at: t, enemy: group.enemy });
        t += group.interval;
      }
    }
    this.queue.sort((a, b) => a.at - b.at);
    this.spawnTimer = 0;
    this.spawnIndex = 0;
    this.active = true;
    const msg = wave.isBossWave
      ? `${wave.label} — boss incoming after the swarm!`
      : `${wave.label} — incoming!`;
    this.game.ui.setMessage(msg);
    this.game.ui.setWave(this.waveIndex + 1, this.waves.length);
    const waveNum = this.waveIndex + 1;
    let subtitle = wave.isBossWave ? 'Boss Incoming' : 'Engage';
    if (waveNum >= 7 && waveNum <= 10) {
      subtitle = 'Enemies return fire!';
    }
    this.game.ui.showWaveAnnouncement(
      `Wave ${waveNum}`,
      subtitle,
      'start',
      wave.isBossWave ? 2800 : 2200,
    );
    return true;
  }

  /** @param {number} dt */
  update(dt) {
    if (!this.active) return;

    this.spawnTimer += dt;
    while (this.spawnIndex < this.queue.length && this.queue[this.spawnIndex].at <= this.spawnTimer) {
      const item = this.queue[this.spawnIndex];
      const waveNumber = this.waveIndex + 1;
      const spawnProgress = this.spawnIndex / Math.max(this.queue.length - 1, 1);
      this.game.enemies.spawn(item.enemy, waveNumber, spawnProgress);
      this.spawnIndex++;
    }

    if (this.spawnIndex >= this.queue.length && this.game.enemies.count === 0) {
      this.active = false;
      this.waveIndex++;
      this.waitingForClear = false;
      this.game.onWaveComplete();
    }
  }

  get isComplete() {
    return this.waveIndex >= this.waves.length && !this.active;
  }

  get currentWave() {
    return this.waveIndex;
  }

  /**
   * Dev: skip remaining spawns, clear enemies, and complete the active wave.
   */
  forceCompleteWave() {
    if (!this.active) return false;

    this.spawnIndex = this.queue.length;
    this.queue = [];
    this.game.enemies.clearCombat();
    this.active = false;
    this.waveIndex++;
    this.waitingForClear = false;
    this.game.onWaveComplete();
    return true;
  }

  /** Stop the current wave without advancing the wave index. */
  abort() {
    this.active = false;
    this.queue = [];
    this.spawnTimer = 0;
    this.spawnIndex = 0;
    this.waitingForClear = false;
  }

  /**
   * Set the next wave to start (1-based). Does not start it automatically.
   * @param {number} waveNumber
   */
  jumpTo(waveNumber) {
    const n = Math.floor(waveNumber);
    this.abort();
    this.waveIndex = Math.max(0, Math.min(n - 1, this.waves.length));
  }
}
