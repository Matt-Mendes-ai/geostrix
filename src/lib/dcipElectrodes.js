// TASKS.csv #4065 (found by side 2's inventory of 28 Queensland open-file reports) — IP files whose electrodes carry MAP coordinates, not distances along a line:
//   - MIMDAS IP 'Geosoft format' text (F1x F2x M1x M2x F1y F2y M1y M2y 2DRho ... Vp I Sp IP IPerr ... Phase ...),
//   - SMARTem24 'TIP' exports (STN RDNG C1E C1N C1Z C2E ... P2Z ... APPRES M MERR ... PHASE ..., several lines in one file),
// and the file that gives only potentials per unit current:
//   - MIMDAS UBC-2D observation files (.dc: 'A B M N V/I error', the line's name in the first line).
// The DC / IP line reader works in distances along ONE line: each electrode's map position is projected onto the line's axis (a principal axis of all the
// electrodes), the distances start at the first electrode, and the line is placed by its two ends. A survey whose electrodes lie on several lines is a 3D
// survey: said, not read as one line. Repeated readings of one array are stacked. Pure.
import { guessDcipColumns, apparentResistivity, threeDError } from "./dcip.js";
import { smallGridCoordinates } from "./crsFromColumns.js";
import { placeLine } from "./maxwellTem.js";
import { arrMin, arrMax } from "./arrayStats.js";
import { t as tr } from "./i18n.js";

const num = (v) => { if (v == null || String(v).trim() === "" || /^(\*|na|nan|null|inf)$/i.test(String(v).trim())) return null; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
const norm = (h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]/g, "");

const STEMS = { A: ["c1", "f1", "a", "t1", "tx1"], B: ["c2", "f2", "b", "t2", "tx2"], M: ["p1", "m1", "m", "r1", "rx1"], N: ["p2", "m2", "n", "r2", "rx2"] };
const AXES = { x: ["x", "e"], y: ["y", "n"], z: ["z"] };

// the electrode columns of a table: { A: { x, y, z? }, B, M, N } (the column names), or null when A and M do not both have an x and a y column
export function electrodeColumns(headers) {
  const by = new Map((headers || []).map((h) => [norm(h), h]));
  const out = {};
  for (const [el, stems] of Object.entries(STEMS)) {
    for (const stem of stems) {
      const x = AXES.x.map((a) => by.get(stem + a)).find(Boolean), y = AXES.y.map((a) => by.get(stem + a)).find(Boolean), z = AXES.z.map((a) => by.get(stem + a)).find(Boolean);
      if (x && y && x !== y) { out[el] = { x, y, ...(z ? { z } : {}) }; break; }
    }
  }
  return out.A && out.M ? out : null;
}

// the principal axis of a set of points: { c: [cx, cy], u: [ux, uy] (towards east, else north), sdAcross, length }
function axisOf(pts) {
  const n = pts.length, cx = pts.reduce((a, p) => a + p[0], 0) / n, cy = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) { const dx = x - cx, dy = y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let u = [Math.cos(th), Math.sin(th)];
  if (u[0] < -1e-9 || (Math.abs(u[0]) <= 1e-9 && u[1] < 0)) u = [-u[0], -u[1]];
  const s = pts.map(([x, y]) => (x - cx) * u[0] + (y - cy) * u[1]), d = pts.map(([x, y]) => -(x - cx) * u[1] + (y - cy) * u[0]);
  const sd = Math.sqrt(d.reduce((a, v) => a + v * v, 0) / n);
  return { c: [cx, cy], u, sdAcross: sd, length: arrMax(s) - arrMin(s), s, d };
}

// -> null (not an electrode-coordinate table, or its coordinates are a local grid: the along-line reader takes it as it is) | { error } | { lines: [{ name, headers, rows, pts, readings, note }] }
export function electrodeLines(headers, rows, { lineCol = null, base = "line", tag = null } = {}) {
  const el = electrodeColumns(headers);
  if (!el) return null;
  const g = guessDcipColumns(headers.filter((h) => !Object.values(el).some((c) => c.x === h || c.y === h || c.z === h)));
  const rhoCol = g.rho, ipCol = g.ip;
  if (!rhoCol) return null;
  const pt = (r, e) => { const c = el[e]; if (!c) return null; const x = num(r[c.x]), y = num(r[c.y]); return x != null && y != null ? [x, y] : null; };
  const groups = new Map();
  for (const r of rows || []) { const k = lineCol ? String(r[lineCol] ?? "") : ""; (groups.get(k) || groups.set(k, []).get(k)).push(r); }
  const out = [];
  for (const [key, list] of groups) {
    const E = list.map((r) => ({ A: pt(r, "A"), B: pt(r, "B"), M: pt(r, "M"), N: pt(r, "N"), r })).filter((e) => e.A && e.M);
    if (!E.length) continue;
    for (const e of E) { // a pole: its second electrode is at infinity ('*') or sits on the first (a UBC 'pole-dipole' file gives it twice)
      if (e.B && e.A && e.B[0] === e.A[0] && e.B[1] === e.A[1]) e.B = null;
      if (e.N && e.M && e.N[0] === e.M[0] && e.N[1] === e.M[1]) e.N = null;
    }
    const all = []; for (const e of E) for (const p of [e.A, e.B, e.M, e.N]) if (p) all.push(p);
    if (smallGridCoordinates(all.map(([x, y]) => ({ x, y }))) || all.some(([x, y]) => Math.abs(x) < 1e5 && Math.abs(y) < 1e5)) return null; // a local grid / chainage: the along-line reader's own case (Zonge TQIPdb)
    const ax = axisOf(all);
    if (ax.sdAcross > 60 && ax.sdAcross > 0.12 * ax.length) { // electrodes on several lines: a 3D survey
      // the receiver lines: the across-axis offsets of the potential electrodes, grouped where they stand more than 50 m (or 2 % of the length) apart
      const across = (p) => -(p[0] - ax.c[0]) * ax.u[1] + (p[1] - ax.c[1]) * ax.u[0];
      const offs = E.flatMap((e) => [e.M, e.N]).filter(Boolean).map(across).sort((p, q) => p - q), gap = Math.max(50, 0.02 * ax.length);
      let nLines = 1; for (let i = 1; i < offs.length; i++) if (offs[i] - offs[i - 1] > gap) nLines++;
      const off = E.filter((e) => Math.abs(across(e.A) - across(e.M)) > gap).length;
      return { error: threeDError(nLines, off) };
    }
    const sOf = ([x, y]) => (x - ax.c[0]) * ax.u[0] + (y - ax.c[1]) * ax.u[1];
    const s0 = arrMin(ax.s), s1 = arrMax(ax.s);
    const dist = (p) => (p ? +(sOf(p) - s0).toFixed(2) : null);
    // stack the repeats of one array
    const stack = new Map();
    for (const e of E) {
      const rho = num(e.r[rhoCol]), ip = ipCol ? num(e.r[ipCol]) : null;
      const k = [e.A, e.B, e.M, e.N].map((p) => (p ? dist(p) : "*")).join("|");
      const a = stack.get(k) || stack.set(k, { A: dist(e.A), B: dist(e.B), M: dist(e.M), N: dist(e.N), rho: [], ip: [] }).get(k);
      if (rho != null && rho > 0) a.rho.push(rho);
      if (ip != null) a.ip.push(ip);
    }
    const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
    const outRows = [...stack.values()].filter((a) => a.rho.length).map((a) => ({ A: a.A, B: a.B ?? "", M: a.M, N: a.N ?? "", [rhoCol]: +mean(a.rho).toPrecision(6), ...(ipCol ? { [ipCol]: a.ip.length ? +mean(a.ip).toPrecision(6) : "" } : {}) }));
    if (!outRows.length) continue;
    // the centre line: c + s u, with s counted from the mean; the along-line coordinate of the first electrode is s0
    const p0 = [ax.c[0] + s0 * ax.u[0], ax.c[1] + s0 * ax.u[1]], p1 = [ax.c[0] + s1 * ax.u[0], ax.c[1] + s1 * ax.u[1]];
    const span = s1 - s0, azimuth = ((Math.atan2(ax.u[0], ax.u[1]) * 180) / Math.PI + 360) % 360;
    const name = key ? `${base} ${String(key).replace(/^Tx(\S+)Rx\S+$/i, "$1")}` : base;
    out.push({
      name, headers: ["A", "B", "M", "N", rhoCol, ...(ipCol ? [ipCol] : [])], rows: outRows,
      pts: { s1: 0, x1: p0[0], y1: p0[1], s2: span, x2: p1[0], y2: p1[1] },
      readings: E.length, stacked: E.length - outRows.length,
      note: tr("Electrodes read as one line (azimuth {az}°, {len} m){v}.", { az: azimuth.toFixed(1), len: Math.round(span).toLocaleString(), v: E.length !== outRows.length ? tr("; {n} repeats stacked", { n: (E.length - outRows.length).toLocaleString() }) : "" }),
    });
  }
  return out.length ? { lines: out } : null;
}

// SMARTem24 'TIP' export: header lines, a column line (STN RDNG C1E C1N C1Z ... APPRES M MERR ... PHASE ... CH1 ...), '/TIMES' windows, 'LINE:' separator rows.
// -> { headers, rows (with a 'Line' field), note } | null. M is the chargeability (the file's UNITS say mV/V), APPRES the apparent resistivity.
export const isSmartemTip = (text) => /^\s*EXPORTED SMARTem\d* TIP data file/i.test(String(text || "").slice(0, 300)) || (/\bDATATYPE:TIP\b/.test(String(text || "").slice(0, 2000)) && /\bC1E\b/.test(String(text || "").slice(0, 6000)));
export function parseSmartemTip(text) {
  const lines = String(text || "").split(/\r\n|\r|\n/);
  let cols = null, line = "", rows = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l || l[0] === "/") continue;
    if (!cols) { const t = l.split(/\s+/); if (t[0].toUpperCase() === "STN" && t.map((x) => x.toUpperCase()).includes("C1E")) cols = t.map((x) => x.toUpperCase()); continue; }
    const sep = l.match(/^LINE\s*[:=]\s*(\S+)/i);
    if (sep) { line = sep[1]; continue; }
    const t = l.split(/\s+/);
    if (t.length !== cols.length) continue;
    const o = { Line: line };
    cols.forEach((c, i) => { if (/^(C1|C2|P1|P2)[ENZ]$/.test(c) || c === "APPRES" || c === "M" || c === "MERR" || c === "STN" || c === "RDNG") o[c === "APPRES" ? "Apparent resistivity" : c === "M" ? "Chargeability" : c] = t[i]; });
    rows.push(o);
  }
  if (!cols || !rows.length) return null;
  return { headers: ["Line", "STN", "RDNG", ...["C1", "C2", "P1", "P2"].flatMap((e) => ["E", "N", "Z"].map((a) => e + a)), "Apparent resistivity", "Chargeability", "MERR"], rows };
}

// MIMDAS UBC-2D observation file: 'MIMDAS IP Data UBC 2D Format : ... LINE:Line10_7511200N ARRAY:PLDP ...', an array line ('pole-dipole'), then 'A B M N value error' rows.
// The value is a potential per unit current (V/A): the apparent resistivity is its geometric factor times it. -> { lines: [...] } | { error } | null
export const isUbc2dObs = (text) => /UBC 2D Format/i.test(String(text || "").slice(0, 400));
export function parseUbc2dObs(text, base = "line") {
  const ls = String(text || "").split(/\r\n|\r|\n/).filter((l) => l.trim());
  if (!ls.length) return null;
  const tagM = ls[0].match(/\bLINE:(\S+)/i), tag = tagM ? tagM[1] : null;
  const rows = [];
  for (const l of ls.slice(1)) {
    const t = l.trim().split(/\s+/).map(Number);
    if (t.length < 5 || !t.slice(0, 5).every(Number.isFinite)) continue;
    const [a, b, m, n, v, err] = t;
    const bb = b === a ? null : b, nn = n === m ? null : n; // a pole: the second current electrode is the first again
    const rho = apparentResistivity(a, bb, m, nn, v * 1000, 1);
    if (rho == null || !(rho > 0)) continue;
    rows.push({ A: a, B: bb ?? "", M: m, N: nn ?? "", "Apparent resistivity": +rho.toPrecision(6), ...(Number.isFinite(err) && v ? { "Error (% of reading)": +(Math.abs(err / v) * 100).toPrecision(4) } : {}) });
  }
  if (!rows.length) return null;
  const xs = rows.flatMap((r) => [r.A, r.B, r.M, r.N]).filter((v) => v !== "");
  const lo = arrMin(xs), hi = arrMax(xs);
  const placed = tag ? placeLine(tag.replace(/^.*?_(?=\d{5,})/, ""), [lo, hi], null) : null; // 'Line10_7511200N' -> '7511200N'
  const pts = placed ? { s1: lo, x1: placed.points[0].x, y1: placed.points[0].y, s2: hi, x2: placed.points[1].x, y2: placed.points[1].y } : null;
  return { lines: [{ name: base, headers: ["A", "B", "M", "N", "Apparent resistivity", ...(rows.some((r) => "Error (% of reading)" in r) ? ["Error (% of reading)"] : [])], rows, pts, readings: rows.length, stacked: 0,
    note: tr("UBC-2D file: V/A values turned into apparent resistivity.") + (placed ? " " + tr("Placed from its name ({tag}).", { tag }) : "") }] };
}

// the special readers, in one call: -> null | { error } | { lines }
export function electrodeFile(text, name, t, { lineTag = null } = {}) {
  const base = String(name || "line").replace(/\.[a-z0-9]+$/i, "");
  if (isUbc2dObs(text)) return parseUbc2dObs(text, base);
  if (isSmartemTip(text)) { const tip = parseSmartemTip(text); return tip ? electrodeLines(tip.headers, tip.rows, { lineCol: "Line", base }) : null; }
  if (!t?.headers?.length) return null;
  return electrodeLines(t.headers, t.rows, { base, tag: lineTag }) || placedFromName(t, base, lineTag);
}

// TASKS.csv #4065 — electrode positions that are map eastings (or northings) with no second coordinate (MIMDAS 2D lines: F1x F2x M1x M2x; the line named 'Line10_7511200N'):
// the distances are the positions themselves, and the line's name says which way it runs and where: placed from it. -> null | { lines: [one line] }
export function placedFromName(t, base, tag) {
  const m = tag && String(tag).replace(/^.*?_(?=\d{5,})/, "").match(/^(\d{6,8})([NSEW])?$/i);
  if (!m || !t?.headers) return null;
  const g = guessDcipColumns(t.headers);
  if (!g.a || !g.m || !g.rho) return null;
  const vs = [];
  for (const r of t.rows || []) for (const c of [g.a, g.b, g.m, g.n]) { const v = c ? num(r[c]) : null; if (v != null) vs.push(v); }
  if (vs.length < 4) return null;
  const lo = arrMin(vs), hi = arrMax(vs);
  if (lo < 1e5) return null; // a local chainage: the along-line reader takes it as it is
  const placed = placeLine(m[1] + (m[2] || ""), [lo, hi], null);
  if (!placed) return null;
  const pts = { s1: lo, x1: placed.points[0].x, y1: placed.points[0].y, s2: hi, x2: placed.points[1].x, y2: placed.points[1].y };
  return { lines: [{ name: base, headers: t.headers, rows: t.rows, pts, readings: t.rows.length, stacked: 0,
    note: tr("Placed from its name ({tag}).", { tag }) }] };
}
