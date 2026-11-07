// TASKS.csv #1989 — MT / AMT soundings from EDI files (SEG 1991 "MT/EMAP Data Interchange Standard", the plain-text format every
// MT contractor delivers): the impedance tensor per frequency, apparent resistivity and phase, the rotation-invariant
// determinant, and the Niblett–Bostick depth transform for a first look in depth. Written from the format itself and the
// textbook formulas, not from any other reader. #1667 used to refuse these files ("GeoStrix has no magnetotelluric reader").
//
// Apparent resistivity from an impedance Z at frequency f:
//   SI units (ohm, E / H):                 rho_a = |Z|^2 / (2 pi f mu0)
//   field units ((mV/km) / nT, the SEG default):  rho_a = 0.2 |Z|^2 / f
// Phase = atan2(Im Z, Re Z). The determinant invariant Z_det = sqrt(Zxx Zyy - Zxy Zyx) (Berdichevsky & Dmitriev) does not
// depend on how the tensor was rotated, so one 1D curve per station can be read from it.
// Niblett–Bostick (Bostick 1977; the phase form of Goldberg & Rotstein 1982): depth D = sqrt(rho_a / (omega mu0)) and
// rho_B = rho_a (pi / (2 phi) - 1) with phi in radians in the first quadrant. It is an approximate 1D transform, not an
// inversion: under a 3D body it is wrong, and the pane says so.
import { t as tr } from "./i18n.js";
import { median } from "./arrayStats.js"; // #1114 — the one median

export const MU0 = 4e-7 * Math.PI;
const COMPONENTS = ["xx", "xy", "yx", "yy"];

// "49:43:27.74", "-120:27:11.68" or a decimal -> degrees (NaN when unreadable)
export function parseEdiCoord(s) {
  const t = String(s ?? "").trim().replace(/^"|"$/g, "");
  if (!t) return NaN;
  if (t.includes(":")) {
    const parts = t.split(":").map((p) => Math.abs(Number(p)));
    if (parts.some((p) => !Number.isFinite(p))) return NaN;
    const v = parts[0] + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600;
    return /^\s*-/.test(t) ? -v : v;
  }
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
}

// The file as blocks: { name ("HEAD", "=DEFINEMEAS", "FREQ", "ZXYR", "ZXY.VAR" ...), opts ({ ORDER: "INC", ROT: "ZROT" }),
// count (the "//27" after a data block's name, or null), lines }
function blocksOf(text) {
  const out = [];
  let cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith(">")) {
      const head = line.slice(1).trim();
      const name = (head.split(/\s+/)[0] || "").toUpperCase();
      const opts = {};
      for (const m of head.matchAll(/([A-Za-z0-9_.]+)\s*=\s*("[^"]*"|\S+)/g)) opts[m[1].toUpperCase()] = m[2].replace(/^"|"$/g, "");
      const cm = head.match(/\/\/\s*(\d+)/);
      cur = { name, opts, count: cm ? Number(cm[1]) : null, lines: [] };
      out.push(cur);
    } else if (cur && line) cur.lines.push(line);
  }
  return out;
}

const keyValues = (block) => {
  const o = {};
  for (const l of block?.lines || []) {
    const m = l.match(/^([A-Za-z0-9_.]+)\s*=\s*(.*)$/);
    if (m) o[m[1].toUpperCase()] = m[2].trim().replace(/^"|"$/g, "");
  }
  return o;
};
const numbersOf = (block) => {
  const v = [];
  for (const l of block.lines) for (const tok of l.split(/[\s,]+/)) if (tok) v.push(Number(tok));
  return block.count != null ? v.slice(0, block.count) : v;
};

const rhoSI = (re, im, f) => (re * re + im * im) / (2 * Math.PI * f * MU0);
const rhoField = (re, im, f) => (0.2 * (re * re + im * im)) / f;

// Fold a phase into [0, 180): the xy and yx phases of one station sit in opposite quadrants depending on the axes'
// convention; folded, a uniform half-space reads 45 degrees on both and the 1D range is 0..90.
export const foldPhase = (deg) => (Number.isFinite(deg) ? (((deg % 180) + 180) % 180) : NaN);

// Complex helpers on [re, im]
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const csqrt = ([re, im]) => {
  const r = Math.hypot(re, im);
  const s = Math.sqrt((r + re) / 2), t = Math.sqrt(Math.max(0, (r - re) / 2));
  return [s, im < 0 ? -t : t];
};

// text, name -> { id, prospect, lat, lon, elev, freqs (ascending, Hz), z: { xy: { re, im, var } ... }, fileRho, filePhs,
//   units: "SI" | "field", unitsFrom: "rho" | "info" | "standard", warnings: [] }. Throws a sentence when the file is not
// a readable impedance EDI.
export function parseEdi(text, name = "file.edi") {
  const blocks = blocksOf(text);
  const byName = (n) => blocks.find((b) => b.name === n);
  const head = keyValues(byName("HEAD")), meas = keyValues(byName("=DEFINEMEAS"));
  if (!byName("HEAD")) throw new Error(tr("{name} is not an EDI file: it has no >HEAD block.", { name }));
  if (byName("=SPECTRASECT") && !byName("ZXYR")) throw new Error(tr("{name} holds MT spectra (>=SPECTRASECT), not impedances: export it from the processing software as impedances (>=MTSECT), then import that.", { name }));
  const freqBlock = byName("FREQ");
  if (!freqBlock) throw new Error(tr("{name} has no >FREQ block, so its impedances cannot be placed in frequency.", { name }));
  const empty = Number(head.EMPTY);
  const isEmpty = (v) => !Number.isFinite(v) || (Number.isFinite(empty) && Math.abs(v) >= Math.abs(empty) * 0.999);
  const clean = (arr) => arr.map((v) => (isEmpty(v) ? NaN : v));
  const freqsRaw = clean(numbersOf(freqBlock));
  const n = freqsRaw.length;
  const series = (bname) => { const b = byName(bname); if (!b) return null; const v = clean(numbersOf(b)); return v.length === n ? v : null; };
  // ascending frequency, whatever ORDER says
  const order = freqsRaw.map((f, i) => i).filter((i) => freqsRaw[i] > 0).sort((a, b) => freqsRaw[a] - freqsRaw[b]);
  const pick = (arr) => (arr ? order.map((i) => arr[i]) : null);
  const freqs = pick(freqsRaw);
  const z = {};
  for (const c of COMPONENTS) {
    const C = c.toUpperCase();
    const re = series(`Z${C}R`), im = series(`Z${C}I`);
    if (re && im) z[c] = { re: pick(re), im: pick(im), var: pick(series(`Z${C}.VAR`)) };
  }
  if (!z.xy && !z.yx) throw new Error(tr("{name} has no off-diagonal impedances (ZXYR / ZXYI or ZYXR / ZYXI).", { name }));
  const fileRho = {}, filePhs = {};
  for (const c of COMPONENTS) {
    const r = series(`RHO${c.toUpperCase()}`), p = series(`PHS${c.toUpperCase()}`);
    if (r) fileRho[c] = pick(r);
    if (p) filePhs[c] = pick(p);
  }
  // Units: the file's own apparent resistivity decides when it has one; else a note in >INFO; else the SEG default
  const warnings = [];
  let units = "field", unitsFrom = "standard";
  const probe = ["xy", "yx"].find((c) => z[c] && fileRho[c]);
  if (probe) {
    const misfit = (fn) => Math.abs(median(freqs.map((f, i) => Math.log10(fileRho[probe][i] / fn(z[probe].re[i], z[probe].im[i], f)))));
    const mSI = misfit(rhoSI), mField = misfit(rhoField);
    units = mSI <= mField ? "SI" : "field";
    unitsFrom = "rho";
    if (Math.min(mSI, mField) > 0.05) warnings.push(tr("The file's own apparent resistivity differs from its impedances by a factor of {v} in either unit system; the impedances were used.", { v: (10 ** Math.min(mSI, mField)).toPrecision(2) }));
  } else {
    const info = (byName("INFO")?.lines || []).join(" ");
    if (/\bSI\b/.test(info) && /imped/i.test(info)) { units = "SI"; unitsFrom = "info"; }
  }
  const lat = parseEdiCoord(head.LAT ?? meas.REFLAT), lon = parseEdiCoord(head.LONG ?? head.LON ?? meas.REFLONG);
  const elevRaw = head.ELEV ?? meas.REFELEV;
  const elev = elevRaw != null && elevRaw !== "" && Number.isFinite(Number(elevRaw)) ? Number(elevRaw) : null;
  const id = head.DATAID || keyValues(byName("=MTSECT")).SECTID || name.replace(/\.[^.]+$/, "");
  return { id: String(id), prospect: head.PROSPECT || null, lat, lon, elev, elevUnits: head.UNITS || meas.UNITS || "M", freqs, z, fileRho, filePhs, units, unitsFrom, warnings };
}

// One parsed EDI -> its curves: { freqs, rho: { xy, yx, det }, phs: { xy, yx, det } } (phase folded into [0, 180))
export function soundingCurves(edi) {
  const { freqs, z, units } = edi;
  const rhoOf = units === "SI" ? rhoSI : rhoField;
  const rho = {}, phs = {};
  for (const c of ["xy", "yx"]) {
    if (!z[c]) continue;
    rho[c] = freqs.map((f, i) => rhoOf(z[c].re[i], z[c].im[i], f));
    phs[c] = freqs.map((f, i) => foldPhase((Math.atan2(z[c].im[i], z[c].re[i]) * 180) / Math.PI));
  }
  if (z.xy && z.yx) {
    const zero = freqs.map(() => 0);
    const xx = z.xx || { re: zero, im: zero }, yy = z.yy || { re: zero, im: zero };
    const det = freqs.map((f, i) => {
      const a = cmul([xx.re[i], xx.im[i]], [yy.re[i], yy.im[i]]), b = cmul([z.xy.re[i], z.xy.im[i]], [z.yx.re[i], z.yx.im[i]]);
      return csqrt([a[0] - b[0], a[1] - b[1]]);
    });
    rho.det = freqs.map((f, i) => rhoOf(det[i][0], det[i][1], f));
    phs.det = freqs.map((f, i) => foldPhase((Math.atan2(det[i][1], det[i][0]) * 180) / Math.PI));
  }
  return { freqs, rho, phs };
}

// Niblett–Bostick: (rho_a, phase in degrees folded, f) -> { depth (m), rho (ohm.m) } or null outside the 1D phase range
export function bostick(rhoA, phaseDeg, f) {
  if (!(rhoA > 0) || !(f > 0) || !(phaseDeg > 0 && phaseDeg < 90)) return null;
  const phi = (phaseDeg * Math.PI) / 180;
  const rho = rhoA * (Math.PI / (2 * phi) - 1);
  if (!(rho > 0) || !Number.isFinite(rho)) return null;
  return { depth: Math.sqrt(rhoA / (2 * Math.PI * f * MU0)), rho };
}

// "1100N3550" -> { line: "1100N", station: "3550" }; a name with no line in it -> { line: null, station: id }
export function stationLine(id) {
  const m = String(id || "").match(/^\s*(-?\d+(?:\.\d+)?)\s*([NSEW])\s*[-_ ]?\s*(-?\d+(?:\.\d+)?)\s*([NSEW])?\s*$/i);
  return m ? { line: `${m[1]}${m[2].toUpperCase()}`, station: `${m[3]}${(m[4] || "").toUpperCase()}` } : { line: null, station: String(id || "") };
}

const r5 = (v) => (Number.isFinite(v) ? Number(v.toPrecision(5)) : null);
// coordinates keep their own resolution: 5 significant digits of a UTM northing would move a station by metres
const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null), r7 = (v) => (Number.isFinite(v) ? Math.round(v * 1e7) / 1e7 : null);

// parsed EDIs + toXY(lon, lat) -> { x, y } | null  ->  stations as stored with the survey (numbers to 5 significant digits)
export function ediStations(parsed, toXY) {
  return parsed.map((e) => {
    const c = soundingCurves(e), p = Number.isFinite(e.lat) && Number.isFinite(e.lon) ? toXY(e.lon, e.lat) : null;
    const { line, station } = stationLine(e.id);
    const keep = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.map(r5)]));
    return { id: e.id, line, station, lat: r7(e.lat), lon: r7(e.lon), x: p ? r1(p.x) : null, y: p ? r1(p.y) : null, z: e.elev, freqs: c.freqs.map(r5), rho: keep(c.rho), phs: keep(c.phs), units: e.units };
  });
}

// stations -> Niblett–Bostick points under each station (z = elevation - depth), for a point survey drawn in 3D.
// value is log10 of rho_B: resistivity spans decades, and a linear colour stretch would show one colour. Stations with no
// position or no elevation give none (a depth below an unknown surface is not a place); they are counted.
export function bostickPoints(stations, src) {
  const rows = [];
  let noPlace = 0, outside = 0;
  for (const s of stations) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.z)) { noPlace++; continue; }
    const rho = s.rho.det || s.rho.xy || s.rho.yx, phs = s.phs.det || s.phs.xy || s.phs.yx;
    if (!rho) continue;
    s.freqs.forEach((f, i) => {
      const b = bostick(rho[i], phs[i], f);
      if (!b) { outside++; return; }
      rows.push({ x: s.x, y: s.y, z: r1(s.z - b.depth), value: r5(Math.log10(b.rho)), rho: r5(b.rho), depth: r5(b.depth), freq: f, station: s.id, label: s.id, _src: src });
    });
  }
  return { rows, noPlace, outside };
}

// Stations of one line in order along it: distance along the best-fit direction of their positions (m), first at 0
export function lineOrder(stations) {
  const placed = stations.filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y));
  if (placed.length < 2) return placed.map((s) => ({ s, d: 0 }));
  const mx = placed.reduce((a, s) => a + s.x, 0) / placed.length, my = placed.reduce((a, s) => a + s.y, 0) / placed.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const s of placed) { const dx = s.x - mx, dy = s.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let ux = Math.cos(th), uy = Math.sin(th);
  if (ux < -1e-9 || (Math.abs(ux) < 1e-9 && uy < 0)) { ux = -ux; uy = -uy; } // west to east (south to north on a N-S line)
  const d = placed.map((s) => ({ s, d: (s.x - mx) * ux + (s.y - my) * uy })).sort((a, b) => a.d - b.d);
  const d0 = d[0].d;
  return d.map((o) => ({ s: o.s, d: o.d - d0 }));
}

// line names in survey order: 500N before 1100N (by their number), then the rest by name
export const sortLines = (lines) => [...lines].sort((a, b) => {
  const na = parseFloat(a), nb = parseFloat(b), fa = Number.isFinite(na), fb = Number.isFinite(nb);
  if (fa !== fb) return fa ? -1 : 1; // numbered lines first
  return fa && na !== nb ? na - nb : String(a).localeCompare(String(b));
});

// stations -> the survey's name: "MT soundings (MPD)" when they share a prospect name, else "MT soundings"
export function mtSurveyName(parsed) {
  const p = [...new Set(parsed.map((e) => e.prospect).filter(Boolean))];
  return p.length === 1 ? `MT soundings (${p[0]})` : "MT soundings";
}

// stations already in a survey + new ones: a station read again replaces its earlier copy (same id), the others stay
export function mergeStations(prev, incoming) {
  const ids = new Set(incoming.map((s) => s.id));
  return [...(prev || []).filter((s) => !ids.has(s.id)), ...incoming];
}
