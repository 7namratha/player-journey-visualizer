# LILA BLACK · Player Journey Map

Interactive tactical map of player journeys. Plain HTML, CSS and JavaScript: no Node, no React, no build step, no dependencies.

**Run:** open `index.html` in a browser (works from `file://`), or host the folder on any static host (Netlify, Vercel, GitHub Pages).

## Structure
- `index.html`: page shell
- `css/app.css`: HUD styles
- `js/app.js`: the app (config → scope → scene → camera → heat → render → ui → input → loop)
- `data/analysis.js`: telemetry (`window.PLAYER_JOURNEY_DATA`); replace to use new data
- `maps/`: minimaps, resized to 2048 px (UV mapping is size-independent)

## Coordinates
`u = (x - originX) / scale`, `v = (z - originZ) / scale`, `pixel = (u, 1 - v) × size`. World Y is elevation and is ignored.

## Notes and assumptions
- `ts` is epoch **seconds** (positions are sampled every 5 s), so time is shown as `mm:ss`.
- With "All matches", journeys are overlaid and aligned at 00:00.
- Filters live in the left rail, top to bottom: **Time period → Map → Match → Player**.
  - *Time period* is an aggregation window, not a business-style Monthly/Yearly toggle: Day, Week (Mon–Sun), Month, Year or Custom (from/to). It defaults to **Year → 2026**. Periods offered are the ones present in the data.
  - *Map*: All Maps, Map 01 (Ambrose Valley), Map 02 (Grand Rift), Map 03 (Lockdown). Each map has its own coordinate system, so **All Maps** shows a per-map summary (matches, journeys, kills, deaths, storm, loot) and never mixes positions on one canvas; click a card to investigate that map.
  - *Match*: All Matches, or search by match ID (a bare ID, `map|id`, or an ID with the `.nakama-0` suffix). Picking a match from another map or day moves the Map / Time period filters to it.
  - *Player*: All Players, Human, Bot, or Specific player (search by player ID). Specific player + Specific match gives one journey.
- The Match and Player lists only offer options that exist under the other filters (for example, Human hides bot-only matches).

## Shortcuts
Space play/pause · ←/→ step · scroll/drag zoom/pan · + − 0 zoom/reset · H cycle layer · P probe · G grid · F follow · 1–5 toggle signals · Esc clear


## Data

`data/analysis.js` is the browser-ready telemetry artifact, loaded as a plain script, so no server or tooling is needed. It was generated from the supplied `player_data/` files (Parquet files with an intentional `.nakama-0` extension). The app does not read `player_data/` at runtime; it is kept only as the original source reference.

To use different data, replace `data/analysis.js` with a file that sets `window.PLAYER_JOURNEY_DATA` in the same shape.

The current generated dataset contains 89,104 events, 1,242 player/match journeys, 796 matches, 339 unique players, and dates from 2026-02-10 through 2026-02-14.

## Visual direction
- Player routes use a high-contrast tactical casing, brighter recent trail, directional chevrons, and start/end anchors so movement is readable over the minimap.
- Selected/traced players receive a substantially stronger route treatment and endpoint emphasis.
- Event signals use custom vector silhouettes instead of generic letters: crossed blades for eliminations, a coffin for death, a lightning warning for storm deaths, and a treasure chest for loot.
