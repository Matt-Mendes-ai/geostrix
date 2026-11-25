// TASKS.csv #4058 — Maxwell (EMIT) ground TEM files, the .tem a SMARTem24 / DigiAtlantis survey is processed to: a "TEM File Created by MAXWELL"
// header of KEY:VALUE words (CONFIG:INLOOP | SLINGRAM, LINE:, BFIELD:, a LOOP: block ...), "/TIMES(ms)=" gate times, one column-header line (EAST NORTH
// LEVEL ELEV STATION COMPONENT UNITS ... CH1 ... CHn) and ONE ROW PER COMPONENT: a station's Z, X and Y rows repeat its EAST / NORTH / STATION.
// A multi-line file puts "LINE:<n>" separator rows before each line's block (and a "/"-commented copy of the header mid-file). "*" is a missing gate.
// TASKS.csv #4063 — the same text family in its other layouts, read by the one parser below:
//   - Crone 'SURFACE PEM SURVEY' (STN C VPRI CH1 ... ; the loop's corners LV1X / LV1Y ... in the header, no gate times: they are in a CHANNELFILE),
//   - SMARTem V / Atlantis receiver files (STN LOOP RDNG ADC C NADC TIME ... NCH CH1 ... ; '/TIMESSTART(ms)=' and '/TIMESEND(ms)=' gate windows),
//   - the SMARTem24 'EXPORTED' files (STN RDNG EAST NORTH RL ... ADC C ... CH1 ...: coordinates in the file),
//   - Zonge EMBASE (STN CUR CH1 ... ; KEY=VALUE header, '\ TIMES=' gate times, '\RAW' blocks left out).
// A file with no EAST / NORTH has no coordinates: each station is placed on its line (the line's number is its northing or easting, the station the
// other one), the way the survey was laid out, and the file says so. Repeated readings of a station and component are stacked (their mean).
// Pure. Read by temLines.readTemText.
import { arrMin, arrMax } from "./arrayStats.js"; // no Math.min / max spread (#371)
const TITLE_HEAD = (text) => String(text || "").slice(0, 6000);
export const isMaxwellTem = (text) => /^\s*TEM File Created by MAXWELL/i.test(String(text || "").slice(0, 400)) || (/\bDATATYPE:TEM\b/.test(String(text || "").slice(0, 2000)) && /\bCONFIG:/.test(String(text || "").slice(0, 2000)));

const num = (t) => { if (t == null || t === "*" || t === "") return NaN; const v = Number(t); return Number.isFinite(v) ? v : NaN; };
const GATE = /^CH(\d+)$/i;
const STN_NAMES = ["STATION", "STN"], COMP_NAMES = ["COMPONENT", "C"];

// a column-header line: it starts with a position column (EAST / STN / STATION) and has four or more gate columns
function columnHeader(tokens) {
  const u = tokens.map((t) => t.toUpperCase());
  return u.length >= 6 && ["EAST", "STN", "STATION"].includes(u[0]) && u.filter((t) => GATE.test(t)).length >= 4;
}
// TASKS.csv #4077 — a SMARTem24 'TIP' file (induced polarisation: DATATYPE:TIP, electrodes C1E ... P2Z, the IP decay in CH1 ... CHn) has the same STN / RDNG / CH columns
// as a TEM receiver file and used to be read as TEM. Looked for first by every TEM reader; the DC / IP pane reads it (dcipElectrodes.parseSmartemTip).
export const isSmartemTipText = (text) => { const h = TITLE_HEAD(text); return /^\s*EXPORTED SMARTem\d* TIP data file/i.test(h.slice(0, 300)) || /^\s*SMARTem\d* TIP data file/i.test(h.slice(0, 300)) || (/\bDATATYPE:TIP\b/.test(h.slice(0, 2000)) && /\bC1E\b/.test(h)); };
// whether the text is a receiver-text TEM file of this family: a Maxwell header, or a column-header line within its first lines
export function isReceiverTem(text) {
  if (isSmartemTipText(text)) return false; // #4077 — an IP file, not a TEM one
  if (isMaxwellTem(text)) return true;
  const head = TITLE_HEAD(text).split(/\r\n|\r|\n/, 60);
  return head.some((l) => l.trim() && !/^[/\\]/.test(l.trim()) && columnHeader(l.trim().split(/\s+/)));
}

const numbers = (s) => String(s).split(/[,\s]+/).map(Number).filter(Number.isFinite);

// the loop's corners, from LV1X / LV1Y ... words of the header (a moving loop gives them relative to the station: small numbers, not map coordinates)
function loopCorners(header) {
  const pts = [];
  for (let k = 1; k <= 40; k++) { const x = num(header[`LV${k}X`]), y = num(header[`LV${k}Y`]); if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]); }
  return pts.length >= 3 && pts.every(([x, y]) => Math.abs(x) > 1e4 || Math.abs(y) > 1e4) ? pts : null;
}

// Where a line's stations sit when the file has no coordinates: on the line. The line value ('7554100N', '49800E', '7547900') is the line's northing (an
// east-west line, the stations their eastings) or its easting (a north-south line, the stations their northings). The loop's corners decide when the file has them,
// else a N / E suffix, else the size of the number (a northing is over a million). Stations written with a minus sign and map-sized (-7773900: a southing)
// are taken as their magnitude. One decision for all of the line's stations. -> { points: [{ x, y }] (NaN where a station is no number), axis: "x" | "y", how } | null
export function placeLine(lineValue, stns, loop = null) {
  const m = String(lineValue ?? "").match(/^\s*(-?\d+(?:\.\d+)?)\s*([NSEW])?/i);
  const ok = (stns || []).filter(Number.isFinite);
  if (!m || !ok.length) return null;
  const n = Number(m[1]), suffix = (m[2] || "").toUpperCase();
  const mag = ok.every((v) => v < 0 && Math.abs(v) >= 1e5) ? -1 : 1; // a southing / westing written with a minus sign
  const val = (v) => v * mag;
  let ew = null, how = "number";
  if (loop) {
    const xs = loop.map((q) => q[0]), ys = loop.map((q) => q[1]), pad = 400;
    const x0 = arrMin(xs), x1 = arrMax(xs), y0 = arrMin(ys), y1 = arrMax(ys);
    const inX = (v) => v >= x0 - pad && v <= x1 + pad, inY = (v) => v >= y0 - pad && v <= y1 + pad;
    const nx = ok.filter((v) => inX(val(v))).length, ny = ok.filter((v) => inY(val(v))).length; // the stations along x (east-west line) or along y
    const a = nx + (inY(n) ? ok.length : 0), b = ny + (inX(n) ? ok.length : 0);
    if (a !== b) { ew = a > b; how = "loop"; }
  }
  if (ew == null && (suffix === "N" || suffix === "S")) { ew = true; how = "suffix"; }
  if (ew == null && (suffix === "E" || suffix === "W")) { ew = false; how = "suffix"; }
  if (ew == null) ew = Math.abs(n) >= 1e6;
  return { points: stns.map((v) => (Number.isFinite(v) ? (ew ? { x: val(v), y: n } : { x: n, y: val(v) }) : { x: NaN, y: NaN })), axis: ew ? "x" : "y", how };
}
export const placeAlongLine = (lineValue, stn, loop = null) => { const r = placeLine(lineValue, [stn], loop); return r ? { ...r.points[0], axis: r.axis, how: r.how } : null; };

// -> { header, title, family, columns, config, times (ms, one per gate) | null, gates ['CH1', …], components ['Z', 'X', 'Y'] (Z first), assumedComponent, stations: [{ line, x, y, elev, station, comps }],
//      units, rows, positions: 'file' | 'line' | 'none', positionNote (what was assumed) | null, widths (ms, one per gate, when the file gives them) | null, hasStation,
//      timesListed (how many gate times the file lists, whether or not they fit the gates), skipped (rows of the wrong length) } — each station also has reads: { comp: how many readings were stacked }
export function parseMaxwellTem(text) { return parseTemReceiver(text); }
// opts (TASKS.csv #4064: the downhole reader, lib/downholeEm.js, is built on this same parser): placeLines false leaves the stations' x / y as the file has
// them (a hole's readings are placed by their depth, not on a line); lineDefault(header) names the line (the hole) of the rows before any 'LINE:' row.
export function parseTemReceiver(text, opts = {}) {
  const lines = String(text || "").split(/\r\n|\r|\n/);
  const header = {};
  let title = null, times = null, tStart = null, tEnd = null, tWidth = null, cols = null, line = null, rows = 0, loops = null, skipped = 0, defLine = null;
  const by = new Map(), stations = [], compOrder = [];
  let ci = {};
  const adcOf = {}; let adcLeftOut = 0; // a component read on two ADCs (SMARTem V: gain 1 and gain 40) keeps the first one
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    if (l[0] === "/" || l[0] === "\\") {
      let m;
      if ((m = l.match(/^[/\\]\s*TIMES\s*(?:\(ms\))?\s*=\s*(.*)$/i)) && !times) { const t = numbers(m[1]); if (t.length) times = t; }
      else if ((m = l.match(/^[/\\]\s*TIMESSTART\s*(?:\(ms\))?\s*=\s*(.*)$/i)) && !tStart) tStart = numbers(m[1]);
      else if ((m = l.match(/^[/\\]\s*TIMESEND\s*(?:\(ms\))?\s*=\s*(.*)$/i)) && !tEnd) tEnd = numbers(m[1]);
      else if ((m = l.match(/^[/\\]\s*TIMESWIDTH\s*(?:\(ms\))?\s*=\s*(.*)$/i)) && !tWidth) tWidth = numbers(m[1]);
      else if ((m = l.match(/^[/\\]\s*Loops? coordinates\s*,(.*)$/i)) && !loops) loops = m[1].split(",").map((p) => p.trim().split(/\s+/).map(Number)).filter((p) => p.length >= 2 && p.every(Number.isFinite)).map((p) => [p[0], p[1]]);
      continue;
    }
    if (!cols) {
      const toks = l.split(/\s+/);
      if (columnHeader(toks)) {
        cols = toks.map((t) => t.toUpperCase());
        const at = (names) => cols.findIndex((c) => names.includes(c));
        ci = { stn: at(STN_NAMES), comp: at(COMP_NAMES), east: cols.indexOf("EAST"), north: cols.indexOf("NORTH"), elev: at(["ELEV", "RL"]), units: cols.indexOf("UNITS"), line: cols.indexOf("LINE"), adc: cols.indexOf("ADC") };
        defLine = opts.lineDefault ? opts.lineDefault(header) : header.LINE;
        continue;
      }
      if (title == null) title = l;
      for (const m of l.matchAll(/([A-Za-z][A-Za-z0-9_]*)[:=](\S*)/g)) if (!(m[1].toUpperCase() in header)) header[m[1].toUpperCase()] = m[2];
      continue;
    }
    const sep = l.match(/^LINE\s*[:=]\s*(\S+)/i);
    if (sep) { line = sep[1]; continue; }
    const t = l.split(/\s+/);
    if (t.length !== cols.length) { skipped++; continue; }
    const comp = ci.comp >= 0 ? String(t[ci.comp] || "").toUpperCase() : "Z";
    if (!comp) continue;
    if (ci.adc >= 0) { const adc = t[ci.adc]; if (adcOf[comp] === undefined) adcOf[comp] = adc; else if (adcOf[comp] !== adc) { adcLeftOut++; continue; } }
    const stn = ci.stn >= 0 ? t[ci.stn] : t[0];
    const east = ci.east >= 0 ? t[ci.east] : "", north = ci.north >= 0 ? t[ci.north] : "";
    const lineKey = String(line ?? defLine ?? "1");
    const key = `${lineKey}|${east}|${north}|${stn}${ci.stn < 0 && ci.elev >= 0 ? `|${t[ci.elev]}` : ""}`; // no station column (a hole's receiver moves in elevation): the elevation tells the stations apart
    let s = by.get(key);
    if (!s) {
      s = { line: lineKey, x: ci.east >= 0 ? num(east) : NaN, y: ci.north >= 0 ? num(north) : NaN, elev: ci.elev >= 0 ? num(t[ci.elev]) : NaN, station: num(stn), acc: {}, reads: {} };
      by.set(key, s); stations.push(s);
    }
    if (!compOrder.includes(comp)) compOrder.push(comp);
    const a = s.acc[comp] || (s.acc[comp] = { sum: null, n: null });
    s.reads[comp] = (s.reads[comp] || 0) + 1;
    let g = 0;
    for (let i = 0; i < cols.length; i++) {
      if (!GATE.test(cols[i])) continue;
      if (!a.sum) { a.sum = []; a.n = []; }
      const v = num(t[i]);
      if (a.sum[g] === undefined) { a.sum[g] = 0; a.n[g] = 0; }
      if (Number.isFinite(v)) { a.sum[g] += v; a.n[g]++; }
      g++;
    }
    rows++;
  }
  if (!cols) throw new Error("No column header line (EAST or STN first, then CH1 … CHn) found in this TEM file.");
  if (!stations.length) throw new Error("No data rows found in this TEM file.");
  for (const s of stations) { s.comps = {}; for (const [c, a] of Object.entries(s.acc)) s.comps[c] = Float64Array.from(a.sum, (v, i) => (a.n[i] ? v / a.n[i] : NaN)); delete s.acc; }
  const gates = cols.filter((c) => GATE.test(c));
  let units = null;
  if (ci.units >= 0) for (const raw of lines) { const t = raw.trim().split(/\s+/); if (t.length === cols.length && t[ci.comp] && /^[XYZ]$/i.test(t[ci.comp])) { units = t[ci.units]; break; } }
  if (!units && header.UNITS) units = header.UNITS.replace(/[()]/g, "") || null;
  const rank = (c) => (/^[ZXY]$/.test(c) ? "ZXY".indexOf(c) : 3); // any other letter (A, U, V: an axis of another frame) after Z, X, Y
  const components = [...compOrder].sort((a, b) => rank(a) - rank(b) || compOrder.indexOf(a) - compOrder.indexOf(b)); // Z first: the decay and the 1D inversion read it
  // gate times: a list, or the windows' centres
  let gt = times && times.length === gates.length ? times : null;
  if (!gt && tStart && tEnd && tStart.length === gates.length && tEnd.length === gates.length) gt = tStart.map((v, i) => +((v + tEnd[i]) / 2).toPrecision(6));
  // coordinates: in the file, or from the line
  let positions = "file", positionNote = null;
  if (opts.placeLines === false) positions = ci.east < 0 || ci.north < 0 ? "none" : "file";
  else if (ci.east < 0 || ci.north < 0) {
    positions = "line";
    const loop = loopCorners(header) || (loops && loops.length >= 3 && loops.every(([x, y]) => Math.abs(x) > 1e4 || Math.abs(y) > 1e4) ? loops : null);
    const hows = new Set(), axes = new Set(), byLine = new Map();
    for (const st of stations) (byLine.get(st.line) || byLine.set(st.line, []).get(st.line)).push(st);
    for (const [lineKey, list] of byLine) {
      const r = placeLine(lineKey, list.map((st) => st.station), loop);
      list.forEach((st, i) => { st.x = r ? r.points[i].x : NaN; st.y = r ? r.points[i].y : NaN; });
      if (r) { hows.add(r.how); axes.add(r.axis); }
    }
    positionNote = { axes: [...axes], how: [...hows] };
  }
  const title2 = title || "";
  const family = /MAXWELL/i.test(title2) ? "Maxwell" : /EMBASE/i.test(title2) ? "EMBASE" : /SMARTem|Atlantis/i.test(title2 + " " + (header.RECEIVER || "") + " " + (header.INSTRUMENT || "")) ? "SMARTem" : /PEM SURVEY|CRONE/i.test(title2 + " " + (header.INSTRUMENT || "")) ? "Crone" : "TEM";
  let widths = null;
  if (gt && tWidth && tWidth.length === gates.length) widths = tWidth;
  else if (gt && tStart && tEnd && tStart.length === gates.length && tEnd.length === gates.length) widths = tStart.map((v, i) => +(tEnd[i] - v).toPrecision(6));
  return { header, title: title2, family, columns: cols, config: header.CONFIG || header.ARRAY || null, times: gt, gates, components, assumedComponent: ci.comp < 0, adcLeftOut, stations, units, rows, positions, positionNote, hasTimes: !!gt, widths, timesListed: (times || tStart || []).length, hasStation: ci.stn >= 0, skipped };
}
