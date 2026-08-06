/** Shared Vercel leaderboards service (see github.com/pfaustino/leaderboards). */

export const LEADERBOARD_GAME_ID = 'tower-of-power';

export const LEADERBOARD_API = (
  import.meta.env.VITE_LEADERBOARD_API || 'https://leaderboards-opal.vercel.app'
).replace(/\/$/, '');

export const LEADERBOARD_WRITE_KEY = import.meta.env.VITE_LEADERBOARD_WRITE_KEY ?? '';

export function isGlobalLeaderboardConfigured() {
  return Boolean(LEADERBOARD_WRITE_KEY);
}

export function canFetchGlobalLeaderboard() {
  return Boolean(LEADERBOARD_API);
}

/**
 * @returns {Promise<{ ok: true, rows: Array<{ player: string, value: number, meta: object | null }> } | { ok: false, error: string }>}
 */
export async function fetchGlobalLeaderboard(limit = 50) {
  if (!LEADERBOARD_API) {
    return { ok: false, error: 'Global leaderboard URL not configured' };
  }
  try {
    const url = `${LEADERBOARD_API}/api/leaderboard?game=${LEADERBOARD_GAME_ID}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 404) {
        return {
          ok: false,
          error: 'tower-of-power is not registered on the leaderboard server yet. Add it to games.json in the leaderboards repo and redeploy.',
        };
      }
      return { ok: false, error: body.error ?? `Server returned ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, rows: data.rows ?? [] };
  } catch {
    return { ok: false, error: 'Could not reach leaderboard server' };
  }
}

/**
 * @param {{ player: string, value: number, meta?: Record<string, unknown> }} payload
 */
export async function submitGlobalScore(payload) {
  if (!isGlobalLeaderboardConfigured()) return { ok: false, error: 'not configured' };
  try {
    const res = await fetch(`${LEADERBOARD_API}/api/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Game-Key': LEADERBOARD_WRITE_KEY,
      },
      body: JSON.stringify({
        game: LEADERBOARD_GAME_ID,
        player: payload.player,
        value: payload.value,
        meta: payload.meta,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'network error' };
  }
}

/**
 * Fire-and-forget global score submit after a run ends.
 * Ranked by waves (value). Map # is a KPI in meta only.
 * Wave failures never submit — only victories or voluntary retire (← Maps).
 * @param {{ leaderboardName?: string }} progress
 * @param {{ waves: number, crystals: number, difficulty: string, victory: boolean, retired?: boolean, outpostHp: number, mapId?: string, map?: number }} run
 */
export function trySubmitGlobalRun(progress, run) {
  if (!isGlobalLeaderboardConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }
  const player = progress?.leaderboardName?.trim();
  if (!player) return { ok: false, reason: 'no_name' };
  // Failures (outpost overrun) must not appear on the global board.
  if (!run?.victory && !run?.retired) {
    return { ok: false, reason: 'failure' };
  }
  const waves = Number(run.waves);
  if (!Number.isFinite(waves) || waves < 1) {
    return { ok: false, reason: 'bad_score' };
  }
  const map = Number(run.map);
  submitGlobalScore({
    player,
    value: Math.floor(waves),
    meta: {
      difficulty: run.difficulty ?? 'normal',
      crystals: Math.floor(run.crystals ?? 0),
      victory: Boolean(run.victory),
      retired: Boolean(run.retired),
      outpostHp: Math.floor(run.outpostHp ?? 0),
      mapId: typeof run.mapId === 'string' ? run.mapId : undefined,
      map: Number.isFinite(map) && map > 0 ? Math.floor(map) : undefined,
    },
  });
  return { ok: true, player };
}
