# Tower of Power

3D tower defense in the browser. Defend crystal outposts from UFO invaders using Kenney assets and Three.js.

**Play:** [GitHub Pages](https://pfaustino.github.io/tower-of-power/) · [itch.io](https://pfaustino.itch.io/tower-of-power)

**Dev:** `npm run dev` → http://localhost:5185

## Features

- **10 maps** — clear wave 10 to unlock the next; Continue resumes your last cleared wave with crystal refunds
- **4 towers** — Needle Spire, Boulder Keep, Scorch Spire, Pulse Turret (upgrade to Lv10, repair, sell)
- **Target priority** — per tower: Closest (default), Lowest HP, or Highest HP
- **Power abilities** — Freeze (Q), aimed Strike (W), Overclock (E)
- **Boss waves** every 10th wave with bonus loot
- **Difficulties** — Casual · Normal · Veteran · Hard · Nightmare
- **Leaderboards** — local + optional global (waves cleared)

## Controls

| Input | Action |
|-------|--------|
| 1–4 | Select tower type |
| LMB | Place tower / select placed tower or enemy |
| RMB | Cancel placement / Strike aim |
| Q / W / E | Freeze / Strike / Overclock |
| Space | Start next wave |
| Esc | Pause & settings |
| Drag (empty hand) | Pan camera |
| Pinch or +/- | Zoom (mobile) |

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local Vite server (port 5185) |
| `npm run build` | Production build for GitHub Pages (`/tower-of-power/`) |
| `npm run build:itch` | Relative-base build for itch.io |
| `npm run assets:sync` | Copy Kenney models into `public/` |

Pushes to `main` deploy GitHub Pages and itch.io (`html5` channel via butler). itch page copy lives in [`docs/itch-description.md`](docs/itch-description.md).

## Assets

Kenney [Tower Defense Kit](https://kenney.nl/assets/tower-defense-kit) (CC0). Run `npm run assets:sync` after updating models in `Models/`.

## Stack

Vite · Three.js · GLB models

## Leaderboards

Global scores use the shared [leaderboards](https://github.com/pfaustino/leaderboards) API. Ranked by **waves cleared** (100 on full campaign win), with **Map #** shown as a KPI.

Local runs are stored in the browser. Set a global name on the title **Leaderboard** screen or after a run ends to submit worldwide.

For local dev with score submission, copy `.env.example` → `.env` and set `VITE_LEADERBOARD_WRITE_KEY` (game key from the leaderboards `WRITE_KEYS` config).
