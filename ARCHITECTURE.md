# Architecture

## What it is built with, and why
- **Vanilla HTML/CSS/JS, no build step, no runtime dependencies.** One ~840-line IIFE (`js/app.js`, laid out as config → scope → scene → camera → heat → render → ui → input → loop). The data is read-only and ~9 MB, so a backend or framework would add moving parts without adding capability. Any static host can serve it, and it also opens from `file://`.
- **Canvas 2D** for the minimap, routes, markers, heatmaps and playback. A single filtered scope can hold tens of thousands of points, which is too many for DOM or SVG nodes. Drawing is on demand: a `dirty` flag is checked each `requestAnimationFrame`, and the camera eases toward its target.
- **Pre-generated `data/analysis.js`** (`window.PLAYER_JOURNEY_DATA`). Parquet is not parsed in the browser; the raw files were converted once, offline. The only network request besides static files is Google Fonts (Chakra Petch, Manrope), which falls back to `system-ui`.

## Data flow
```
player_data/*.nakama-0 (1,243 parquet files, 5 daily folders)
  └─ offline conversion (Python; the script is not committed) ─▶ data/analysis.js
        { meta, maps[], dates[], matches[], players[] }
  └─ js/app.js:  deriveScope() ─▶ buildScene() ─▶ canvas + rails + timeline
```
**Conversion** decodes the `event` bytes to strings, strips `.nakama-0` from `match_id`, and writes one record per player per match. Each record carries `{id, userId, matchId, matchKey = mapId|matchId, mapId, date(s), isBot, events[{x,y,z,t,event}]}`. Events keep their original names (`Position`, `BotKill`, …) and are already sorted by `t`. Result: 89,104 events, 1,242 journeys (781 human, 461 bot), 796 matches, 339 players.

**In the browser**, every filter change goes through `applyFilter()`, which resets selection and playback, then `refresh()` runs `deriveScope()` (time period → map → match → player gives `scope.players`) and `buildScene()`. The scene holds the projected tracks (`Float32Array` per journey), markers by kind, the timeline histogram and the heat buffers. Paths, markers, heatmaps, probe, roster, KPIs and timeline all read the same scene, so they cannot disagree. Time is compared as `YYYY-MM-DD` strings in UTC, so timezones cannot shift a day. **All Maps** is scope-only: it shows a per-map summary instead of plotting, because each map has its own origin and scale.

## Coordinate mapping
Per the data README, using only world `x` and `z` (`y` is elevation and is ignored):

| Map | Scale | Origin X | Origin Z |
|---|---|---|---|
| AmbroseValley | 900 | −370 | −473 |
| GrandRift | 581 | −290 | −290 |
| Lockdown | 1000 | −500 | −500 |

`u = (x − originX) / scale`, `v = (z − originZ) / scale`, `px = u · 1024`, `py = (1 − v) · 1024`. The **Y flip** is needed because world Z grows upward while image rows grow downward.

- The app works in a fixed 1024² "map space" and draws the image scaled into it, so the math is independent of image resolution. The minimaps are shipped at 2048² (originals were 4320², ~2160² and 9000²) to keep the page light.
- Constants live in the dataset's `maps[]` (with `WORLD` in `app.js` as fallback). `project()` and `unproject()` are exact inverses; the latter drives the hover readout (`X/Z` plus grid cell, A1–J10).
- **Check:** all 89,104 raw points project inside [0, 1024]² on every map (0 out of bounds), and the Ambrose Valley extent lands at roughly px 51–764 / py 75–918. The README's worked example (`−301.45, −355.55` → `78, 890`) also reproduces.
- Grand Rift's source image is 2160×2158 and was resized to a square; the ~0.1% stretch is not visible.

## Features, as implemented
- **Humans vs bots:** determined by `user_id` (UUID = human, numeric = bot). Humans get circle tokens, solid routes, a facing cone and one of five hashed colours. Bots get teal diamond tokens and dashed routes, and bot event markers get a dashed ring.
- **Events:** custom vector glyphs for kill (`Kill`/`BotKill`), death (`Killed`/`BotKilled`), storm death, loot, and a fallback "other". Each can be toggled (keys 1–5). Markers are capped per kind by a density slider and clustered below ~1.65× zoom.
- **Playback:** one playhead over the scope's time range at 5/10/20/40 match-seconds per second. Positions are linearly interpolated between samples. Combat pings last 3 s, a kill feed shows the last 12 s, and a dead player becomes a ✕. The timeline strip combines a 90-bin combat histogram, event ticks and a scrubber.
- **Heatmaps:** Kills, Deaths (deaths + storm) and Traffic (every position sample). *Smooth* is a 256² Gaussian field normalised to the layer's peak and mapped through a colour ramp. *Grid* is 10×10 binning with the same labels as the overlay grid. Heat covers the whole filtered scope, not just up to the playhead.
- **Zone probe:** drag a circle to count journeys, kills, deaths, storm, loot and samples inside it, with a combat-over-time sparkline.

## Assumptions where the data was ambiguous
| Issue | What I found | Handling |
|---|---|---|
| `ts` is documented as ms | Values are ~1.77e9 with a 5 s median gap between samples, so they are epoch **seconds** | Treated as seconds. `t = ts − earliest ts in the match`, so the match starts at 00:00 and journeys overlay. Max is 890 s. |
| `matches[].durationMs` | Holds seconds, not ms (it equals the max `t`) | Rendered as `mm:ss` as seconds. The name is a leftover. |
| Date of a match | The folder name and wall-clock `ts` disagree for 436 rows (0.5%) near UTC midnight | Folder name is the date. The Feb 14 folder is a partial day. |
| One file in two folders | `cfa03e9f…_ac049b28….nakama-0` is byte-identical in `February_10` and `February_11` | Merged into one journey with `dates: [10, 11]`, so 1,243 files give 1,242 journeys. **Known flaw:** the 88 rows were not de-duplicated, so that journey has doubled events and `eventCount` is 88 above the unique count. |
| Bot vs human | Event names and ID type don't fully align: numeric IDs emit 636 `Position`, 183 `BotKill`, 297 `BotKilled` and 115 `Loot` rows | Participant type follows `user_id`. The event kind follows the event name. |
| Few human-vs-human fights | Only 3 `Kill` and 3 `Killed` rows exist; 779 of 796 matches have exactly one human | "Kills" are almost entirely humans killing bots. Overlaying many matches shows aggregate behaviour, not a live lobby. |

## Tradeoffs
| Decision | Alternative | Why this way |
|---|---|---|
| Static app, no backend | API + parquet reader | Read-only 5-day dataset; simplest to deploy and review. |
| Pre-converted JS artifact | Parquet in browser (hyparquet/DuckDB-WASM) | No runtime dependency and instant load. The cost is that regenerating data needs the offline step. |
| Canvas | SVG/DOM | Handles dense routes and heat without per-element nodes. The cost is manual hit-testing (`hits[]`, `tokens[]`). |
| Everything rebuilt on filter change | Incremental updates | Simpler and consistent. At full scope it takes a few ms, but see the limit below. |
| Smooth heat plus 10×10 grid | One style | Smooth for reading the shape of play; grid for exact counts and for matching cell references like "F6". |
| Marker cap and clustering | Draw every event | Keeps thousands of loot pins readable. The cost is that the density slider hides some events at low zoom. |
| Layer focus (a heat layer hides routes/tokens and shows only its own markers) | Always show everything | A heatmap is unreadable under every route. |
| All Maps = summary only | One canvas for all maps | Each map has its own origin and scale, so mixing them would plot wrong positions. |

## Known limits
Enabling every signal at once can feel sluggish, while single-metric views stay smooth. Heatmaps are not time-windowed. The data generator is not in this repo, and the duplicate-file rows above are not yet removed. See "Future Improvements" in `INSIGHTS.md` for the performance plan.