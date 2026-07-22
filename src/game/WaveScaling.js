import * as THREE from 'three';

/**
 * Procedural scaling for waves 1–100.
 * Tuned for ~36-tile serpentine path, 2 tower types, tower levels 1–10.
 */

const MAX_WAVE = 100;

/**
 * @param {number} wave
 */
export function getWaveScale(wave) {
  const w = THREE.MathUtils.clamp(wave, 1, MAX_WAVE);
  const t = (w - 1) / (MAX_WAVE - 1);

  return {
    hp: 1 + t * 5.5 + t * t * 12,
    speed: Math.min(2.05, 0.52 + t * 0.75 + Math.pow(t, 1.4) * 0.45),
    defense: Math.min(0.42, Math.max(0, (w - 3) * 0.0042)),
    reward: 1 + t * 0.85 + Math.floor(w / 10) * 0.12,
    bossHp: 2.2 + Math.floor(w / 10) * 0.35,
    bossDefense: 0.08 + Math.floor(w / 10) * 0.018,
  };
}

/**
 * @param {number} wave
 */
export function waveEnemyCount(wave) {
  const w = Math.max(1, wave);
  const base = 5 + w * 0.48 + Math.pow(w, 0.62) * 0.85;
  const bossTrim = w % 10 === 0 ? 2 : 0;
  return Math.max(4, Math.floor(base - bossTrim));
}

/**
 * @param {number} wave
 */
export function waveSpawnInterval(wave) {
  return Math.max(0.38, 1.05 - wave * 0.0065);
}

/**
 * Crystals dropped by a killed enemy (before wave-clear bonus).
 * @param {object} def
 * @param {number} waveNumber
 * @param {boolean} [isBoss]
 * @param {{ crystalMult?: number }} [difficulty]
 */
export function getCrystalDrop(def, waveNumber, isBoss = false, difficulty = {}) {
  const w = THREE.MathUtils.clamp(waveNumber, 1, MAX_WAVE);
  const base = def.crystalDrop ?? def.reward ?? 8;
  const waveBand = 1 + (w - 1) * 0.038;
  let drop = Math.floor(base * waveBand * (difficulty.crystalMult ?? 1));
  if (isBoss) drop = Math.floor(drop * 2.4);
  return Math.max(4, drop);
}

/**
 * @param {number} completedWave
 * @param {{ crystalMult?: number }} [difficulty]
 */
export function waveClearBonus(completedWave, difficulty = {}) {
  const w = Math.max(1, completedWave);
  const base = Math.max(4, Math.floor(3 + w * 1.1 + Math.floor(w / 10) * 5));
  return Math.max(4, Math.floor(base * (difficulty.crystalMult ?? 1)));
}

/**
 * @param {number} tier 1–10
 */
export function bossTypeForTier(tier) {
  if (tier >= 10) return 'boss-overlord';
  const bosses = ['boss-scout', 'boss-raider', 'boss-tank', 'boss-overlord'];
  return bosses[(tier - 1) % bosses.length];
}

/** @param {number} wave */
export function canEnemyAttack(wave) {
  return wave >= 7;
}

/**
 * Attack strength ramps from wave 7–10, then scales slowly afterward.
 * @param {number} wave
 */
export function getEnemyAttackScale(wave) {
  if (wave < 7) return 0;
  if (wave <= 10) return 0.4 + (wave - 7) * 0.2;
  return 1 + (wave - 10) * 0.04;
}

export { MAX_WAVE };
