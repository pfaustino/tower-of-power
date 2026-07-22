const STORAGE_KEY = 'tower-of-power-settings';

/** @typedef {'casual' | 'normal' | 'veteran' | 'hard' | 'nightmare'} DifficultyId */

export const DIFFICULTIES = [
  {
    id: 'casual',
    label: 'Casual',
    blurb: 'Gentle scouts — extra crystals, weaker enemies.',
    enemyHp: 0.78,
    enemySpeed: 0.88,
    enemyAttack: 0.75,
    crystalMult: 1.2,
  },
  {
    id: 'normal',
    label: 'Normal',
    blurb: 'Balanced siege — tuned for the core loop.',
    enemyHp: 1,
    enemySpeed: 1,
    enemyAttack: 1,
    crystalMult: 1,
  },
  {
    id: 'veteran',
    label: 'Veteran',
    blurb: 'Tougher hulls, faster approach, standard payouts.',
    enemyHp: 1.18,
    enemySpeed: 1.06,
    enemyAttack: 1.12,
    crystalMult: 1,
  },
  {
    id: 'hard',
    label: 'Hard',
    blurb: 'Heavy armor and return fire — fewer crystal drops.',
    enemyHp: 1.35,
    enemySpeed: 1.12,
    enemyAttack: 1.25,
    crystalMult: 0.92,
  },
  {
    id: 'nightmare',
    label: 'Nightmare',
    blurb: 'Relentless swarms — minimal mercy, lean economy.',
    enemyHp: 1.55,
    enemySpeed: 1.18,
    enemyAttack: 1.4,
    crystalMult: 0.85,
  },
];

const DEFAULTS = {
  soundVolume: 0.55,
  lightLevel: 0.75,
  difficulty: /** @type {DifficultyId} */ ('normal'),
};

/** @returns {{ soundVolume: number, lightLevel: number, difficulty: DifficultyId }} */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    const difficulty = DIFFICULTIES.some((d) => d.id === parsed.difficulty)
      ? parsed.difficulty
      : DEFAULTS.difficulty;
    return {
      soundVolume: clamp(parsed.soundVolume ?? DEFAULTS.soundVolume, 0, 1),
      lightLevel: clamp(parsed.lightLevel ?? DEFAULTS.lightLevel, 0.4, 2.5),
      difficulty,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** @param {number} v @param {number} min @param {number} max */
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export class Settings {
  constructor() {
    const saved = load();
    this.soundVolume = saved.soundVolume;
    this.lightLevel = saved.lightLevel;
    this.difficulty = saved.difficulty;
    /** @type {Set<() => void>} */
    this._listeners = new Set();
  }

  save() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        soundVolume: this.soundVolume,
        lightLevel: this.lightLevel,
        difficulty: this.difficulty,
      }),
    );
    this._notify();
  }

  /** @param {() => void} fn */
  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    for (const fn of this._listeners) fn();
  }

  /** @param {number} v */
  setSoundVolume(v) {
    this.soundVolume = clamp(v, 0, 1);
    this.save();
  }

  /** @param {number} v */
  setLightLevel(v) {
    this.lightLevel = clamp(v, 0.4, 2.5);
    this.save();
  }

  /** @param {DifficultyId} id */
  setDifficulty(id) {
    if (!DIFFICULTIES.some((d) => d.id === id)) return;
    this.difficulty = id;
    this.save();
  }

  getDifficultyProfile() {
    return DIFFICULTIES.find((d) => d.id === this.difficulty) ?? DIFFICULTIES[1];
  }
}
