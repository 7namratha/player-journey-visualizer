# LILA BLACK · Player Journey Map

A browser tool for Level Designers to see how players move, fight, loot and die on the three LILA BLACK maps. It turns five days of production telemetry (Feb 10–14, 2026) into routes, event markers, heatmaps and match playback drawn on the real minimaps.

**Live demo:** `https://tiny-haupia-3a4884.netlify.app`
**Docs:** [ARCHITECTURE.md](ARCHITECTURE.md) (design and coordinate mapping) · [INSIGHTS.md](INSIGHTS.md) (three findings from the data)

## Features
- **Routes on the correct minimap:** world `x/z` coordinates are projected onto each map's image.
- **Humans vs bots:** humans are solid routes with circle tokens; bots are teal dashed routes with diamond tokens.
- **Event markers:** kills, deaths, storm deaths and loot each have their own icon, and each can be toggled.
- **Filters:** time period (day, week, month, year or custom range), map, match (searchable by ID) and player (all, human, bot or one specific player).
- **Playback:** play, pause, scrub and step through a match at 5–40× speed, with a kill feed and a combat timeline.
- **Heatmaps:** Kills, Deaths and Traffic layers, as a smooth density map or a 10×10 grid.
- **Zone probe:** drag a circle on the map to count journeys, kills, deaths, storm deaths and loot inside it.

## Tech stack
| Layer | Choice |
|---|---|
| UI | Plain HTML, CSS and JavaScript (no framework, no TypeScript) |
| Rendering | Canvas 2D |
| Data | Pre-generated `data/analysis.js`, converted once from the supplied Parquet files |
| Build | None |
| Dependencies | None (the only external request is Google Fonts: Chakra Petch and Manrope, with a `system-ui` fallback) |
| Hosting | Any static host |

## Run it locally
Requirements: a recent desktop browser (current Chrome, Edge, Firefox or Safari). Nothing to install.

1. Clone the repo.
2. Open `index.html` directly in the browser (it works from `file://`). No server is needed; if you prefer one, any static file server pointed at the repo root will do.

On the first visit a short guide opens automatically. It can be reopened with **New user guide**; whether it has been seen is remembered in `localStorage`.

## Environment variables
**None.** There is no backend, no API keys and no build-time configuration.

## Deploy
The repo is a static site, so there is no build command and the publish directory is the repo root.
- **Netlify / Vercel / Cloudflare Pages:** import the repo, leave the build command empty and set the output directory to `/` (or `.`).
- **GitHub Pages:** serve from the root of the main branch.

The first load downloads about 14.5 MB (`data/analysis.js` is 8.9 MB and the three minimaps are 5.6 MB), so enable gzip or brotli on the host (most do by default). The `player_data/` folder (34 MB) is the original source and is **not** loaded by the app; it can be deleted from a deployment without any effect.

## Repository layout
```
index.html          page shell and dialogs
css/app.css         styles
js/app.js           the whole app (config → scope → scene → camera → heat → render → ui → input → loop)
data/analysis.js    telemetry as window.PLAYER_JOURNEY_DATA
maps/               minimaps resized to 2048×2048
player_data/        original Parquet files and data README (reference only)
ARCHITECTURE.md    design decisions
INSIGHTS.md         findings from the data
```

## Using the tool
Filters are in the left rail, in order: **Time period → Map → Match → Player**. The Match and Player lists only offer options that exist under the other filters. Choosing a match from another map or day moves the other filters to it.

- **All Maps** shows a per-map summary instead of a map, because each map has its own coordinate system. Click a card to investigate that map.
- **All Matches** overlays journeys from different matches aligned at 00:00.
- Clicking a player in the roster isolates them; **Trace journey** replays only that player.

| Key | Action |
|---|---|
| Space | Play / pause |
| ← / → | Step playback |
| Scroll / drag | Zoom / pan the map |
| + / − / 0 | Zoom in / out / reset |
| H | Cycle heat layer (Paths → Kills → Deaths → Traffic) |
| P | Zone probe |
| G | Grid overlay |
| F | Follow selected player |
| 1–5 | Toggle event types |
| Esc | Clear selection |

## Data
`data/analysis.js` sets `window.PLAYER_JOURNEY_DATA`:

```
meta      counts and per-map summary stats
maps[]    { id, name, scale, originX, originZ, ... }
dates[]   'YYYY-MM-DD' strings present in the data
matches[] { id, matchId, mapId, date, playerCount, humanCount, botCount, durationMs (seconds), ... }
players[] one per player per match:
          { id, userId, matchId, matchKey, mapId, date, dates[], isBot,
            events: [{ x, y, z, t, event }] }     // t = seconds since the match's first event
```

The current file holds 89,104 events across 1,242 journeys (781 human, 461 bot), 796 matches and 339 players. To use different data, replace `data/analysis.js` with a file of the same shape. The conversion script that produced it from the Parquet files is not included in this repo.

## Key assumptions
- `ts` in the source files is epoch **seconds** (positions are sampled about every 5 s), not milliseconds, so time is shown as `mm:ss`.
- A player is a bot if their `user_id` is numeric and a human if it is a UUID.
- A match's date comes from its folder name. One file that appears in both the Feb 10 and Feb 11 folders was merged into one journey (88 of its rows are duplicated).
- Heatmaps cover the whole filtered scope, not just the events up to the playhead.

The full list, with the coordinate mapping, is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Known limitations
Enabling every signal at once can feel sluggish on large scopes, while single-metric views stay smooth. See "Future Improvements" in [INSIGHTS.md](INSIGHTS.md).
