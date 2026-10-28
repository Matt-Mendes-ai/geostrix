// TASKS.csv #844 — planning a soil grid or a stream-sediment program before the crew leaves (Matt: field crews and
// project geologists both use it; QC inserts are "variable, numerous, let user decide"). From docs/ideas/
// soils-stream-sediments.md 1.1-1.4. Pure: the panel (SurveyPlannerPanel.jsx) draws and exports what this returns.
//
// Soil grid: lines at `azimuth` (the direction the lines run, degrees from grid north, usually across the expected
// strike), `lineSpacing` apart, stations every `stationSpacing` along them, clipped to the area polygon. A target
// should be crossed by at least two or three stations, so station spacing follows the expected anomaly width (Rose,
// Hawkes & Webb 1979). Names: line = signed distance across the lines from the origin, station = distance along
// ("L+200 S+350", metres) - a grid a crew can stake from the origin and the azimuth.
// Stream sites: on the routed terrain (hydrology.js), the last channel cell of each stream link just above its
// confluence (so the site samples that link only), for the chosen Strahler orders and catchment-area range.
// Numbering: prefix + running number; a QC slot (standard / blank / field duplicate / custom) after every N samples,
// each type on its own rate - the numbers are reserved in the stream, so the inserts are actually inserted.
import { pointInRings } from "./mapLayers.js";
import { gridGeometry, strahler, downstreamOf } from "./hydrology.js";

const rad = (d) => (d * Math.PI) / 180;

// polygon: [[x, y], ...] (project CRS). -> { stations: [{ line, station, name, x, y }], lines: [[[x,y],[x,y]], ...], lineKm }
// TASKS.csv #1046 (review #1016) — serpentine (default): every other line (counting the lines that have stations) runs
// the other way, so the numbering follows a crew walking up one line and down the next. Every line ran the same way:
// sample n at the north end of L+0, sample n+1 500 m away at the south end of L+100.
export function soilGrid(polygon, { azimuth = 0, lineSpacing = 100, stationSpacing = 25, stagger = false, serpentine = true, origin = null, maxStations = 50000 } = {}) {
  const ring = polygon, xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const o = origin || [Math.min(...xs), Math.min(...ys)];
  const ux = Math.sin(rad(azimuth)), uy = Math.cos(rad(azimuth)); // along the lines
  const vx = uy, vy = -ux; // across (90° clockwise)
  const toLocal = ([x, y]) => [(x - o[0]) * vx + (y - o[1]) * vy, (x - o[0]) * ux + (y - o[1]) * uy]; // [across, along]
  const toWorld = (a, s) => [o[0] + a * vx + s * ux, o[1] + a * vy + s * uy];
  const loc = ring.map(toLocal), as = loc.map((p) => p[0]);
  const a0 = Math.ceil(Math.min(...as) / lineSpacing) * lineSpacing, a1 = Math.max(...as);
  const stations = [], lines = [];
  let lineM = 0, walked = 0;
  for (let a = a0, li = Math.round(a0 / lineSpacing); a <= a1 + 1e-9; a += lineSpacing, li++) {
    // where this line crosses the polygon (in local coordinates), as along-line intervals
    const cuts = [];
    for (let i = 0, j = loc.length - 1; i < loc.length; j = i++) {
      const [ai, si] = loc[i], [aj, sj] = loc[j];
      if ((ai > a) !== (aj > a)) cuts.push(si + ((a - ai) / (aj - ai)) * (sj - si));
    }
    cuts.sort((p, q) => p - q);
    const off = stagger && li % 2 ? stationSpacing / 2 : 0;
    const onLine = []; // this line's stations, in along order
    for (let k = 0; k + 1 < cuts.length; k += 2) {
      const sA = cuts[k], sB = cuts[k + 1];
      lines.push([toWorld(a, sA), toWorld(a, sB)]);
      lineM += sB - sA;
      for (let s = Math.ceil((sA - off) / stationSpacing) * stationSpacing + off; s <= sB + 1e-9; s += stationSpacing) {
        const [x, y] = toWorld(a, s);
        onLine.push({ line: Math.round(a), station: Math.round(s), name: `L${a >= 0 ? "+" : ""}${Math.round(a)} S${s >= 0 ? "+" : ""}${Math.round(s)}`, x, y });
        if (stations.length + onLine.length > maxStations) { stations.push(...onLine); return { stations, lines, lineKm: lineM / 1000, truncated: true, origin: o }; }
      }
    }
    if (onLine.length) { if (serpentine && walked % 2) onLine.reverse(); stations.push(...onLine); walked++; } // #1046
  }
  return { stations, lines, lineKm: lineM / 1000, truncated: false, origin: o };
}

// Stream sites above confluences. route: hydrology routeTerrain(); polygon optional ([[x,y]...]).
// -> [{ x, y, order, areaKm2, cell }]
export function streamSites(route, terrain, { minAreaKm2 = 0.5, maxAreaKm2 = 50, orders = [1, 2], polygon = null, streamKm2 = null } = {}) {
  const g = gridGeometry(terrain), cellKm2 = (g.dx * g.dy) / 1e6;
  const minCells = Math.max(2, Math.round((streamKm2 ?? Math.min(minAreaKm2, 0.5)) / cellKm2));
  const so = strahler(route.dir, route.acc, route.order, g.w, minCells);
  const want = new Set(orders), out = [];
  for (let i = 0; i < so.length; i++) {
    if (!so[i] || !want.has(so[i])) continue;
    const d = downstreamOf(i, route.dir, g.w);
    // a tributary just above its confluence: the order goes up below it (two equal streams meet), or a larger stream
    // flows into the same cell (it joins the main stem). The main stem passing a small side stream is not a site.
    if (d < 0 || !so[d]) continue;
    if (!(so[d] > so[i] || largestOtherInflow(d, i, route, so, g.w) > route.acc[i])) continue;
    const area = route.acc[i] * cellKm2;
    if (area < minAreaKm2 || area > maxAreaKm2) continue;
    const [x, y] = g.toXY(i);
    if (polygon && !pointInRings([x, y], [polygon])) continue;
    out.push({ x, y, order: so[i], areaKm2: area, cell: i });
  }
  return out;
}
// the largest accumulation of another stream cell (not `from`) flowing into d (0 when none)
function largestOtherInflow(d, from, route, so, w) {
  const h = so.length / w, dx = d % w, dy = (d / w) | 0;
  let best = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    if (!ox && !oy) continue;
    const x = dx + ox, y = dy + oy;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const j = y * w + x;
    if (j !== from && so[j] && downstreamOf(j, route.dir, w) === d && route.acc[j] > best) best = route.acc[j];
  }
  return best;
}

// Sample numbers with QC slots. sites: [{ name?, x, y, ... }]; qc: [{ kind: "standard"|"blank"|"duplicate"|other, every, label }]
// -> [{ sample_id, kind, site (index or null), parent (sample_id of the original, duplicates) }]
export function numberSamples(sites, { prefix = "", start = 1, digits = 5, qc = [] } = {}) {
  const out = [];
  let n = start, sampleCount = 0;
  const id = () => `${prefix}${String(n++).padStart(digits, "0")}`;
  const active = qc.filter((q) => q.every >= 2);
  sites.forEach((_, si) => {
    const sid = id();
    out.push({ sample_id: sid, kind: "sample", site: si, parent: null });
    sampleCount++;
    for (const q of active) {
      if (sampleCount % q.every !== 0) continue;
      out.push({ sample_id: id(), kind: q.kind, label: q.label || q.kind, site: q.kind === "duplicate" ? si : null, parent: q.kind === "duplicate" ? sid : null });
    }
  });
  return out;
}

// ---------- exports ----------
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
// TASKS.csv #1018 — Matt: "for soil lines exported to kml, I want lines exported not pins". A soil grid's traverse lines,
// each a run of stations in station order, split where a line leaves and re-enters a concave area (a gap of more than
// 1.5 x the line's usual station spacing). Stream sites have no line: none.
export function soilLines(sites) {
  const by = new Map();
  sites.forEach((s) => { if (s && s.line != null && Number.isFinite(s.station) && Number.isFinite(s.x) && Number.isFinite(s.y)) (by.get(s.line) || by.set(s.line, []).get(s.line)).push(s); });
  const out = [];
  for (const [line, list] of [...by.entries()].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => a.station - b.station);
    const gaps = list.slice(1).map((s, i) => s.station - list[i].station).sort((a, b) => a - b);
    const usual = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
    let run = [list[0]], part = 0;
    const flush = () => { if (run.length >= 2) out.push({ line, part: part++, name: `Line ${line >= 0 ? "+" : ""}${line}`, stations: run }); };
    for (let i = 1; i < list.length; i++) {
      if (usual > 0 && list[i].station - list[i - 1].station > 1.5 * usual) { flush(); run = []; }
      run.push(list[i]);
    }
    flush();
  }
  // a line split in two keeps its name with a part letter
  const count = new Map(); out.forEach((l) => count.set(l.line, (count.get(l.line) || 0) + 1));
  out.forEach((l) => { if (count.get(l.line) > 1) l.name += ` (${String.fromCharCode(97 + l.part)})`; });
  return out;
}

export function planGpx(rows, sites, toLonLat, name) {
  const w = rows.filter((r) => r.site != null && r.kind === "sample").map((r) => { const s = sites[r.site]; const [lon, lat] = toLonLat(s.x, s.y); return `  <wpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><name>${esc(r.sample_id)}</name>${s.name ? `<desc>${esc(s.name)}</desc>` : ""}</wpt>`; });
  // #1018 — a soil grid's lines as tracks (to walk), beside the stations as waypoints (to find)
  const trk = soilLines(sites).map((l) => `  <trk><name>${esc(l.name)}</name><trkseg>${l.stations.map((s) => { const [lon, lat] = toLonLat(s.x, s.y); return `<trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"/>`; }).join("")}</trkseg></trk>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="GeoStrix" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${esc(name)}</name></metadata>\n${[...w, ...trk].join("\n")}\n</gpx>\n`;
}
export function planKml(rows, sites, toLonLat, name) {
  const p = rows.filter((r) => r.site != null && r.kind === "sample").map((r) => { const s = sites[r.site]; const [lon, lat] = toLonLat(s.x, s.y); return `      <Placemark><name>${esc(r.sample_id)}</name>${s.name ? `<description>${esc(s.name)}</description>` : ""}<Point><coordinates>${lon.toFixed(6)},${lat.toFixed(6)},0</coordinates></Point></Placemark>`; });
  const lines = soilLines(sites);
  if (!lines.length) return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>${esc(name)}</name>\n${p.map((x) => x.slice(2)).join("\n")}\n  </Document>\n</kml>\n`;
  // #1018 — a soil grid: the lines as LineStrings (shown), the sample stations in a folder that starts hidden, so Google
  // Earth or a phone shows the lines to walk, not a field of pins; the numbered stations are one tick away
  const ls = lines.map((l) => `      <Placemark><name>${esc(l.name)}</name><description>${esc(`${l.stations.length} stations, ${l.stations[0].name} to ${l.stations[l.stations.length - 1].name}`)}</description><styleUrl>#soilLine</styleUrl><LineString><tessellate>1</tessellate><coordinates>${l.stations.map((s) => { const [lon, lat] = toLonLat(s.x, s.y); return `${lon.toFixed(6)},${lat.toFixed(6)},0`; }).join(" ")}</coordinates></LineString></Placemark>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>${esc(name)}</name>\n    <Style id="soilLine"><LineStyle><color>ff2f6bd8</color><width>3</width></LineStyle></Style>\n    <Folder><name>Soil lines</name>\n${ls.join("\n")}\n    </Folder>\n    <Folder><name>Sample stations</name><visibility>0</visibility>\n${p.map((x) => x.replace("<Placemark>", "<Placemark><visibility>0</visibility>")).join("\n")}\n    </Folder>\n  </Document>\n</kml>\n`;
}
export function planCsvRows(rows, sites, toLonLat) {
  return rows.map((r) => {
    const s = r.site != null ? sites[r.site] : null;
    const ll = s ? toLonLat(s.x, s.y) : null;
    return { sample_id: r.sample_id, type: r.kind === "sample" ? "sample" : r.label || r.kind, site: s?.name || "", x: s ? s.x.toFixed(1) : "", y: s ? s.y.toFixed(1) : "", lon: ll ? ll[0].toFixed(6) : "", lat: ll ? ll[1].toFixed(6) : "", parent: r.parent || "", collected: "", notes: "" };
  });
}
// A printable field sheet: one table per line (soil grids) or one list (stream sites), with blank columns to fill in
export function planFieldSheet(rows, sites, { title, crs, groupBy = (s) => (s?.line != null ? `Line ${s.line >= 0 ? "+" : ""}${s.line}` : "Sites") } = {}) {
  const groups = new Map();
  rows.forEach((r) => {
    const s = r.site != null ? sites[r.site] : null;
    const k = s ? groupBy(s) : groups.size ? [...groups.keys()].pop() : "Sites"; // a QC insert stays with the line it follows
    (groups.get(k) || groups.set(k, []).get(k)).push({ r, s });
  });
  const tbl = [...groups.entries()].map(([k, list]) => `<section><h2>${esc(k)}</h2><table><thead><tr><th>Sample</th><th>Type</th><th>Site</th><th>Easting</th><th>Northing</th><th>Horizon</th><th>Colour</th><th>Notes</th><th>✓</th></tr></thead><tbody>${list.map(({ r, s }) => `<tr${r.kind !== "sample" ? ' class="qc"' : ""}><td>${esc(r.sample_id)}</td><td>${esc(r.kind === "sample" ? "" : r.label || r.kind)}${r.parent ? ` of ${esc(r.parent)}` : ""}</td><td>${esc(s?.name || "")}</td><td>${s ? s.x.toFixed(0) : ""}</td><td>${s ? s.y.toFixed(0) : ""}</td><td></td><td></td><td></td><td></td></tr>`).join("")}</tbody></table></section>`).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:system-ui,sans-serif;font-size:11px;margin:12mm}h1{font-size:16px}h2{font-size:13px;margin:10px 0 4px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:3px 5px;text-align:left}tr.qc td{background:#f1f1f1;font-weight:600}section{page-break-after:always}section:last-child{page-break-after:auto}</style></head><body><h1>${esc(title)}</h1><p>${esc(crs || "")} · ${rows.length} numbers (${rows.filter((r) => r.kind === "sample").length} samples, ${rows.filter((r) => r.kind !== "sample").length} QC)</p>\n${tbl}\n</body></html>\n`;
}
