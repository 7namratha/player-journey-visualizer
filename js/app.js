/* LILA BLACK · Player Journey Map
 * Vanilla JS, no build step, no dependencies. Works from file:// or any static host.
 * Layout of this file: config → helpers → state → scope → scene → camera → heat → render → ui → input → loop
 */
(() => {
'use strict';
const D = window.PLAYER_JOURNEY_DATA;
const $ = (id) => document.getElementById(id);
const SIZE = 1024;                                   // map space: 1 unit = 1 px of a 1024² minimap

/* ── config ─────────────────────────────────────────────────────────── */
const MAP_IMG = { AmbroseValley: 'maps/AmbroseValley_Minimap.png', GrandRift: 'maps/GrandRift_Minimap.png', Lockdown: 'maps/Lockdown_Minimap.jpg' };
const WORLD = { AmbroseValley: { scale: 900, originX: -370, originZ: -473 }, GrandRift: { scale: 581, originX: -290, originZ: -290 }, Lockdown: { scale: 1000, originX: -500, originZ: -500 } };
const KINDS = {
  kill:  { color: '#ee7358', label: 'Elimination',       sym: '⚔' },
  death: { color: '#6f95d6', label: 'Death',             sym: '⚰' },
  storm: { color: '#a184e8', label: 'Storm elimination', sym: 'ϟ' },
  loot:  { color: '#b9d94a', label: 'Loot',              sym: '▣' },
  other: { color: '#9aa7ae', label: 'Other event',       sym: '◆' },
};
const KIND_KEYS = Object.keys(KINDS);
const KIND_DESC = { kill: 'Combat outcomes', death: 'Player eliminated', storm: 'Killed by storm', loot: 'Loot interaction', other: 'Objectives & other signals' };
const COMBAT = new Set(['kill', 'death', 'storm']);
const HUMAN_COLORS = ['#f2a759', '#8c83d5', '#5ca8d5', '#d276a1', '#d0b54e'];
const BOT_COLOR = '#4fd1c0';
const LAYERS = [['off', 'Paths'], ['kills', 'Kills'], ['deaths', 'Deaths'], ['traffic', 'Traffic']];
const HEAT_RAMPS = {                                 // [stop, r, g, b]
  kills:   [[0, 236, 114, 87], [.55, 255, 170, 90], [1, 255, 244, 190]],
  deaths:  [[0, 99, 83, 147], [.55, 168, 108, 230], [1, 255, 205, 255]],
  traffic: [[0, 40, 150, 160], [.5, 169, 202, 58], [1, 255, 240, 140]],
};
const HEAT_KINDS = { kills: ['kill'], deaths: ['death', 'storm'], traffic: ['kill', 'death', 'storm'] };   // markers kept visible above each heat layer
const SPEEDS = [5, 10, 20, 40];                      // match-seconds per real second
const TRAIL_SECONDS = 45, PING_SECONDS = 3, FEED_SECONDS = 12;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── helpers ────────────────────────────────────────────────────────── */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const norm = (e = '') => String(e).trim().toLowerCase().replace(/[\s_-]+/g, '');
const isPos = (e) => { const v = norm(e); return v === 'position' || v === 'botposition'; };
function kindOf(e) {                                  // raw event string → semantic kind
  const v = norm(e);
  if (v.includes('storm')) return 'storm';
  if (v.includes('loot')) return 'loot';
  if (v.includes('death') || v.includes('died') || v.includes('killedby') || v === 'killed' || v.endsWith('killed')) return 'death';
  if (v.includes('kill') || v.includes('eliminat')) return 'kill';
  return isPos(e) ? 'position' : 'other';
}
const isBot = (p) => typeof p.isBot === 'boolean' ? p.isBot : /^\d+$/.test(String(p.userId || p.id || ''));
const pLabel = (p) => `${isBot(p) ? 'BOT' : 'PLAYER'} ${String(p.userId || p.id || '?').slice(-6).toUpperCase()}`;
const fmtT = (s) => { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const pColor = (p) => { if (isBot(p)) return BOT_COLOR; let n = 0; for (const c of String(p.id)) n = (n * 31 + c.charCodeAt(0)) | 0; return HUMAN_COLORS[Math.abs(n) % HUMAN_COLORS.length]; };
const recDates = (r) => (Array.isArray(r.dates) && r.dates.length ? r.dates : [r.date].filter(Boolean));
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const upperBound = (arr, v, n = arr.length) => { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m + 1; else hi = m; } return lo; };
const sampleEvenly = (a, max) => { if (a.length <= max) return a; const s = (a.length - 1) / (max - 1), o = []; for (let i = 0; i < max; i++) o.push(a[Math.round(i * s)]); return o; };
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mapNo = (id) => 'Map ' + String(D.maps.findIndex((m) => m.id === id) + 1).padStart(2, '0');   // Map 01 / 02 / 03 in data order

/* Calendar helpers. Dates are 'YYYY-MM-DD' strings handled in UTC so the local timezone can never shift a day. */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const utc = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (s, n) => isoDay(utc(s) + n * 864e5);
const weekStart = (s) => addDays(s, -((new Date(utc(s)).getUTCDay() + 6) % 7));            // weeks run Monday → Sunday
const fmtDay = (s, year) => { if (!s) return '—'; const [y, m, d] = s.split('-').map(Number); return `${MON[m - 1]} ${d}${year ? `, ${y}` : ''}`; };
const fmtSpan = (a, b) => (a === b ? fmtDay(a, true) : a.slice(0, 4) === b.slice(0, 4) ? `${fmtDay(a)} – ${fmtDay(b, true)}` : `${fmtDay(a, true)} – ${fmtDay(b, true)}`);
const GRANS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['custom', 'Custom']];
const _periods = {};
function periodsFor(g) {                              // selectable periods of one granularity, taken from the days present in the data
  if (_periods[g]) return _periods[g];
  const seen = new Map();
  for (const d of D.dates) {
    let key, from, to, label;
    if (g === 'day') { key = from = to = d; label = `${WDAY[new Date(utc(d)).getUTCDay()]}, ${fmtDay(d, true)}`; }
    else if (g === 'week') { from = weekStart(d); to = addDays(from, 6); key = from; label = `Week of ${fmtSpan(from, to)}`; }
    else if (g === 'month') { const [y, m] = d.split('-').map(Number); key = d.slice(0, 7); from = `${key}-01`; to = isoDay(Date.UTC(y, m, 0)); label = `${MONTH[m - 1]} ${y}`; }
    else { key = d.slice(0, 4); from = `${key}-01-01`; to = `${key}-12-31`; label = key; }
    if (!seen.has(key)) seen.set(key, { key, from, to, label });
  }
  return (_periods[g] = [...seen.values()]);
}
const DATA_MIN = D.dates[0], DATA_MAX = D.dates[D.dates.length - 1];
const YEARS = [...new Set(D.dates.map((d) => d.slice(0, 4)))];
const DEFAULT_YEAR = YEARS.includes('2026') ? '2026' : YEARS[YEARS.length - 1];            // Year → 2026 by default
const DEFAULT_MAP = D.maps.some((m) => m.id === 'AmbroseValley') ? 'AmbroseValley' : D.maps[0]?.id;

/* World → minimap. u=(x-originX)/scale, v=(z-originZ)/scale, pixel=(u, 1-v)·SIZE. World Y (elevation) is ignored. */
function transformFor(map) {
  const d = WORLD[map.id] || {};
  const scale = +(map.scale ?? d.scale), originX = +(map.originX ?? d.originX), originZ = +(map.originZ ?? d.originZ);
  return { scale, originX, originZ, ok: scale > 0 && isFinite(originX) && isFinite(originZ) };
}
const project = (tf, x, z) => tf.ok && isFinite(x) && isFinite(z) ? [((x - tf.originX) / tf.scale) * SIZE, (1 - (z - tf.originZ) / tf.scale) * SIZE] : null;
const unproject = (tf, px, py) => [tf.originX + (px / SIZE) * tf.scale, tf.originZ + (1 - py / SIZE) * tf.scale];

/* ── state ──────────────────────────────────────────────────────────── */
const S = {
  map: DEFAULT_MAP,                                   // a map id, or 'all' for the per-map summary
  gran: 'year', period: DEFAULT_YEAR, cFrom: DATA_MIN, cTo: DATA_MAX,   // time aggregation + its selected period / custom range
  match: 'all', who: 'all', playerId: null,           // who: all | human | bot | player (playerId = userId)
  ev: { kill: true, death: true, storm: true, loot: true, other: true },
  layer: 'off', heatStyle: 'smooth', density: 72, grid: true, follow: false, probeOn: false, probe: null,
  sel: null, trace: null, detail: null, search: '', reverse: false,
  playing: false, progress: 0, speed: 20, hover: null, cursor: null, dirty: true,
};
let scope = null, scene = null, tb = { min: 0, max: 0 }, tf = null;
const byMatch = new Map();
D.players.forEach((p) => { if (!byMatch.has(p.matchKey)) byMatch.set(p.matchKey, []); byMatch.get(p.matchKey).push(p); });
const userFirst = new Map();
D.players.forEach((p) => { const k = String(p.userId); if (!userFirst.has(k)) userFirst.set(k, p); });
const mapById = (id) => D.maps.find((m) => m.id === id) || D.maps[0];
const images = {};
D.maps.forEach((m) => { const i = new Image(); i.onload = () => { S.dirty = true; }; i.src = MAP_IMG[m.id] || m.image; images[m.id] = i; });

/* ── scope: time period / map / match / player → players ───────────── */
function dateRange() {                                // inclusive [from, to] of the active time period
  if (S.gran === 'custom') return { from: S.cFrom, to: S.cTo };
  const ps = periodsFor(S.gran), p = ps.find((x) => x.key === S.period) || ps[0];
  S.period = p.key; return { from: p.from, to: p.to };
}
const makeDateOk = () => { const { from, to } = dateRange(); return (r) => recDates(r).some((d) => d >= from && d <= to); };
const whoOk = (p) => S.who === 'all' || (S.who === 'human' && !isBot(p)) || (S.who === 'bot' && isBot(p)) ||
  (S.who === 'player' && (!S.playerId || String(p.userId) === S.playerId));          // 'player' with nobody chosen yet = everyone
function deriveScope() {
  const dateOk = makeDateOk(), mapOk = (r) => S.map === 'all' || r.mapId === S.map;
  const inTime = D.players.filter(dateOk);            // every journey in the chosen period, on any map
  const mapMatches = {}, seen = new Set();            // match counts per map for the Map selector (period + player filters applied)
  for (const p of inTime) if (whoOk(p) && !seen.has(p.matchKey)) { seen.add(p.matchKey); mapMatches[p.mapId] = (mapMatches[p.mapId] || 0) + 1; }
  const withWho = new Set(inTime.filter((p) => mapOk(p) && whoOk(p)).map((p) => p.matchKey));
  const visibleMatches = D.matches.filter((m) => withWho.has(m.id)).sort((a, b) => b.playerCount - a.playerCount);
  if (S.match !== 'all' && !visibleMatches.some((m) => m.id === S.match)) S.match = 'all';
  const matches = S.match === 'all' ? visibleMatches : visibleMatches.filter((m) => m.id === S.match);
  const pool = matches.flatMap((m) => byMatch.get(m.id) || []).filter((p) => mapOk(p) && dateOk(p));   // before the player filter: feeds the player picker
  const players = pool.filter(whoOk);
  const opts = new Map();
  for (const p of pool) { const k = String(p.userId), o = opts.get(k) || { userId: k, bot: isBot(p), n: 0, p }; o.n++; opts.set(k, o); }
  const playerOpts = [...opts.values()].sort((a, b) => a.bot - b.bot || b.n - a.n);
  const humans = players.filter((p) => !isBot(p)).length;
  if (S.sel && !players.some((p) => p.id === S.sel)) { S.sel = null; S.trace = null; S.detail = null; }
  scope = { visibleMatches, matches, players, pool, playerOpts, mapMatches, humans, bots: players.length - humans, map: mapById(S.map), allMaps: S.map === 'all', byId: new Map(players.map((p) => [p.id, p])) };
  tf = transformFor(scope.map);
}
const eligible = (p) => !S.sel || p.id === S.sel;

/* ── scene: projected tracks, markers, bounds (rebuilt on any scope/filter change) ── */
function buildScene() {
  const tracks = [], markers = [];
  let tmin = Infinity, tmax = -Infinity;
  for (const p of scope.allMaps ? [] : scope.players) {   // All Maps: each map has its own coordinates, so only the summary is shown
    if (!eligible(p)) continue;
    const pts = [];
    p.events.forEach((e, i) => {
      const t = +e.t; if (!isFinite(t)) return;
      tmin = Math.min(tmin, t); tmax = Math.max(tmax, t);
      const xy = project(tf, +e.x, +e.z); if (!xy) return;
      const k = kindOf(e.event);
      if (k === 'position') pts.push([t, xy[0], xy[1]]); else markers.push({ p, e, i, k, t, x: xy[0], y: xy[1] });
    });
    pts.sort((a, b) => a[0] - b[0]);
    const n = pts.length, T = new Float32Array(n), X = new Float32Array(n * 2);
    pts.forEach((q, j) => { T[j] = q[0]; X[j * 2] = q[1]; X[j * 2 + 1] = q[2]; });
    tracks.push({ p, T, X, n, bot: isBot(p), color: pColor(p), deathT: deathTime(p) });
  }
  markers.sort((a, b) => a.t - b.t);
  tb = isFinite(tmin) ? { min: tmin, max: tmax } : { min: 0, max: 0 };
  scene = { tracks, markers, T: markers.map((m) => m.t), pool: [], poolT: [], hist: null, heat: null };
  buildPool(); buildHeat();
}
function deathTime(p) {                               // first death / storm timestamp, cached on the player record
  if (p._dt === undefined) { p._dt = Infinity; for (const e of p.events) { const k = kindOf(e.event); if ((k === 'death' || k === 'storm') && +e.t < p._dt) p._dt = +e.t; } }
  return p._dt;
}
function buildPool() {                                // density-bounded markers actually drawn
  const cap = Math.round(50 + (S.density / 100) ** 2 * 12000), by = {};
  KIND_KEYS.forEach((k) => (by[k] = []));
  for (const m of scene.markers) if (S.ev[m.k]) by[m.k].push(m);
  scene.pool = KIND_KEYS.flatMap((k) => sampleEvenly(by[k], cap)).sort((a, b) => a.t - b.t);
  scene.poolT = scene.pool.map((m) => m.t);
  const span = tb.max - tb.min || 1, bins = 90, hist = Array.from({ length: bins }, () => ({ kill: 0, death: 0, storm: 0 }));
  let top = 1;
  for (const m of scene.markers) if (COMBAT.has(m.k) && S.ev[m.k]) { const b = hist[clamp(Math.floor((m.t - tb.min) / span * bins), 0, bins - 1)]; b[m.k]++; top = Math.max(top, b.kill + b.death + b.storm); }
  scene.hist = { hist, top, bins };
}

/* ── camera: target/current affine transform with critically-damped easing ── */
const cam = {
  w: 1, h: 1, dpr: 1, k: 1, x: 0, y: 0, tk: 1, tx: 0, ty: 0,
  get base() { return Math.min(this.w, this.h) / SIZE; },
  get zoom() { return this.k / this.base; },
  resize(w, h) {                                    // keep a fitted view fitted; otherwise keep the same map point centred
    const wasFit = this.w <= 1 || Math.abs(this.tk - this.base) < 1e-3, dx = (w - this.w) / 2, dy = (h - this.h) / 2;
    this.w = w; this.h = h;
    if (wasFit) this.fit(true); else { this.pan(dx, dy); }
    S.dirty = true;
  },
  fit(now) { const b = this.base; this.tk = b; this.tx = (this.w - SIZE * b) / 2; this.ty = (this.h - SIZE * b) / 2; if (now) { this.k = this.tk; this.x = this.tx; this.y = this.ty; } },
  zoomAt(f, sx = this.w / 2, sy = this.h / 2) { const nk = clamp(this.tk * f, this.base, this.base * 8), r = nk / this.tk; this.tx = sx - (sx - this.tx) * r; this.ty = sy - (sy - this.ty) * r; this.tk = nk; },
  pan(dx, dy) { this.tx += dx; this.ty += dy; this.x += dx; this.y += dy; },
  focus(px, py, zoom, now) { this.tk = this.base * zoom; this.tx = this.w / 2 - px * this.tk; this.ty = this.h / 2 - py * this.tk; if (now) { this.k = this.tk; this.x = this.tx; this.y = this.ty; } },
  step(dt) {
    const a = reduceMotion ? 1 : 1 - Math.exp(-dt * 14);
    const moving = Math.abs(this.tk - this.k) > 1e-4 || Math.abs(this.tx - this.x) > .05 || Math.abs(this.ty - this.y) > .05;
    if (!moving) return false;
    this.k += (this.tk - this.k) * a; this.x += (this.tx - this.x) * a; this.y += (this.ty - this.y) * a; return true;
  },
  sx(px) { return px * this.k + this.x; }, sy(py) { return py * this.k + this.y; },
  wx(sx) { return (sx - this.x) / this.k; }, wy(sy) { return (sy - this.y) / this.k; },
};
function focusSelection() {
  if (!S.sel) return;
  if (S.detail && S.detail.pid === S.sel) { const m = scene.markers.find((q) => q.p.id === S.detail.pid && q.i === S.detail.i); if (m) { cam.focus(m.x, m.y, 2.35); return; } }
  const tr = scene.tracks[0]; if (!tr || !tr.n) return;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < tr.n; i++) { x0 = Math.min(x0, tr.X[i * 2]); x1 = Math.max(x1, tr.X[i * 2]); y0 = Math.min(y0, tr.X[i * 2 + 1]); y1 = Math.max(y1, tr.X[i * 2 + 1]); }
  cam.focus((x0 + x1) / 2, (y0 + y1) / 2, Math.min(3, Math.max(1.35, 72 / Math.max((Math.max(x1 - x0, y1 - y0)) / 10.24, 22))));
}

/* ── heat: smooth Gaussian density field + the original 10×10 grid ──── */
const HN = 256;
const heatCv = document.createElement('canvas'); heatCv.width = heatCv.height = HN;
const heatCx = heatCv.getContext('2d'), heatImg = heatCx.createImageData(HN, HN), heatField = new Float32Array(HN * HN);
function lut(ramp) {
  const out = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255; let a = ramp[0], b = ramp[ramp.length - 1];
    for (let j = 0; j < ramp.length - 1; j++) if (t >= ramp[j][0] && t <= ramp[j + 1][0]) { a = ramp[j]; b = ramp[j + 1]; break; }
    const f = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
    out[i * 4] = a[1] + (b[1] - a[1]) * f; out[i * 4 + 1] = a[2] + (b[2] - a[2]) * f; out[i * 4 + 2] = a[3] + (b[3] - a[3]) * f;
    out[i * 4 + 3] = Math.min(235, 40 + 215 * Math.pow(t, .65)) * (t < .02 ? t / .02 : 1);
  }
  return out;
}
const LUTS = Object.fromEntries(Object.entries(HEAT_RAMPS).map(([k, v]) => [k, lut(v)]));
function heatPoints(mode) {                           // visible-participant points feeding the active layer
  const pts = [];
  if (mode === 'traffic') { for (const tr of scene.tracks) for (let i = 0; i < tr.n; i++) pts.push(tr.X[i * 2], tr.X[i * 2 + 1]); }
  else for (const m of scene.markers) if (mode === 'kills' ? m.k === 'kill' && S.ev.kill : (m.k === 'death' && S.ev.death) || (m.k === 'storm' && S.ev.storm)) pts.push(m.x, m.y);
  return pts;
}
function buildHeat() {
  scene.heat = null;
  if (S.layer === 'off') return;
  const pts = heatPoints(S.layer), cells = new Map();
  let max = 1;
  for (let i = 0; i < pts.length; i += 2) {           // grid: identical 10×10 binning to the original tool
    const c = clamp(Math.floor(pts[i] / SIZE * 10), 0, 9), r = clamp(Math.floor(pts[i + 1] / SIZE * 10), 0, 9), key = r * 10 + c;
    const v = (cells.get(key) || 0) + 1; cells.set(key, v); if (v > max) max = v;
  }
  scene.heat = { cells, max, count: pts.length / 2 };
  if (S.heatStyle !== 'smooth') return;
  heatField.fill(0);
  const sigma = S.layer === 'traffic' ? 2.2 : 3.2, R = Math.ceil(sigma * 3), K = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) K.push(dx, dy, Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)));
  for (let i = 0; i < pts.length; i += 2) {
    const gx = Math.floor(pts[i] / SIZE * HN), gy = Math.floor(pts[i + 1] / SIZE * HN);
    for (let j = 0; j < K.length; j += 3) { const x = gx + K[j], y = gy + K[j + 1]; if (x >= 0 && y >= 0 && x < HN && y < HN) heatField[y * HN + x] += K[j + 2]; }
  }
  let peak = 0; for (let i = 0; i < heatField.length; i++) if (heatField[i] > peak) peak = heatField[i];
  const L = LUTS[S.layer], d = heatImg.data;
  for (let i = 0; i < heatField.length; i++) {
    const idx = peak ? Math.min(255, Math.round((heatField[i] / peak) * 255)) : 0;
    d[i * 4] = L[idx * 4]; d[i * 4 + 1] = L[idx * 4 + 1]; d[i * 4 + 2] = L[idx * 4 + 2]; d[i * 4 + 3] = L[idx * 4 + 3];
  }
  heatCx.putImageData(heatImg, 0, 0);
}

/* ── render ─────────────────────────────────────────────────────────── */
const cv = $('cv'), ctx = cv.getContext('2d'), mini = $('mini'), mctx = mini.getContext('2d');
const playhead = () => tb.min + (tb.max - tb.min) * S.progress;
let tokens = [], hits = [];

function render() {
  const ph = playhead(), w = cam.w, h = cam.h;
  ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const img = images[S.map], k = cam.k;
  if (img && img.complete && img.naturalWidth) { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, cam.x, cam.y, SIZE * k, SIZE * k); }
  else { ctx.fillStyle = '#10181e'; ctx.fillRect(cam.x, cam.y, SIZE * k, SIZE * k); }
  ctx.strokeStyle = 'rgba(233,229,218,.18)'; ctx.lineWidth = 1; ctx.strokeRect(cam.x, cam.y, SIZE * k, SIZE * k);
  if (S.grid) drawGrid();
  if (S.layer === 'off') drawPaths(ph);
  if (scene.heat) drawHeat();                          // heat sits above paths, below markers
  drawMarkers(ph);
  if (S.layer === 'off') drawTokens(ph);
  drawProbe();
}
function drawGrid() {
  const cell = SIZE / 10 * cam.k;
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(233,229,218,.09)'; ctx.beginPath();
  for (let i = 1; i < 10; i++) { const p = i * cell; ctx.moveTo(cam.x + p, cam.y); ctx.lineTo(cam.x + p, cam.y + SIZE * cam.k); ctx.moveTo(cam.x, cam.y + p); ctx.lineTo(cam.x + SIZE * cam.k, cam.y + p); }
  ctx.stroke();
  if (cell < 54) return;
  ctx.fillStyle = 'rgba(233,229,218,.42)'; ctx.font = '600 11px Chakra Petch, system-ui'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) { const x = cam.x + c * cell + 5, y = cam.y + r * cell + 4; if (x > -40 && y > -20 && x < cam.w && y < cam.h) ctx.fillText('ABCDEFGHIJ'[c] + (r + 1), x, y); }
}
function drawHeat() {
  const H = scene.heat, rgb = { kills: '236,114,87', deaths: '99,83,147', traffic: '169,202,58' }[S.layer];
  if (S.heatStyle === 'smooth') { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.globalAlpha = .92; ctx.drawImage(heatCv, cam.x, cam.y, SIZE * cam.k, SIZE * cam.k); ctx.globalAlpha = 1; return; }
  const cell = SIZE / 10 * cam.k;
  H.cells.forEach((n, key) => { ctx.fillStyle = `rgba(${rgb},${0.16 + (n / H.max) * 0.48})`; ctx.fillRect(cam.x + (key % 10) * cell + 1, cam.y + Math.floor(key / 10) * cell + 1, cell - 2, cell - 2); });
}
function drawPaths(ph) {
  const many = scene.tracks.length > 40;
  const focused = S.sel || S.trace;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const tr of scene.tracks) {
    const n = upperBound(tr.T, ph, tr.n); if (n < 1) continue;
    const sel = S.sel === tr.p.id, tracing = S.trace === tr.p.id, hot = sel || tracing;
    const alpha = hot ? 1 : (many ? .20 : .48) * (scene.heat ? .24 : 1);
    const baseW = hot ? 5.5 : tr.bot ? 1.8 : 2.2;

    // Tactical route casing: a dark halo keeps the route readable over busy terrain.
    ctx.globalAlpha = alpha;
    ctx.setLineDash(tr.bot ? [8, 6] : []);
    ctx.strokeStyle = 'rgba(5,9,12,.82)';
    ctx.lineWidth = baseW + (hot ? 5 : 3);
    ctx.beginPath(); ctx.moveTo(cam.sx(tr.X[0]), cam.sy(tr.X[1]));
    for (let i = 1; i < n; i++) ctx.lineTo(cam.sx(tr.X[i * 2]), cam.sy(tr.X[i * 2 + 1]));
    const head = headAt(tr, ph, n);
    if (head && n < tr.n) ctx.lineTo(cam.sx(head[0]), cam.sy(head[1]));
    ctx.stroke();

    ctx.strokeStyle = tr.color;
    ctx.lineWidth = baseW;
    ctx.beginPath(); ctx.moveTo(cam.sx(tr.X[0]), cam.sy(tr.X[1]));
    for (let i = 1; i < n; i++) ctx.lineTo(cam.sx(tr.X[i * 2]), cam.sy(tr.X[i * 2 + 1]));
    if (head && n < tr.n) ctx.lineTo(cam.sx(head[0]), cam.sy(head[1]));
    ctx.stroke();

    // Recent movement is brighter, giving the route a clear direction of travel.
    const from = Math.max(0, upperBound(tr.T, ph - TRAIL_SECONDS, tr.n) - 1);
    if ((n - from > 1 && !many && !scene.heat) || hot) {
      ctx.globalAlpha = hot ? 1 : .92;
      ctx.lineWidth = hot ? 3.2 : 2.8; ctx.setLineDash([]); ctx.strokeStyle = tr.color;
      ctx.beginPath(); ctx.moveTo(cam.sx(tr.X[from * 2]), cam.sy(tr.X[from * 2 + 1]));
      for (let i = from + 1; i < n; i++) ctx.lineTo(cam.sx(tr.X[i * 2]), cam.sy(tr.X[i * 2 + 1]));
      if (head && n < tr.n) ctx.lineTo(cam.sx(head[0]), cam.sy(head[1])); ctx.stroke();
    }

    // Direction chevrons make the route readable even when it crosses itself.
    if ((hot || (!many && !scene.heat)) && n > 3) {
      const stride = hot ? Math.max(5, Math.floor(n / 7)) : Math.max(8, Math.floor(n / 5));
      ctx.globalAlpha = hot ? 1 : .72; ctx.fillStyle = '#f4f1e8';
      for (let i = stride; i < n; i += stride) {
        const ax = cam.sx(tr.X[(i - 1) * 2]), ay = cam.sy(tr.X[(i - 1) * 2 + 1]);
        const bx = cam.sx(tr.X[i * 2]), by = cam.sy(tr.X[i * 2 + 1]);
        const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy); if (len < 7) continue;
        const ux = dx / len, uy = dy / len, px = -uy, py = ux, size = hot ? 5.5 : 4;
        ctx.beginPath(); ctx.moveTo(bx + ux * size, by + uy * size); ctx.lineTo(bx - ux * size + px * size * .7, by - uy * size + py * size * .7); ctx.lineTo(bx - ux * size - px * size * .7, by - uy * size - py * size * .7); ctx.closePath(); ctx.fill();
      }
    }

    // Start marker is always useful; endpoint/death marker gets extra emphasis.
    if (hot || (!many && !scene.heat)) {
      const sx = cam.sx(tr.X[0]), sy = cam.sy(tr.X[1]);
      ctx.globalAlpha = hot ? 1 : .8; ctx.strokeStyle = '#0c1115'; ctx.lineWidth = 3; ctx.fillStyle = tr.color;
      ctx.beginPath(); ctx.arc(sx, sy, hot ? 6 : 4.5, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#f4f1e8'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(sx, sy, hot ? 9 : 7, 0, 7); ctx.stroke();
      if (n >= tr.n) {
        const ex = cam.sx(tr.X[(tr.n - 1) * 2]), ey = cam.sy(tr.X[(tr.n - 1) * 2 + 1]);
        const endedByDeath = isFinite(tr.deathT) && tr.deathT <= tr.T[tr.n - 1] + .5;
        ctx.fillStyle = endedByDeath ? KINDS.death.color : '#f4f1e8'; ctx.strokeStyle = '#0c1115'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ex, ey, hot ? 5.5 : 4, 0, 7); ctx.fill(); ctx.stroke();
      }
    }
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;
}
function headAt(tr, ph, n = upperBound(tr.T, ph, tr.n)) {   // interpolated position at the playhead
  if (!n) return null; if (n >= tr.n) return [tr.X[(tr.n - 1) * 2], tr.X[(tr.n - 1) * 2 + 1]];
  const a = n - 1, f = (ph - tr.T[a]) / ((tr.T[n] - tr.T[a]) || 1);
  return [tr.X[a * 2] + (tr.X[n * 2] - tr.X[a * 2]) * f, tr.X[a * 2 + 1] + (tr.X[n * 2 + 1] - tr.X[a * 2 + 1]) * f];
}
function glyph(kind, x, y, r) {
  const c = KINDS[kind].color, dark = '#0c1115', paper = '#f4f1e8';
  ctx.save(); ctx.translate(x, y); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // A soft badge makes the custom silhouettes readable at normal map zoom.
  ctx.fillStyle = 'rgba(7,10,13,.78)'; ctx.strokeStyle = 'rgba(7,10,13,.95)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, r + 3, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = c; ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1.2, r * .16);

  if (kind === 'death') {
    // Coffin: lid, tapered body, seam and small cross.
    const w = r * 1.05, h = r * 1.62;
    ctx.beginPath(); ctx.moveTo(-w*.62,-h*.62); ctx.lineTo(w*.62,-h*.62); ctx.lineTo(w*.48,h*.58); ctx.lineTo(-w*.48,h*.58); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w*.78,-h*.76); ctx.lineTo(w*.78,-h*.76); ctx.lineTo(w*.62,-h*.48); ctx.lineTo(-w*.62,-h*.48); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = paper; ctx.lineWidth = Math.max(1, r*.12); ctx.beginPath(); ctx.moveTo(0,-h*.36); ctx.lineTo(0,h*.27); ctx.moveTo(-w*.25,-h*.04); ctx.lineTo(w*.25,-h*.04); ctx.stroke();
  } else if (kind === 'kill') {
    // Crossed blades rather than a generic X.
    ctx.rotate(-.72); ctx.beginPath(); ctx.moveTo(-r*.72,r*.62); ctx.lineTo(r*.72,-r*.62); ctx.stroke();
    ctx.rotate(1.44); ctx.beginPath(); ctx.moveTo(-r*.72,r*.62); ctx.lineTo(r*.72,-r*.62); ctx.stroke();
    ctx.strokeStyle = paper; ctx.lineWidth = Math.max(1,r*.1); ctx.beginPath(); ctx.moveTo(-r*.72,r*.62); ctx.lineTo(-r*.92,r*.78); ctx.moveTo(r*.72,-r*.62); ctx.lineTo(r*.92,-r*.78); ctx.stroke();
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0,0,r*.2,0,7); ctx.fill();
  } else if (kind === 'storm') {
    // Storm: lightning bolt inside a warning ring.
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-r*.18,-r*.82); ctx.lineTo(r*.42,-r*.12); ctx.lineTo(r*.06,-r*.08); ctx.lineTo(r*.28,r*.78); ctx.lineTo(-r*.48,r*.02); ctx.lineTo(-r*.08,r*.04); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(1.2,r*.12); ctx.beginPath(); ctx.arc(0,0,r*.9,0,7); ctx.stroke();
  } else if (kind === 'loot') {
    // Treasure chest: body, lid, central lock and rim.
    ctx.beginPath(); ctx.roundRect(-r*.78,-r*.34,r*1.56,r*1.05,r*.12); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,-r*.33,r*.78,Math.PI,0); ctx.lineTo(r*.78,-r*.2); ctx.lineTo(-r*.78,-r*.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = paper; ctx.lineWidth = Math.max(1,r*.1); ctx.beginPath(); ctx.moveTo(-r*.78,-r*.08); ctx.lineTo(r*.78,-r*.08); ctx.stroke();
    ctx.fillStyle = paper; ctx.strokeStyle = dark; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(-r*.12,-r*.02,r*.24,r*.3,r*.04); ctx.fill(); ctx.stroke();
  } else {
    // Other/objective: tactical diamond marker.
    ctx.beginPath(); ctx.moveTo(0,-r*.78); ctx.lineTo(r*.78,0); ctx.lineTo(0,r*.78); ctx.lineTo(-r*.78,0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = paper; ctx.beginPath(); ctx.arc(0,0,r*.16,0,7); ctx.fill();
  }
  ctx.restore();
}
function drawMarkers(ph) {
  hits = [];
  const n = upperBound(scene.poolT, ph), z = cam.zoom, r = clamp(4.5 + z * 1.2, 5, 11);
  const clustered = z < 1.65, cell = (4 + (100 - S.density) * .02) * 10.24, groups = new Map();
  for (let i = 0; i < n; i++) {
    const m = scene.pool[i];
    if (scene.heat && !HEAT_KINDS[S.layer].includes(m.k)) continue;
    if (!clustered) { hits.push({ x: cam.sx(m.x), y: cam.sy(m.y), r, m, count: 1 }); continue; }
    const key = (Math.floor(m.x / cell) * 512 + Math.floor(m.y / cell)) * 8 + KIND_KEYS.indexOf(m.k);
    const g = groups.get(key); if (g) { g.count++; g.sx += m.x; g.sy += m.y; } else groups.set(key, { m, count: 1, sx: m.x, sy: m.y });
  }
  if (clustered) groups.forEach((g) => hits.push({ x: cam.sx(g.sx / g.count), y: cam.sy(g.sy / g.count), r: g.count > 1 ? r + 3 : r, m: g.m, count: g.count }));
  const pinged = [], dim = scene.heat ? .6 : 1;
  ctx.globalAlpha = dim;
  for (const q of hits) {
    if (q.x < -20 || q.y < -20 || q.x > cam.w + 20 || q.y > cam.h + 20) continue;
    if (q.count > 1 && scene.heat) { ctx.fillStyle = KINDS[q.m.k].color; ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, 7); ctx.fill(); }
    else if (q.count > 1) {
      ctx.fillStyle = KINDS[q.m.k].color; ctx.strokeStyle = '#0c1115'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0c1115'; ctx.font = '700 11px Chakra Petch, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(q.count > 99 ? '99+' : q.count, q.x, q.y + .5);
    } else {
      glyph(q.m.k, q.x, q.y, q.r);
      if (isBot(q.m.p)) { ctx.strokeStyle = BOT_COLOR; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.beginPath(); ctx.arc(q.x, q.y, q.r + 3, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      if (S.detail && S.detail.pid === q.m.p.id && S.detail.i === q.m.i) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, q.r + 5, 0, 7); ctx.stroke(); }
      if (z >= 2.2) { ctx.fillStyle = 'rgba(233,229,218,.9)'; ctx.font = '600 11px Manrope, system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(KINDS[q.m.k].label, q.x + q.r + 5, q.y); }
    }
    if (COMBAT.has(q.m.k) && ph - q.m.t < PING_SECONDS && ph >= q.m.t) pinged.push(q);
  }
  ctx.globalAlpha = 1;
  for (const q of pinged) { const a = (ph - q.m.t) / PING_SECONDS; ctx.strokeStyle = KINDS[q.m.k].color; ctx.globalAlpha = (1 - a) * .9; ctx.lineWidth = 2.5 * (1 - a) + .5; ctx.beginPath(); ctx.arc(q.x, q.y, q.r + 4 + a * 34, 0, 7); ctx.stroke(); }
  ctx.globalAlpha = 1;
}
function drawTokens(ph) {
  tokens = [];
  const many = scene.tracks.length > 60, z = cam.zoom, r = clamp(5 + z * 1.3, 6, 11);
  for (const tr of scene.tracks) {
    const n = upperBound(tr.T, ph, tr.n); if (!n) continue;
    const pos = headAt(tr, ph, n), x = cam.sx(pos[0]), y = cam.sy(pos[1]), dead = ph >= tr.deathT, over = ph > tr.T[tr.n - 1];
    tokens.push({ tr, x: pos[0], y: pos[1], dead });
    if (x < -30 || y < -30 || x > cam.w + 30 || y > cam.h + 30) continue;
    if (dead) { ctx.strokeStyle = 'rgba(238,115,88,.95)'; ctx.lineWidth = 2.2; const d = many ? 3 : 5; ctx.beginPath(); ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d); ctx.moveTo(x + d, y - d); ctx.lineTo(x - d, y + d); ctx.stroke(); continue; }
    if (many && S.sel !== tr.p.id) { ctx.fillStyle = tr.color; ctx.globalAlpha = over ? .35 : 1; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill(); ctx.globalAlpha = 1; continue; }
    let ang = null;                                    // heading from the last meaningful movement
    for (let b = n - 1; b > 0 && ang === null; b--) { const dx = tr.X[b * 2] - pos[0], dy = tr.X[b * 2 + 1] - pos[1]; if (dx * dx + dy * dy > .5) ang = Math.atan2(pos[1] - tr.X[b * 2 + 1], pos[0] - tr.X[b * 2]); }
    ctx.globalAlpha = over ? .45 : 1;
    if (!tr.bot && ang !== null && !over) { const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4.4), [cr, cg, cb] = hexRgb(tr.color); g.addColorStop(0, `rgba(${cr},${cg},${cb},.55)`); g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r * 4.4, ang - .5, ang + .5); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = tr.color; ctx.strokeStyle = '#0c1115'; ctx.lineWidth = 2; ctx.beginPath();
    if (tr.bot) { ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x + r * 1.15, y); ctx.lineTo(x, y + r * 1.15); ctx.lineTo(x - r * 1.15, y); ctx.closePath(); } else ctx.arc(x, y, r, 0, 7);
    ctx.fill(); ctx.stroke();
    if (S.sel === tr.p.id || S.trace === tr.p.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 7); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
}
function drawProbe() {
  const p = S.probe; if (!p) return;
  const x = cam.sx(p.x), y = cam.sy(p.y), r = p.r * cam.k;
  ctx.fillStyle = 'rgba(185,217,74,.10)'; ctx.strokeStyle = '#b9d94a'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#b9d94a'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
}
function renderMini() {
  const s = mini.width, f = s / SIZE, img = images[S.map];
  mctx.clearRect(0, 0, s, s);
  if (img && img.complete && img.naturalWidth) mctx.drawImage(img, 0, 0, s, s);
  for (const t of tokens) { mctx.fillStyle = t.dead ? '#ee7358' : t.tr.color; mctx.beginPath(); mctx.arc(t.x * f, t.y * f, t.tr.bot ? 1.6 : 2.2, 0, 7); mctx.fill(); }
  const x0 = clamp(cam.wx(0), 0, SIZE) * f, y0 = clamp(cam.wy(0), 0, SIZE) * f, x1 = clamp(cam.wx(cam.w), 0, SIZE) * f, y1 = clamp(cam.wy(cam.h), 0, SIZE) * f;
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5; mctx.fillStyle = 'rgba(255,255,255,.08)'; mctx.fillRect(x0, y0, x1 - x0, y1 - y0); mctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
}

/* timeline strip: combat ticks (top lane) over an activity histogram */
const tl = $('tl'), tlx = tl.getContext('2d');
function renderTimeline() {
  const dpr = devicePixelRatio || 1, w = tl.clientWidth, h = tl.clientHeight;
  if (tl.width !== Math.round(w * dpr) || tl.height !== Math.round(h * dpr)) { tl.width = Math.round(w * dpr); tl.height = Math.round(h * dpr); }
  tlx.setTransform(dpr, 0, 0, dpr, 0, 0); tlx.clearRect(0, 0, w, h);
  const span = tb.max - tb.min || 1, { hist, top, bins } = scene.hist;
  const bw = w / bins, base = h - 3, maxH = h - 20;
  hist.forEach((b, i) => { let y = base; for (const k of ['kill', 'death', 'storm']) { const bh = b[k] / top * maxH; if (bh) { tlx.fillStyle = KINDS[k].color; tlx.globalAlpha = .55; tlx.fillRect(i * bw + .5, y - bh, bw - 1, bh); y -= bh; } } });
  tlx.globalAlpha = 1;
  for (const m of scene.pool) { if (m.k === 'loot' || m.k === 'other') continue; tlx.fillStyle = KINDS[m.k].color; tlx.fillRect(clamp((m.t - tb.min) / span * w, 0, w - 2), 3, 2, 9); }
  tlx.fillStyle = 'rgba(185,217,74,.10)'; tlx.fillRect(0, 0, S.progress * w, h);
  tlx.fillStyle = '#b9d94a'; tlx.fillRect(S.progress * w - 1, 0, 2, h);
  tlx.beginPath(); tlx.moveTo(S.progress * w - 6, 0); tlx.lineTo(S.progress * w + 6, 0); tlx.lineTo(S.progress * w, 8); tlx.fill();
}

/* ── ui ─────────────────────────────────────────────────────────────── */
const mapLabel = (m) => m.name || m.id.replace(/([a-z])([A-Z])/g, '$1 $2');
const WHOS = [['all', 'All Players'], ['human', 'Human', 'h', HUMAN_COLORS[0]], ['bot', 'Bot', 'b', BOT_COLOR], ['player', 'Specific player']];
function renderFilters() {
  const r = dateRange(), custom = S.gran === 'custom';
  /* time period */
  const seg = $('segGran'); seg.innerHTML = '';
  GRANS.forEach(([v, l]) => { const b = el('button', '', l); b.type = 'button'; b.setAttribute('aria-pressed', S.gran === v); b.onclick = () => { if (S.gran !== v) setGran(v); }; seg.append(b); });
  const sel = $('selPeriod'); sel.hidden = custom; $('customBox').hidden = !custom;
  if (custom) { $('dFrom').value = S.cFrom; $('dTo').value = S.cTo; }
  else { sel.innerHTML = periodsFor(S.gran).map((q) => `<option value="${esc(q.key)}">${esc(q.label)}</option>`).join(''); sel.value = S.period; }
  const inR = D.dates.filter((d) => d >= r.from && d <= r.to);
  $('rangeNote').textContent = inR.length ? `${fmtSpan(inR[0], inR[inR.length - 1])} · ${inR.length} day${inR.length === 1 ? '' : 's'} with data` : 'No telemetry in this range';
  /* map */
  const ml = $('mapList'); ml.innerHTML = '';
  const rows = [{ id: 'all', title: 'All Maps', sub: `${D.maps.length} maps`, n: Object.values(scope.mapMatches).reduce((x, y) => x + y, 0), img: null },
    ...D.maps.map((m) => ({ id: m.id, title: mapNo(m.id), sub: mapLabel(m), n: scope.mapMatches[m.id] || 0, img: MAP_IMG[m.id] || m.image }))];
  rows.forEach((rw) => {
    const b = el('button', '', `${rw.img ? `<img alt="" src="${esc(rw.img)}" />` : '<span class="all"><i></i><i></i><i></i></span>'}<span class="t"><b>${esc(rw.title)}</b><small>${esc(rw.sub)}</small></span><em>${rw.n.toLocaleString()}<small>matches</small></em>`);
    b.type = 'button'; b.setAttribute('aria-pressed', S.map === rw.id); b.onclick = () => { if (S.map !== rw.id) setMap(rw.id); }; ml.append(b);
  });
  /* match */
  const mc = $('matchChip'), m = S.match === 'all' ? null : scope.visibleMatches.find((x) => x.id === S.match);
  mc.hidden = !m;
  if (m) { mc.innerHTML = `<span><b>${esc(m.matchId.slice(0, 8))}</b> · ${esc(fmtDay(m.date))} · ${m.humanCount}H ${m.botCount}B · ${fmtT(m.durationMs)}<small>${esc(m.matchId)}</small></span><button type="button" aria-label="Show all matches" title="Show all matches">×</button>`; mc.querySelector('button').onclick = () => applyFilter(() => { S.match = 'all'; }); }
  /* player */
  const sw = $('segWho'); sw.innerHTML = '';
  WHOS.forEach(([v, l, c, col]) => { const b = el('button', c || '', `${c ? '<i></i>' : ''}${l}`); b.type = 'button'; b.style.setProperty('--c', col || 'var(--accent)'); b.setAttribute('aria-pressed', S.who === v); b.onclick = () => { if (S.who !== v) applyFilter(() => { S.who = v; }); }; sw.append(b); });
  $('playerCombo').hidden = S.who !== 'player';
  const pc = $('playerChip'), po = S.who === 'player' && S.playerId ? userFirst.get(S.playerId) : null;
  pc.hidden = !po;
  if (po) { const n = scope.pool.filter((q) => String(q.userId) === S.playerId).length; pc.innerHTML = `<span><b>${esc(pLabel(po))}</b> · ${n} journey${n === 1 ? '' : 's'} in scope<small>${esc(S.playerId)}</small></span><button type="button" aria-label="Show all players" title="Show all players">×</button>`; pc.querySelector('button').onclick = () => applyFilter(() => { S.who = 'all'; S.playerId = null; }); }
}
function renderOverview() {                           // All Maps: coordinates differ per map, so show a per-map summary instead of mixing them on one canvas
  const box = $('overview'), on = scope.allMaps && scope.players.length > 0; box.hidden = !on; if (!on) return;
  const by = {}; D.maps.forEach((m) => { by[m.id] = { matches: new Set(), j: 0, kill: 0, death: 0, storm: 0, loot: 0 }; });
  for (const q of scope.players) { const o = by[q.mapId]; if (!o) continue; const c = counts(q); o.matches.add(q.matchKey); o.j++; o.kill += c.kill; o.death += c.death; o.storm += c.storm; o.loot += c.loot; }
  box.innerHTML = `<div class="ov-head"><b>All Maps</b><span>Each map has its own coordinate system, so positions are never mixed. Pick a map to see where players move and fight.</span></div><div class="ov-grid">` +
    D.maps.map((m) => { const o = by[m.id]; return `<button type="button" data-map="${esc(m.id)}"><img alt="" src="${esc(MAP_IMG[m.id] || m.image)}" /><span class="ov-t"><b>${esc(mapNo(m.id))}</b> · ${esc(mapLabel(m))}</span><span class="ov-s">` +
      [[o.matches.size, 'Matches'], [o.j, 'Journeys'], [o.kill, 'Kills'], [o.death, 'Deaths'], [o.storm, 'Storm'], [o.loot, 'Loot']].map(([v, l]) => `<span><b>${v.toLocaleString()}</b>${l}</span>`).join('') + `</span><em>Investigate →</em></button>`; }).join('') + '</div>';
  box.querySelectorAll('button[data-map]').forEach((b) => { b.onclick = () => setMap(b.dataset.map); });
}
function counts(q) {                                  // cached per-journey signal counts
  if (!q._c) { const c = { kill: 0, death: 0, storm: 0, loot: 0 }; for (const e of q.events) { const k = kindOf(e.event); if (k in c) c[k]++; } q._c = c; }
  return q._c;
}
function renderStats() {
  const m = scope.matches, dur = Math.max(0, ...m.map((x) => +x.durationMs || 0)), ev = scope.players.reduce((s, p) => s + p.events.length, 0);
  const users = new Set(scope.players.map((p) => p.userId || p.id)).size;
  const cell = (v, l, n, acc) => `<div class="stat"><b class="${acc ? 'acc' : ''}">${v}</b><span>${l}${n ? `<br>${n}` : ''}</span></div>`;
  $('stats').innerHTML = cell(m.length.toLocaleString(), 'Matches') + cell(users.toLocaleString(), 'Players', `${scope.humans} human · ${scope.bots} bot journeys`) + cell(ev.toLocaleString(), 'Events', '', true) + cell(dur ? fmtT(dur) : '—', S.match === 'all' ? 'Longest match' : 'Match length');
}
function renderControls() {
  const seg = $('segLayer'); seg.innerHTML = '';
  LAYERS.forEach(([v, l]) => { const b = el('button', '', l); b.setAttribute('aria-pressed', S.layer === v); b.onclick = () => { S.layer = v; refresh(); }; seg.append(b); });
  document.querySelectorAll('#segHeat button').forEach((b) => { b.setAttribute('aria-pressed', S.heatStyle === b.dataset.v); b.disabled = S.layer === 'off'; b.style.opacity = S.layer === 'off' ? .4 : 1; b.onclick = () => { S.heatStyle = b.dataset.v; refresh(); }; });
  const sg = $('signals'); sg.innerHTML = '';
  KIND_KEYS.forEach((k, i) => {
    const count = scope.players.reduce((s, p) => s + p.events.filter((e) => kindOf(e.event) === k).length, 0);
    const b = el('button', 'sig', `<span class="sym">${KINDS[k].sym}</span><span>${KINDS[k].label}<small>${KIND_DESC[k]} · key ${i + 1}</small></span><em>${count.toLocaleString()}</em><span class="chk">${S.ev[k] ? '✓' : ''}</span>`);
    b.style.setProperty('--c', KINDS[k].color); b.setAttribute('aria-pressed', S.ev[k]); b.onclick = () => toggleEv(k); sg.append(b);
  });
  $('density').value = S.density; $('densityOut').textContent = S.density + '%';
  $('segSpeed').innerHTML = ''; SPEEDS.forEach((v) => { const b = el('button', '', v + '×'); b.title = `${v} match-seconds per second`; b.setAttribute('aria-pressed', S.speed === v); b.onclick = () => { S.speed = v; renderControls(); }; $('segSpeed').append(b); });
  const lg = $('legend'); lg.innerHTML = `<span class="k"><i></i>Human</span><span class="k bot"><i></i>Bot</span><span class="routekey"><i class="solid"></i>Route</span><span class="routekey"><i class="dash"></i>Bot route</span><hr>`;
  KIND_KEYS.forEach((k) => { const b = el('button', '', `<i style="--c:${KINDS[k].color}">${KINDS[k].sym}</i>${KINDS[k].label.split(' ')[0]}`); b.style.setProperty('--c', KINDS[k].color); b.setAttribute('aria-pressed', S.ev[k]); b.title = `Toggle ${KINDS[k].label.toLowerCase()}`; b.onclick = () => toggleEv(k); lg.append(b); });
  [['tProbe', S.probeOn], ['tGrid', S.grid], ['tFollow', S.follow]].forEach(([id, on]) => $(id).setAttribute('aria-pressed', on));
  cv.classList.toggle('probing', S.probeOn);
}
const toggleEv = (k) => { S.ev[k] = !S.ev[k]; refresh(); };
function renderRoster() {
  const q = S.search.trim().toLowerCase();
  let list = scope.players.filter((p) => !q || pLabel(p).toLowerCase().includes(q) || String(p.userId).toLowerCase().includes(q));
  list = [...list].sort((a, b) => isBot(a) - isBot(b));   // humans first, stable within group
  if (S.reverse) list.reverse();
  const box = $('rosterList'); box.innerHTML = '';
  list.slice(0, 48).forEach((p, i) => {
    if (p._k === undefined) { p._k = p.events.filter((e) => kindOf(e.event) === 'kill').length; p._l = p.events.filter((e) => kindOf(e.event) === 'loot').length; }
    const b = el('button', `row ${isBot(p) ? 'bot' : ''} ${S.sel === p.id ? 'sel' : ''}`, `<span class="av"><span>${isBot(p) ? 'B' : String(i + 1).padStart(2, '0')}</span></span><span><strong>${pLabel(p)}</strong><small>${isBot(p) ? 'Bot' : 'Human'} · ${p.events.length} events${p._l ? ` · ${p._l} loot` : ''}</small></span><span class="n">${p._k}<small>elim</small></span>`);
    b.style.setProperty('--c', pColor(p)); b.dataset.pid = p.id; b.onclick = () => { if (S.map === 'all') { S.map = p.mapId; S.match = 'all'; S.probe = null; S.progress = 0; S.playing = false; cam.fit(); } selectPlayer(S.sel === p.id ? null : p.id); }; box.append(b);
  });
  if (!list.length) box.append(el('p', 'hint', 'No participants match these filters.'));
  $('rosterCount').textContent = list.length; $('rosterFoot').textContent = list.length > 48 ? 'Showing the first 48 · use search to find others' : 'Select a participant to isolate and trace them';
  updateLive(true);
}
let lastFeed = '';
function updateLive(force) {                          // cheap per-tick DOM: clock, roster alive state, kill feed, trace chip
  const ph = playhead();
  $('tNow').textContent = fmtT(ph); $('tMax').textContent = '/ ' + fmtT(tb.max);
  $('track').setAttribute('aria-valuenow', Math.round(S.progress * 100));
  document.querySelectorAll('#rosterList .row').forEach((r) => { const p = scope.byId.get(r.dataset.pid); r.classList.toggle('dead', !!p && ph >= deathTime(p) && S.progress > 0); });
  const lo = upperBound(scene.T, ph - FEED_SECONDS), hi = upperBound(scene.T, ph);
  const items = scene.markers.slice(lo, hi).filter((m) => COMBAT.has(m.k) && S.ev[m.k]).slice(-5).reverse();
  const key = items.map((m) => m.p.id + m.i).join('|');
  if (key !== lastFeed || force) {
    lastFeed = key; const f = $('feed'); f.innerHTML = '';
    items.forEach((m) => {
      const ev = norm(m.e.event), who = `<b class="${isBot(m.p) ? 'b' : 'h'}">${pLabel(m.p)}</b>`;
      const txt = ev === 'botkill' ? `${who} eliminated a bot` : ev === 'kill' ? `${who} eliminated a player` : ev === 'botkilled' ? `${who} was eliminated by a bot` : ev === 'killed' ? `${who} was eliminated by a player` : m.k === 'storm' ? `${who} was lost to the storm` : `${who} · ${KINDS[m.k].label}`;
      const d = el('div', '', `${txt} <span style="color:var(--dim)">${fmtT(m.t)}</span>`); d.style.setProperty('--c', KINDS[m.k].color); f.append(d);
    });
  }
  const t = $('trace'), tr = scene.tracks.find((x) => x.p.id === S.trace), selTr = S.sel && scene.tracks[0];
  if (S.trace && tr) { t.hidden = false; t.innerHTML = `<span>Tracing <b>${pLabel(tr.p)}</b></span><span><b>${tr.n}</b> positions</span><span><b>${scene.markers.length}</b> events</span><button class="ghost" id="stopTrace">Stop</button>`; $('stopTrace').onclick = () => { S.trace = null; refresh(); }; }
  else if (S.sel && selTr) { t.hidden = false; t.innerHTML = `<span>${pLabel(selTr.p)} isolated</span><button class="ghost" id="startTrace">▶ Trace journey</button>`; $('startTrace').onclick = () => { S.trace = S.sel; S.progress = 0; S.playing = true; refresh(); }; }
  else t.hidden = true;
  $('bPlay').textContent = S.playing ? '❚❚' : '▶';
}
function renderDetail() {
  const d = $('detail'), det = S.detail; if (!det) { d.hidden = true; return; }
  const p = scope.byId.get(det.pid), e = p?.events[det.i]; if (!e) { d.hidden = true; return; }
  const k = kindOf(e.event); d.hidden = false; d.style.setProperty('--c', KINDS[k].color);
  d.innerHTML = `<button class="x" aria-label="Close event detail">×</button><span class="ty">${KINDS[k].label}</span><strong>${e.event}</strong><span>${pLabel(p)} · ${fmtT(e.t)} into the match</span><span>World X ${(+e.x).toFixed(1)} · Z ${(+e.z).toFixed(1)} · elevation ${(+e.y).toFixed(1)}</span>`;
  d.querySelector('.x').onclick = () => { S.detail = null; refresh(); };
}
function renderProbe() {
  const box = $('probe'), p = S.probe;
  if (!p) { box.innerHTML = '<h2>Zone probe</h2><p class="hint">Turn on Probe, then drag a circle on the map to measure traffic, fights, deaths and loot inside it.</p>'; return; }
  const r2 = p.r * p.r, ids = new Set(), c = { kill: 0, death: 0, storm: 0, loot: 0, other: 0 }, span = tb.max - tb.min || 1, spark = new Array(24).fill(0);
  let inside = 0, total = 0;
  for (const tr of scene.tracks) for (let i = 0; i < tr.n; i++) { total++; const dx = tr.X[i * 2] - p.x, dy = tr.X[i * 2 + 1] - p.y; if (dx * dx + dy * dy <= r2) { inside++; ids.add(tr.p.id); } }
  for (const m of scene.markers) { const dx = m.x - p.x, dy = m.y - p.y; if (dx * dx + dy * dy > r2) continue; c[m.k]++; if (COMBAT.has(m.k)) spark[clamp(Math.floor((m.t - tb.min) / span * 24), 0, 23)]++; }
  const top = Math.max(1, ...spark), cell = (v, l) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`, wr = Math.round(p.r / SIZE * tf.scale);
  box.innerHTML = `<h2>Zone probe <button class="ghost icon" id="clearProbe">Clear</button></h2><span class="hint" style="margin:0">Radius ≈ ${wr} world units · ${total ? (inside / total * 100).toFixed(1) : 0}% of all position samples</span>
    <div class="stats">${cell(ids.size, 'Journeys')}${cell(c.kill, 'Kills')}${cell(c.death, 'Deaths')}${cell(c.storm, 'Storm')}${cell(c.loot, 'Loot')}${cell(inside, 'Samples')}</div>
    <div class="spark" aria-label="Combat over time in this zone">${spark.map((v) => `<i style="height:${Math.max(2, v / top * 34)}px"></i>`).join('')}</div><div class="sparkcap"><span>${fmtT(tb.min)}</span><span>combat over time</span><span>${fmtT(tb.max)}</span></div>`;
  $('clearProbe').onclick = () => { S.probe = null; refresh(); };
}

/* ── actions ────────────────────────────────────────────────────────── */
function refresh() {                                  // rebuild everything derived from state (≈ a few ms even at full scope)
  deriveScope(); buildScene();
  renderFilters(); renderOverview(); renderStats(); renderControls(); renderRoster(); renderDetail(); renderProbe();
  $('empty').hidden = scope.players.length > 0; S.dirty = true; renderTimeline(); updateLive(true);
}
function applyFilter(mutate) {                        // one path for every scope change: mutate state, reset playback/selection, rebuild
  const before = S.map; mutate();
  S.sel = S.trace = S.detail = null; S.progress = 0; S.playing = false;
  if (S.map !== before) { S.probe = null; cam.fit(); }
  refresh();
}
function setMap(id) { applyFilter(() => { S.map = id; if (id === 'all') S.match = 'all'; }); }
function setGran(g) {                                 // keep the user's place in time: the new period contains the first day of data in the old range
  applyFilter(() => {
    const r = dateRange(), anchor = D.dates.find((d) => d >= r.from && d <= r.to) || DATA_MIN;
    S.gran = g;
    if (g === 'custom') { S.cFrom = r.from < DATA_MIN ? DATA_MIN : r.from; S.cTo = r.to > DATA_MAX ? DATA_MAX : r.to; if (S.cFrom > S.cTo) { S.cFrom = DATA_MIN; S.cTo = DATA_MAX; } }
    else { const ps = periodsFor(g); S.period = (ps.find((x) => anchor >= x.from && anchor <= x.to) || ps[0]).key; }
  });
}
function setCustom(from, to) {                        // clamp to the dataset and keep from ≤ to; blank or invalid input keeps the old value
  const ok = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || ''), cl = (v) => (v < DATA_MIN ? DATA_MIN : v > DATA_MAX ? DATA_MAX : v);
  applyFilter(() => {
    let f = ok(from) ? cl(from) : S.cFrom, t = ok(to) ? cl(to) : S.cTo;
    if (f > t) { if (ok(from)) t = f; else f = t; }
    S.cFrom = f; S.cTo = t;
  });
}
function pickMatch(m) {                               // a match belongs to one map and day, so choosing one widens the other filters if needed
  applyFilter(() => {
    if (m === 'all') { S.match = 'all'; return; }
    S.map = m.mapId;
    const r = dateRange(); if (!recDates(m).some((d) => d >= r.from && d <= r.to)) { S.gran = 'day'; S.period = m.date; }
    if (!D.players.some((q) => q.matchKey === m.id && whoOk(q))) { S.who = 'all'; S.playerId = null; }
    S.match = m.id;
  });
}
const pickPlayer = (o) => applyFilter(() => { S.who = 'player'; S.playerId = o.userId; });
function selectPlayer(id, detail) {
  S.sel = id; S.detail = detail || null; if (!id) S.trace = null;
  refresh(); if (id) focusSelection();
}
function setProgress(v) { S.progress = clamp(v, 0, 1); S.dirty = true; }

/* ── input ──────────────────────────────────────────────────────────── */
const ptrs = new Map(); let drag = null, pinch = null, probing = null;
const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
const hitAt = (x, y) => { let best = null, bd = 1e9; for (const q of hits) { const d = Math.hypot(q.x - x, q.y - y); if (d <= q.r + 5 && d < bd) { best = q; bd = d; } } return best; };
cv.addEventListener('pointerdown', (e) => {
  cv.focus({ preventScroll: true }); const [x, y] = local(e); ptrs.set(e.pointerId, [x, y]); cv.setPointerCapture(e.pointerId);
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: cam.tk }; drag = null; return; }
  if (S.probeOn) { probing = true; S.probe = { x: cam.wx(x), y: cam.wy(y), r: 1 }; S.dirty = true; return; }
  drag = { x, y, moved: false };
});
cv.addEventListener('pointermove', (e) => {
  const [x, y] = local(e); S.cursor = [x, y];
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [x, y]);
  if (pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; cam.zoomAt(pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d / cam.tk, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); S.dirty = true; return; }
  if (probing && S.probe) { S.probe.r = Math.max(4, Math.hypot(cam.wx(x) - S.probe.x, cam.wy(y) - S.probe.y)); renderProbe(); S.dirty = true; }
  else if (drag) { const dx = x - drag.x, dy = y - drag.y; if (drag.moved || Math.hypot(dx, dy) > 3) { drag.moved = true; cam.pan(dx, dy); drag.x = x; drag.y = y; S.follow = false; cv.classList.add('drag'); renderControls(); } }
  hover(x, y); S.dirty = true;
});
const endPtr = (e) => {
  const [x, y] = local(e); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
  if (probing) { probing = false; if (S.probe && S.probe.r < 6) S.probe = null; renderProbe(); S.dirty = true; return; }
  if (drag && !drag.moved && e.type === 'pointerup') clickAt(x, y);
  drag = null; cv.classList.remove('drag');
};
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('pointerleave', () => { S.cursor = null; $('tip').hidden = true; S.dirty = true; });
cv.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = local(e); cam.zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, x, y); S.dirty = true; }, { passive: false });
cv.addEventListener('dblclick', (e) => { const [x, y] = local(e); cam.zoomAt(2, x, y); });
function clickAt(x, y) {
  const q = hitAt(x, y);
  if (!q) { if (S.detail) { S.detail = null; renderDetail(); S.dirty = true; } return; }
  if (q.count > 1) { cam.zoomAt(Math.max(1.75 / cam.zoom, 1.6), q.x, q.y); return; }
  selectPlayer(q.m.p.id, { pid: q.m.p.id, i: q.m.i });
}
function hover(x, y) {
  const wx = cam.wx(x), wy = cam.wy(y), tip = $('tip'), inside = wx >= 0 && wy >= 0 && wx <= SIZE && wy <= SIZE;
  if (inside) { const [X, Z] = unproject(tf, wx, wy), c = Math.min(9, Math.floor(wx / SIZE * 10)), r = Math.min(9, Math.floor(wy / SIZE * 10)); $('readout').innerHTML = `<b>${'ABCDEFGHIJ'[c]}${r + 1}</b> · X ${X.toFixed(0)} · Z ${Z.toFixed(0)}`; }
  const q = hitAt(x, y); cv.classList.toggle('hit', !!q);
  let html = '';
  if (q) html = q.count > 1 ? `${q.count} nearby ${KINDS[q.m.k].label.toLowerCase()} events · click to zoom` : `<b style="color:${KINDS[q.m.k].color}">${KINDS[q.m.k].label}</b> · ${pLabel(q.m.p)} · ${fmtT(q.m.t - 0)}`;
  else if (scene.heat && S.heatStyle === 'grid' && inside) { const n = scene.heat.cells.get(Math.min(9, Math.floor(wy / SIZE * 10)) * 10 + Math.min(9, Math.floor(wx / SIZE * 10))) || 0; html = `${n} ${S.layer === 'traffic' ? 'position records' : S.layer + ' events'} in this cell`; }
  else { const t = tokens.find((k) => Math.hypot(cam.sx(k.x) - x, cam.sy(k.y) - y) < 12); if (t) html = `${pLabel(t.tr.p)}${t.dead ? ' · eliminated' : ''}`; }
  tip.hidden = !html; if (html) { tip.innerHTML = html; tip.style.left = Math.min(x + 14, cam.w - tip.offsetWidth - 8) + 'px'; tip.style.top = Math.max(y - 34, 6) + 'px'; }
}
const miniMove = (e) => { const r = mini.getBoundingClientRect(); cam.focus(clamp((e.clientX - r.left) / r.width, 0, 1) * SIZE, clamp((e.clientY - r.top) / r.height, 0, 1) * SIZE, Math.max(cam.zoom, 1.4)); S.follow = false; renderControls(); };
mini.addEventListener('pointerdown', (e) => { mini.setPointerCapture(e.pointerId); miniMove(e); mini.onpointermove = miniMove; });
mini.addEventListener('pointerup', () => { mini.onpointermove = null; });

const trackEl = $('track'); let scrub = false;
const scrubTo = (e) => { const r = trackEl.getBoundingClientRect(); setProgress((e.clientX - r.left) / r.width); };
trackEl.addEventListener('pointerdown', (e) => { scrub = true; trackEl.setPointerCapture(e.pointerId); S.playing = false; scrubTo(e); });
trackEl.addEventListener('pointermove', (e) => { if (scrub) scrubTo(e); });
trackEl.addEventListener('pointerup', () => { scrub = false; });
const step = (d) => { S.playing = false; setProgress(S.progress + d); };
const journeyComplete = $('journeyComplete');
function showJourneyComplete() {
  S.playing = false;
  S.progress = 1;
  S.dirty = true;
  if (!journeyComplete.open) journeyComplete.showModal();
}
$('bStart').onclick = () => { S.playing = false; if (journeyComplete.open) journeyComplete.close(); setProgress(0); };
$('bEnd').onclick = showJourneyComplete;
$('btnReplayJourney').onclick = (e) => { e.preventDefault(); journeyComplete.close(); S.playing = false; setProgress(0); S.dirty = true; };

$('bBack').onclick = () => step(-.05); $('bFwd').onclick = () => step(.05);
$('bPlay').onclick = togglePlay;
function togglePlay() { if (journeyComplete.open) journeyComplete.close(); if (S.progress >= 1) S.progress = 0; S.playing = !S.playing; S.dirty = true; }
$('zIn').onclick = () => { cam.zoomAt(1.3); S.dirty = true; }; $('zOut').onclick = () => { cam.zoomAt(1 / 1.3); S.dirty = true; }; $('zReset').onclick = () => { cam.fit(); S.follow = false; renderControls(); };
$('tProbe').onclick = () => { S.probeOn = !S.probeOn; renderControls(); };
$('tGrid').onclick = () => { S.grid = !S.grid; renderControls(); S.dirty = true; };
$('tFollow').onclick = () => { S.follow = !S.follow; if (S.follow && !S.sel) { const t = tokens[0]; if (t) selectPlayer(t.tr.p.id); } renderControls(); };
$('selPeriod').onchange = (e) => applyFilter(() => { S.period = e.target.value; });
$('dFrom').onchange = (e) => setCustom(e.target.value, null); $('dTo').onchange = (e) => setCustom(null, e.target.value);

/* searchable pick-list used by the Match and Player filters (type to filter, ↑ ↓ Enter, Esc) */
function makeCombo(inputId, listId, getItems, pick) {
  const inp = $(inputId), box = $(listId); let items = [], act = -1;
  const close = () => { box.hidden = true; inp.setAttribute('aria-expanded', 'false'); act = -1; };
  const draw = () => {
    box.innerHTML = '';
    if (!items.length) { box.append(el('div', 'opt none', 'No matches for this search')); return; }
    items.forEach((it, i) => {
      if (it.note) { box.append(el('div', 'opt note', esc(it.label))); return; }
      const d = el('div', `opt${it.on ? ' on' : ''}${it.muted ? ' muted' : ''}${i === act ? ' act' : ''}`, `<span>${esc(it.label)}</span><small>${esc(it.sub || '')}</small>`);
      d.setAttribute('role', 'option'); d.setAttribute('aria-selected', !!it.on); if (it.title) d.title = it.title;
      d.onmousedown = (e) => e.preventDefault(); d.onclick = () => choose(it); box.append(d);
    });
    const a = box.querySelector('.act'); if (a) a.scrollIntoView({ block: 'nearest' });
  };
  const open = () => { items = getItems(inp.value); draw(); box.hidden = false; inp.setAttribute('aria-expanded', 'true'); };
  const choose = (it) => { inp.value = ''; close(); inp.blur(); pick(it.value); };
  const pickable = () => items.map((it, i) => (it.note ? -1 : i)).filter((i) => i >= 0);
  inp.addEventListener('focus', open);
  inp.addEventListener('input', () => { act = -1; open(); });
  inp.addEventListener('keydown', (e) => {
    const ix = pickable();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (box.hidden) open(); if (!ix.length) return; const at = ix.indexOf(act); act = ix[(at + (e.key === 'ArrowDown' ? 1 : -1) + ix.length) % ix.length]; draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); const i = act >= 0 ? act : (inp.value.trim() && ix.length ? ix[0] : -1); if (i >= 0) choose(items[i]); }
    else if (e.key === 'Escape') { inp.value = ''; close(); inp.blur(); }
  });
  document.addEventListener('pointerdown', (e) => { if (!box.hidden && !box.parentElement.contains(e.target)) close(); });
}
const normId = (v) => String(v || '').trim().toLowerCase().replace(/\.nakama-0$/, '').split('|').pop();   // accepts a bare ID, a "map|id" key or a pasted file suffix
const LIST_CAP = 60, capNote = (n) => (n > LIST_CAP ? [{ note: true, label: `Showing ${LIST_CAP} of ${n.toLocaleString()} · type to narrow` }] : []);
makeCombo('matchQ', 'matchOpts', (raw) => {
  const q = normId(raw), inScope = new Set(scope.visibleMatches.map((m) => m.id));
  const mk = (m) => ({ value: m, label: `${m.matchId.slice(0, 8)} · ${fmtDay(m.date)} · ${m.humanCount}H ${m.botCount}B · ${fmtT(m.durationMs)}`, sub: `${mapNo(m.mapId)} · ${mapLabel(mapById(m.mapId))}${inScope.has(m.id) ? '' : ' · outside current filters'}`, title: m.matchId, on: S.match === m.id, muted: !inScope.has(m.id) });
  if (!q) return [{ value: 'all', label: `All Matches (${scope.visibleMatches.length.toLocaleString()})`, sub: 'Every match in the current filters', on: S.match === 'all' }, ...scope.visibleMatches.slice(0, LIST_CAP).map(mk), ...capNote(scope.visibleMatches.length)];
  const hit = D.matches.filter((m) => m.matchId.toLowerCase().includes(q)).sort((a, b) => inScope.has(b.id) - inScope.has(a.id));
  return [...hit.slice(0, LIST_CAP).map(mk), ...capNote(hit.length)];
}, pickMatch);
makeCombo('playerQ', 'playerOpts', (raw) => {
  const q = String(raw || '').trim().toLowerCase();
  const list = scope.playerOpts.filter((o) => !q || o.userId.toLowerCase().includes(q) || pLabel(o.p).toLowerCase().includes(q));
  return [...list.slice(0, LIST_CAP).map((o) => ({ value: o, label: pLabel(o.p), sub: `${o.bot ? 'Bot' : 'Human'} · ${o.n} journey${o.n === 1 ? '' : 's'}`, title: o.userId, on: S.playerId === o.userId })), ...capNote(list.length)];
}, pickPlayer);
$('density').oninput = (e) => { S.density = +e.target.value; $('densityOut').textContent = S.density + '%'; buildPool(); renderTimeline(); S.dirty = true; };
$('search').oninput = (e) => { S.search = e.target.value; renderRoster(); };
$('btnReverse').onclick = () => { S.reverse = !S.reverse; renderRoster(); };
const resetAll = () => { Object.assign(S, { map: DEFAULT_MAP, gran: 'year', period: DEFAULT_YEAR, cFrom: DATA_MIN, cTo: DATA_MAX, match: 'all', who: 'all', playerId: null, ev: { kill: true, death: true, storm: true, loot: true, other: true }, layer: 'off', density: 72, sel: null, trace: null, detail: null, probe: null, search: '', progress: 0, playing: false, follow: false }); $('search').value = ''; $('matchQ').value = ''; $('playerQ').value = ''; cam.fit(); refresh(); };
$('btnReset').onclick = resetAll; $('btnClear').onclick = resetAll;
$('btnHelp').onclick = () => $('guide').showModal();
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key, ok = (fn) => { e.preventDefault(); fn(); S.dirty = true; };
  if (k === ' ') ok(togglePlay); else if (k === 'ArrowRight' && e.target !== cv) ok(() => step(.02)); else if (k === 'ArrowLeft' && e.target !== cv) ok(() => step(-.02));
  else if (k === 'Home') ok(() => { S.playing = false; setProgress(0); }); else if (k === 'End') ok(showJourneyComplete);
  else if (k === '+' || k === '=') ok(() => cam.zoomAt(1.25)); else if (k === '-') ok(() => cam.zoomAt(.8)); else if (k === '0') ok(() => { cam.fit(); });
  else if (k === 'ArrowLeft') ok(() => cam.pan(40, 0)); else if (k === 'ArrowRight') ok(() => cam.pan(-40, 0)); else if (k === 'ArrowUp') ok(() => cam.pan(0, 40)); else if (k === 'ArrowDown') ok(() => cam.pan(0, -40));
  else if (k === 'h' || k === 'H') ok(() => { S.layer = LAYERS[(LAYERS.findIndex((l) => l[0] === S.layer) + 1) % LAYERS.length][0]; refresh(); });
  else if (k === 'p' || k === 'P') ok(() => { S.probeOn = !S.probeOn; renderControls(); }); else if (k === 'g' || k === 'G') ok(() => { S.grid = !S.grid; renderControls(); });
  else if (k === 'f' || k === 'F') ok(() => $('tFollow').click()); else if (k >= '1' && k <= '5') ok(() => toggleEv(KIND_KEYS[+k - 1]));
  else if (k === 'Escape') ok(() => { S.probe = null; S.probeOn = false; S.detail = null; if (S.sel) selectPlayer(null); else refresh(); });
});

/* ── loop ───────────────────────────────────────────────────────────── */
let last = performance.now(), uiAcc = 0;
function frame(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (S.playing) {
    const span = tb.max - tb.min;
    if (span <= 0) S.playing = false; else { S.progress += (S.speed * dt) / span; if (S.progress >= 1) { S.progress = 1; S.playing = false; showJourneyComplete(); } S.dirty = true; }
    uiAcc += dt; if (uiAcc > .12 || !S.playing) { uiAcc = 0; updateLive(); }
  }
  if (S.follow && S.sel && !drag) { const t = tokens.find((x) => x.tr.p.id === S.sel); if (t) { cam.tx = cam.w / 2 - t.x * cam.tk; cam.ty = cam.h / 2 - t.y * cam.tk; } }
  if (cam.step(dt)) S.dirty = true;
  if (S.dirty) { S.dirty = false; render(); renderMini(); renderTimeline(); $('zoomLbl').textContent = Math.round(cam.zoom * 100) + '%'; if (!S.playing) updateLive(); }
  requestAnimationFrame(frame);
}
new ResizeObserver(() => {
  const r = $('stage').getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  cam.dpr = dpr; cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); cam.resize(r.width, r.height);
}).observe($('stage'));
if (!D || !D.players?.length) { $('empty').hidden = false; $('empty').querySelector('b').textContent = 'Could not read data/analysis.js'; }
else {
  refresh();
  requestAnimationFrame(frame);
  // Show the onboarding guide automatically for first-time visitors only.
  let guideSeen = false;
  try { guideSeen = window.localStorage.getItem('lilaBlackGuideSeen') === '1'; } catch (_) {}
  if (!guideSeen) {
    window.setTimeout(() => {
      const guide = $('guide');
      if (guide && !guide.open) guide.showModal();
      try { window.localStorage.setItem('lilaBlackGuideSeen', '1'); } catch (_) {}
    }, 250);
  }
}
})();
