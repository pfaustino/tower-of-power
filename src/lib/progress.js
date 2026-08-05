const STORAGE_KEY = 'tower-of-power-progress';
const MAX_RUNS = 25;
const MAX_NAME_LEN = 24;

/** @typedef {{ waves: number, crystals: number, difficulty: string, victory: boolean, outpostHp: number, at: number }} RunRecord */

/** @returns {{ leaderboardName: string, runs: RunRecord[], onboardingComplete: boolean, mapProgress: Record<string, { bestWaves: number }> }} */
export function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { leaderboardName: '', runs: [], onboardingComplete: false, mapProgress: {} };
    }
    const parsed = JSON.parse(raw);
    /** @type {Record<string, { bestWaves: number }>} */
    const mapProgress = {};
    if (parsed.mapProgress && typeof parsed.mapProgress === 'object') {
      for (const [id, entry] of Object.entries(parsed.mapProgress)) {
        const bestWaves = Math.max(0, Math.floor(Number(entry?.bestWaves) || 0));
        if (bestWaves > 0) mapProgress[id] = { bestWaves };
      }
    }
    return {
      leaderboardName: typeof parsed.leaderboardName === 'string' ? parsed.leaderboardName : '',
      runs: Array.isArray(parsed.runs) ? parsed.runs.filter(isValidRun) : [],
      onboardingComplete: Boolean(parsed.onboardingComplete),
      mapProgress,
    };
  } catch {
    return { leaderboardName: '', runs: [], onboardingComplete: false, mapProgress: {} };
  }
}

/** @param {{ leaderboardName: string, runs: RunRecord[], onboardingComplete?: boolean, mapProgress?: Record<string, { bestWaves: number }> }} data */
export function saveProgress(data) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      leaderboardName: data.leaderboardName ?? '',
      runs: (data.runs ?? []).slice(0, MAX_RUNS),
      onboardingComplete: Boolean(data.onboardingComplete),
      mapProgress: data.mapProgress ?? {},
    }),
  );
}

/** @param {{ leaderboardName: string, runs: RunRecord[], onboardingComplete?: boolean }} progress */
export function markOnboardingComplete(progress) {
  return { ...progress, onboardingComplete: true };
}

/**
 * @param {{ leaderboardName: string, runs: RunRecord[] }} progress
 * @param {string} name
 */
export function setLeaderboardName(progress, name) {
  const trimmed = name.trim().slice(0, MAX_NAME_LEN);
  if (!trimmed || !/^[\w\s\-.'!?]+$/u.test(trimmed)) return null;
  return { ...progress, leaderboardName: trimmed };
}

/**
 * @param {{ leaderboardName: string, runs: RunRecord[] }} progress
 * @param {RunRecord} run
 */
export function recordRun(progress, run) {
  const runs = [run, ...(progress.runs ?? [])].slice(0, MAX_RUNS);
  return { ...progress, runs };
}

/** @param {RunRecord[]} runs */
export function getBestWaves(runs) {
  if (!runs.length) return 0;
  return Math.max(...runs.map((r) => r.waves ?? 0));
}

/** @param {unknown} run */
function isValidRun(run) {
  return (
    run
    && typeof run === 'object'
    && Number.isFinite(run.waves)
    && run.waves >= 0
  );
}
