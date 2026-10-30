// TASKS.csv #845 — stream-sediment sites on the routed terrain (hydrology.js): catchments, Hawkes productivity, the
// drainage ranking and the follow-up reaches, for ONE sample type at a time (active sediment, moss mat, heavy-mineral
// concentrate, BLEG and water are different measurements and are never ranked together - Fletcher & Day 1989 on how
// hydraulic sorting makes gold in sediments depend on site and fraction; Matysek & Day 1988 on moss mats).
import { gridGeometry, snapSite, subcatchments, siteTree, hawkes, reachUpstream, strahler, streamPolylines } from "./hydrology.js";
import { valueIn } from "./geochem.js";
import { quantileSorted } from "./thresholds.js";
import { pointInRings } from "./mapLayers.js";

export const STREAM_MEDIA = ["stream sediment", "moss mat", "heavy mineral concentrate", "BLEG", "stream water"];
export const DEFAULT_CATCHMENT_OPTS = { medium: "stream sediment", symbol: null, snapM: 60, minAreaKm2: 0.5, background: "median", backgroundValue: null, anomalyFrom: "saved", percentile: 90, lithoLayer: null, lithoField: null };

// samples: the project's surface samples; route: hydrology routeTerrain result; terrain; opts; ctx { units, thresholds, mapLayers }
export function analyseCatchments(samples, route, terrain, opts, { units = {}, thresholds = [], mapLayers = [] } = {}) {
  const o = { ...DEFAULT_CATCHMENT_OPTS, ...opts };
  const g = gridGeometry(terrain), cellKm2 = (g.dx * g.dy) / 1e6;
  const minCells = Math.max(2, Math.round(o.minAreaKm2 / cellKm2));
  const unit = units[o.symbol] || "ppm";
  const notes = [];
  const sites = samples.map((s, i) => ({ s, i })).filter(({ s }) => (s.medium || "") === o.medium);
  const placed = sites.map(({ s }) => snapSite(s.x, s.y, route.acc, g, o.snapM));
  const cells = placed.map((p) => (p ? p.cell : -1));
  const outside = placed.filter((p) => !p).length;
  if (outside) notes.push({ text: "{n} site(s) lie outside the terrain and have no catchment.", params: { n: outside } });
  const seen = new Map(); let shared = 0;
  cells.forEach((c, k) => { if (c < 0) return; if (seen.has(c)) { shared++; cells[k] = -1; } else seen.set(c, k); });
  if (shared) notes.push({ text: "{n} site(s) snapped to the same channel cell as another site and were left out (duplicates or sites closer than one cell).", params: { n: shared } });
  const label = subcatchments(route.dir, route.order, g.w, cells);
  const tree = siteTree(route.dir, g.w, cells, label);
  // values, background and the anomaly threshold (this sample type's population)
  const values = sites.map(({ s }) => valueIn(s, o.symbol, unit, units));
  const pos = values.filter((v) => v > 0).sort((a, b) => a - b);
  const background = o.background === "value" && o.backgroundValue > 0 ? o.backgroundValue : pos.length ? quantileSorted(pos, 0.5) : null;
  const saved = thresholds.find((t) => t.symbol === o.symbol);
  let threshold = null, thresholdLabel = "";
  if (o.anomalyFrom === "saved" && saved) {
    threshold = saved.values?.[o.medium] ?? saved.values?.All ?? null;
    thresholdLabel = threshold != null ? `${saved.methodLabel} (${saved.decided})` : "";
    if (threshold == null) notes.push({ text: "The saved {sym} threshold has no value for {medium}: the {p}th percentile is used.", params: { sym: o.symbol, medium: o.medium, p: o.percentile } });
  }
  if (threshold == null && pos.length) { threshold = quantileSorted(pos, o.percentile / 100); thresholdLabel = `${o.percentile}th percentile of ${o.medium}`; }
  const so = strahler(route.dir, route.acc, route.order, g.w, minCells);
  // lithology mix per sub-catchment, then summed up the tree
  let mix = null;
  const layer = o.lithoLayer ? mapLayers.find((l) => String(l.id) === String(o.lithoLayer)) : null;
  if (layer && o.lithoField) {
    const feats = layer.features.map((f) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; f.parts.forEach((r) => r.forEach(([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; })); return { f, b: [x0, y0, x1, y1], v: String(f.attributes?.[o.lithoField] ?? "") }; });
    const own = sites.map(() => new Map());
    for (let k = 0; k < label.length; k++) {
      const s = label[k];
      if (s < 0) continue;
      const [x, y] = g.toXY(k);
      let v = "(outside the map)";
      for (const { f, b, v: fv } of feats) if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && pointInRings([x, y], f.parts)) { v = fv || "(blank)"; break; }
      own[s].set(v, (own[s].get(v) || 0) + 1);
    }
    mix = own.map((m) => new Map(m));
    const indeg = new Int32Array(sites.length); tree.down.forEach((d) => { if (d >= 0) indeg[d]++; });
    const q = []; for (let s = 0; s < sites.length; s++) if (indeg[s] === 0) q.push(s);
    for (let k = 0; k < q.length; k++) { const s = q[k], d = tree.down[s]; if (d >= 0) { mix[s].forEach((c, v) => mix[d].set(v, (mix[d].get(v) || 0) + c)); if (--indeg[d] === 0) q.push(d); } }
  }
  const results = sites.map(({ s, i }, k) => {
    const c = cells[k], v = values[k];
    if (c < 0) return { k, sampleIndex: i, sample_id: s.sample_id, x: s.x, y: s.y, value: v, placed: false };
    const areaKm2 = tree.total[k] * cellKm2;
    const lith = mix ? [...mix[k].entries()].sort((a, b) => b[1] - a[1]).map(([u, n]) => ({ unit: u, pct: (100 * n) / Math.max(1, tree.total[k]) })) : null;
    return {
      k, sampleIndex: i, sample_id: s.sample_id, x: s.x, y: s.y, value: v, placed: true, cell: c, moved: placed[k].moved,
      areaKm2, ownKm2: tree.own[k] * cellKm2, order: so[c], down: tree.down[k], upstream: tree.kids[k],
      productivity: hawkes(v, background, areaKm2), anomalous: threshold != null && v != null && v >= threshold, lith,
    };
  });
  // follow-up: an anomalous site none of whose upstream sites is anomalous -> walk the channel above it
  const isSiteCell = (cell) => seen.has(cell);
  results.forEach((r) => {
    if (!r.placed || !r.anomalous) return;
    const upAnom = (r.upstream || []).some((u) => results[u]?.anomalous);
    r.followUp = !upAnom;
    if (r.followUp) {
      const path = reachUpstream(r.cell, route.dir, route.acc, g.w, g.h, minCells, (cc) => cc !== r.cell && isSiteCell(cc));
      r.reach = path.map((cc) => g.toXY(cc));
      r.reachM = r.reach.reduce((a, p, j) => (j ? a + Math.hypot(p[0] - r.reach[j - 1][0], p[1] - r.reach[j - 1][1]) : 0), 0);
    }
  });
  const ranked = results.filter((r) => r.placed && r.productivity != null).sort((a, b) => b.productivity - a.productivity);
  ranked.forEach((r, j) => { r.rank = j + 1; });
  return { results, ranked, background, threshold, thresholdLabel, unit, minCells, cellKm2, label, so, notes, g, filledCells: route.filledCells };
}

// RGBA image of the sub-catchments (each coloured by its site's class: anomalous / above background / background),
// with the catchment boundaries darker; transparent elsewhere. -> { width, height, data }
export function catchmentImage(a) {
  const { g, label, results } = a, w = g.w, h = g.h, data = new Uint8ClampedArray(w * h * 4);
  const colour = results.map((r) => (!r.placed ? null : r.anomalous ? [215, 48, 31] : r.value != null && a.background != null && r.value > a.background ? [253, 174, 97] : [171, 217, 233]));
  for (let k = 0; k < label.length; k++) {
    const s = label[k];
    if (s < 0 || !colour[s]) continue;
    const x = k % w, y = (k / w) | 0;
    const edge = (x > 0 && label[k - 1] !== s) || (x < w - 1 && label[k + 1] !== s) || (y > 0 && label[k - w] !== s) || (y < h - 1 && label[k + w] !== s);
    const [r, gg, b] = colour[s];
    data.set(edge ? [Math.round(r * 0.45), Math.round(gg * 0.45), Math.round(b * 0.45), 230] : [r, gg, b, 120], k * 4);
  }
  return { width: w, height: h, data };
}

// The stream network as polylines (Strahler order kept), for display as map lines
export function streamNetwork(route, terrain, minCells) {
  const g = gridGeometry(terrain);
  const so = strahler(route.dir, route.acc, route.order, g.w, minCells);
  return streamPolylines(route.dir, route.acc, so, g.w, g.h, minCells, g.toXY);
}

// GPX of the follow-up reaches (tracks) and the anomalous sites (waypoints), coordinates converted by toLonLat(x, y)
export function followUpGpx(a, toLonLat, name = "Follow-up reaches") {
  const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const pt = (x, y) => { const [lon, lat] = toLonLat(x, y); return `lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"`; };
  const wpts = a.results.filter((r) => r.placed && r.anomalous).map((r) => `  <wpt ${pt(r.x, r.y)}><name>${esc(r.sample_id || `site ${r.k + 1}`)}</name><desc>${esc(`${r.value} ${a.unit}; catchment ${r.areaKm2.toFixed(2)} km2${r.rank ? `; rank ${r.rank}` : ""}`)}</desc></wpt>`);
  const trks = a.results.filter((r) => r.reach?.length > 1).map((r) => `  <trk><name>${esc(`Reach above ${r.sample_id || `site ${r.k + 1}`}`)}</name><trkseg>${r.reach.map(([x, y]) => `<trkpt ${pt(x, y)}/>`).join("")}</trkseg></trk>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="GeoStrix" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${esc(name)}</name></metadata>\n${[...wpts, ...trks].join("\n")}\n</gpx>\n`;
}

// TASKS.csv #1017 — the three GeoTIFF bands of a catchment analysis (was inline in CatchmentsPanel.jsx), one value per
// terrain node: band 1 class (1 background, 2 above background, 3 anomalous), band 2 the site's rank, band 3 its
// productivity; NaN (written as no data) outside every placed sample's catchment. a: analyseCatchments; n: node count
export function catchmentBands(a, n) {
  const cls = new Float32Array(n).fill(NaN), rank = new Float32Array(n).fill(NaN), prod = new Float32Array(n).fill(NaN);
  for (let k = 0; k < n; k++) {
    const s = a.label[k];
    if (s < 0) continue;
    const r = a.results[s];
    if (!r?.placed) continue;
    cls[k] = r.anomalous ? 3 : r.value != null && a.background != null && r.value > a.background ? 2 : 1;
    if (r.rank) rank[k] = r.rank;
    if (r.productivity != null) prod[k] = r.productivity;
  }
  return { cls, rank, prod };
}
