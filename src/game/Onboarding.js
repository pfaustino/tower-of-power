import { markOnboardingComplete, saveProgress } from '../lib/progress.js';

export const ONBOARDING_TOWER_ID = 'needle-spire';
export const ONBOARDING_WAVES = 3;

/** @typedef {'place_tower' | 'start_wave' | 'in_wave'} OnboardingStep */

export class Onboarding {
  /**
   * @param {import('./Game.js').Game} game
   */
  constructor(game) {
    this.game = game;
    /** @type {boolean} */
    this.active = false;
    /** @type {OnboardingStep} */
    this.step = 'place_tower';
    /** @type {number} 0-based cycle before waves 1–3 */
    this.cycle = 0;
  }

  /** @returns {boolean} */
  shouldRun() {
    return !this.game.progress.onboardingComplete
      && this.game.currentMapId === 'crystal-outpost';
  }

  begin() {
    if (!this.shouldRun()) return;
    this.active = true;
    this.cycle = 0;
    this.step = 'place_tower';
    this.syncUi();
  }

  complete() {
    if (!this.active) return;
    this.active = false;
    this.step = 'in_wave';
    this.game.progress = markOnboardingComplete(this.game.progress);
    saveProgress(this.game.progress);
    this.game.ui.clearOnboarding();
  }

  syncUi() {
    if (!this.active || this.step === 'in_wave') {
      this.game.ui.clearOnboarding();
      return;
    }

    const waveNum = this.cycle + 1;
    if (this.step === 'place_tower') {
      this.game.ui.setOnboarding({
        step: this.step,
        message: `Tutorial (${waveNum}/${ONBOARDING_WAVES}): Click Needle Spire, then place it on a build tile near the path.`,
      });
      return;
    }

    this.game.ui.setOnboarding({
      step: this.step,
      message: `Tutorial (${waveNum}/${ONBOARDING_WAVES}): Click Start Wave when you're ready.`,
    });
  }

  /** @param {string} towerId */
  onTowerPlaced(towerId) {
    if (!this.active || this.step !== 'place_tower') return false;
    if (towerId !== ONBOARDING_TOWER_ID) return false;
    this.step = 'start_wave';
    this.syncUi();
    return true;
  }

  onWaveStarted() {
    if (!this.active || this.step !== 'start_wave') return;
    if (this.cycle >= ONBOARDING_WAVES - 1) {
      this.complete();
      return;
    }
    this.step = 'in_wave';
    this.game.ui.clearOnboarding();
  }

  /** @param {number} completedWaveIndex index after wave completes (1 after wave 1, etc.) */
  onWaveCleared(completedWaveIndex) {
    if (!this.active || completedWaveIndex >= ONBOARDING_WAVES) return;
    this.cycle = completedWaveIndex;
    this.step = 'place_tower';
    this.syncUi();
  }
}
