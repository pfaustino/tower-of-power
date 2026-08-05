# Tower of Power

3D tower defense in the browser. Defend crystal outposts from UFO invaders using Kenney assets and Three.js.

**Play:** https://pfaustino.github.io/tower-of-power/

**Dev:** `npm run dev` → http://localhost:5185

## Controls

| Input | Action |
|-------|--------|
| 1–4 | Select tower type |
| LMB | Place tower / select placed tower |
| RMB | Cancel placement |
| Space | Start next wave |
| Drag (empty hand) | Pan camera |

## Assets

Kenney [Tower Defense Kit](https://kenney.nl/assets/tower-defense-kit) (CC0). Run `npm run assets:sync` after updating models in `Models/`.

## Stack

Vite · Three.js · GLB models

## Leaderboards

Global scores use the shared [leaderboards](https://github.com/pfaustino/leaderboards) API. Ranked by **waves cleared** (100 on full campaign win), with **Map #** shown as a KPI.

Local runs are stored in the browser. Set a global name on the title **Leaderboard** screen or after a run ends to submit worldwide.

For local dev with score submission, copy `.env.example` → `.env` and set `VITE_LEADERBOARD_WRITE_KEY` (game key from the leaderboards `WRITE_KEYS` config).
