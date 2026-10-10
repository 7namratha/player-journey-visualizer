# Insights

Three things the visualizer showed me about LILA BLACK, from the five-day dataset (Feb 10–14, 2026). Cell names (`F6`, `E5`) are the tool's own grid: columns A–J left to right, rows 1–10 top to bottom of the minimap (press **G** to show it). Counts cover all participants (humans and bots) unless stated.

## 1. Ambrose Valley funnels everyone into four central cells that are both the loot hub and the death zone
**What caught my eye:** with the Kills and Deaths heat layers on Map 01, the two glows land on the same central cluster, while the Paths view shows players arriving from the edges.

**Evidence:**
- **The funnel:** 93% of human journeys (517 of 554) start in just seven perimeter cells (`H6`, `G3`, `A5`, `C9`, `C7`, `A9`, `C2`), and none start in the centre. 61% (339 of 554) still walk into `D6`/`E5`/`E6`/`F6`, typically at about 3:46 into the match.
- **Concentration:** these four cells are 4% of the grid but hold **21.5%** of position samples, **42.3%** of kills (758 of 1,794), **49.3%** of deaths (240 of 487) and **26.6%** of loot (2,646 of 9,936). Deaths run at **22.9 per 1,000 samples** there versus **6.5** everywhere else.
- **Two different jobs:** `F6` is the loot magnet (**1,317** loot events, 13.3% of the whole map, about 10× an average cell) but is only moderately lethal (16.3 deaths per 1k samples). The deadliest cells are its neighbours, `E5` (**32.0**) and `D6` (**28.8**), about 3× the map average of 10.0, with far less loot.

**Action:** treat `F6` as the pull and `E5`/`D6` as the trap. Test splitting or relocating part of `F6`'s loot toward quieter cells (see insight 3), and review cover, sightlines and exits in `E5` and `D6`. Use the **Zone probe** on the four cells to compare before and after builds.

**Metrics affected:** share of kills and deaths inside the four-cell cluster (baseline 42% and 49%), deaths per 1k samples (22.9), top-cell loot share (13.3%), median time to first cluster entry (3:46), and human survival rate.

**Why a level designer should care:** half of all deaths happen in 4% of the map, in the same place as the best loot. That is a strong signal that route choice is being decided by loot placement rather than by the level layout, and it is the area where geometry changes will have the largest effect on pacing.

## 2. The storm only starts killing after 10:55, so it rarely shapes how a match plays out
**What caught my eye:** storm-death markers never appear early in a match: scrubbing the timeline, the first one only shows up after 10 minutes.

**Evidence:**
- **Late and rare:** all **39** storm deaths happen between **655 s (10:55)** and **887 s (14:47)**, with a median of 12:19. That is **8.8%** of the 444 human deaths; the rest are caused by bots (and, in 3 cases, by another human).
- **Few players ever get there:** the median human journey lasts **6:07** (367 s) and only **17%** (133 of 781) last past 10:55. Of those, **29%** end in the storm. After 10:55 the storm causes **85%** of deaths (39 of 46).
- **It varies by map:** the storm accounts for **5.4%** of human deaths on Ambrose Valley (17 of 315) but **17.2%** on Lockdown (17 of 99) and **16.7%** on Grand Rift (5 of 30).
- **No spatial pattern:** no cell has more than 3 storm deaths on any map, so storm deaths are scattered, not tied to one area.

**Action:** if the storm is meant to push players toward extraction or the centre, test an earlier first shrink or a faster early phase on Ambrose Valley, where it matters least. If it is meant only as a closing clock, this is working as designed, and Lockdown and Grand Rift show how the same storm bites on smaller maps. Grand Rift has only 5 storm deaths, so treat it as a lead and confirm with more data.

**Metrics affected:** share of journeys that reach the storm phase (17%), storm share of deaths (8.8%), median journey length (6:07), and a missing extraction rate (see notes below).

**Why a level designer should care:** the storm is the main thing that forces movement across the map. If it only arrives after most players are already done, then layout, loot and bots are the only real pressure for the first 11 minutes.

## 3. Roughly 35–45% of the area players walk in on each map is barely used, and it holds almost no loot
**What caught my eye:** switching the Traffic layer to the 10×10 grid leaves large cold regions inside the area players actually walk.

**Evidence** (cells inside the bounding box of all recorded positions; "quiet" means under 5% of that map's busiest cell):

| Map | Cells in area | Never visited | Quiet | Cells for 50% of traffic | Loot in quiet cells | Kills in quiet cells |
|---|---|---|---|---|---|---|
| Ambrose Valley | 72 | 20 | 31 (43%) | 12 | 67 of 9,936 (0.7%) | 5 of 1,794 |
| Lockdown | 63 | 17 | 28 (44%) | 10 | 4 of 2,050 (0.2%) | 3 of 426 |
| Grand Rift | 63 | 16 | 22 (35%) | 11 | 3 of 880 (0.3%) | 0 of 193 |

On Ambrose Valley the quiet cells are mainly the northern strip (`D1`–`H2`) and the eastern column (`H1`–`H8`). Players are using about a sixth of the cells on each map for half of all movement.

**Action:** first confirm which quiet areas are intentional (blocked, out of bounds, scenery). For the ones that are not, place a few high-value loot spawns there and re-measure. Low traffic and low loot reinforce each other, so loot is the cheapest lever to test.

**Metrics affected:** cells needed for 50% of traffic (10–12 today), loot share in quiet cells (under 1%), share of the map area visited per match, and kill distribution across the map.

**Why a level designer should care:** build effort that nobody walks through is wasted. Opening these areas up would also take pressure off the central hotspot in insight 1.

## Notes on the data and figures
- **Duplicate rows:** one file (`cfa03e9f…_ac049b28….nakama-0`) exists in both the `February_10` and `February_11` folders and was merged with its rows doubled. The figures above remove those **88** rows. The live tool still includes them, so a few central Ambrose cells read slightly higher there (for example `E5` shows 2,429 samples versus 2,410 here).
- **Almost no player-versus-player data:** there are only 3 `Kill` and 3 `Killed` events, and 779 of 796 matches have exactly one human. "Kills" and "deaths" are therefore almost entirely humans versus bots, and the maps' PvP balance cannot be judged from this data.
- **No extraction event:** 43% of human journeys end without a death or storm event, but the data cannot say whether those players extracted or simply stopped being recorded, so survival and extraction rates are not measurable.
- **Sample sizes:** Ambrose Valley has 554 human journeys, Lockdown 170 and Grand Rift only 57, so Grand Rift conclusions are weaker.

## Future Improvements & Known Limitations

These are follow-up opportunities, not changes to the current analysis or dataset.

1. **Improve performance when all metrics are enabled.** The map can feel sluggish with several signal layers active, while a single metric remains smooth. Profile the render pipeline and avoid repeating expensive calculations for each layer.
2. **Cache reusable metric layers.** Reuse heatmap buffers and pre-aggregated event counts where the active filters have not changed; invalidate the cache only when its source scope changes.
3. **Render selectively.** Redraw only dirty layers when practical, and consider batching or progressively drawing dense event markers so interaction stays responsive.
4. **Add performance checks.** Benchmark single-metric and all-metric views on representative matches, including zooming, panning, playback, and filter changes, before and after optimization.
5. **Keep dense views readable.** Review marker clustering and event-density defaults for large scopes so overlapping signals remain useful without hiding player movement.

**Priority:** investigate and measure the all-metrics rendering bottleneck first. Preserve current filtering, map coordinates, metrics, and visual behavior while optimizing; validate each change against the existing single-metric experience.