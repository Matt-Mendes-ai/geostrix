// TASKS.csv #1993 — a .geoh5 file's objects as GeoStrix project objects: lib/geoh5.js reads it into OMF's element shapes and lib/omfImport.js's
// conversion makes the point / line / surface objects and the block models (cell budget, crop, colours), so both formats behave alike.
// Loaded on demand (the Geophysics tab's import), with h5wasm behind it.
import { parseGeoh5 } from "./geoh5.js";
import { elementsToProjectObjects } from "./omfImport.js";
import { t as tr } from "./i18n.js";

export async function geoh5ToProjectObjects(arrayBuffer, maxCells, opts = {}) {
  const ws = await parseGeoh5(arrayBuffer);
  const res = elementsToProjectObjects(ws.elements, maxCells, opts, "geoh5");
  const grids = ws.elements.filter((e) => e.grid2d && e.attributes?.length).map((e) => e.name);
  if (grids.length) res.notes.push(tr("2D grids ({names}) are shown as block models one cell thick, coloured by their values.", { names: grids.join(", ") }));
  if (ws.distanceUnit && !/^m(et(er|re)s?)?$/i.test(ws.distanceUnit.trim())) res.notes.push(tr("The file's distance unit is {u}: its coordinates are used as they are, not converted to metres.", { u: ws.distanceUnit }));
  res.notes.push(tr("A geoh5 file carries no coordinate system: its coordinates are used as they are, in the project's."));
  // TASKS.csv #1993 step 1b — the drillholes as plain tables, for the 3D View's own import (its queue, its mapping dialogs and checks)
  const holes = ws.elements.filter((e) => e.kind === "drillhole");
  return { ...res, version: ws.version, drillholes: holes.length, surveyStations: holes.reduce((n, h) => n + (h.surveys?.length || 0), 0), drillholeTables: holes.length ? drillholeTables(holes, opts.baseName || "geoh5") : [] };
}

// CSV text (a comma, a quote or a line break in a cell is quoted; a blank / NaN is empty)
const cell = (v) => { if (v == null || (typeof v === "number" && !Number.isFinite(v))) return ""; const s = String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (head, rows) => [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
const safeName = (s) => String(s).replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "data";
// TASKS.csv #1993 step 1b — the holes -> [{ name, text }]: <base>_collars.csv (hole_id, x, y, z, azimuth, dip, depth), <base>_surveys.csv, one table of the
// numeric interval values (an assay or numeric-log table), one per text / code interval entry (a lithology, alteration ... log, named after it so the
// import guesses its layer), one of the point values. Dips are written as the file has them (negative down): the import's sign check reads the convention.
export function drillholeTables(holes, base = "geoh5") {
  const b = safeName(base), out = [];
  const depthOf = (h) => [h.endOfHole, ...(h.surveys || []).map((s) => s[0]), ...(h.intervals?.to || []), ...(h.points?.depth || [])].filter(Number.isFinite).reduce((m, v) => (v > m ? v : m), -Infinity); // End of hole, else the deepest station, interval or reading
  out.push({ name: `${b}_collars.csv`, text: csv(["hole_id", "x", "y", "z", "azimuth", "dip", "depth"], holes.map((h) => {
    const s0 = h.surveys?.[0];
    return [h.name, h.collar[0], h.collar[1], h.collar[2], Number.isFinite(h.azimuth) ? h.azimuth : s0?.[1], Number.isFinite(h.dip) ? h.dip : s0?.[2], Number.isFinite(depthOf(h)) ? depthOf(h) : ""];
  })) });
  const st = holes.flatMap((h) => (h.surveys || []).map((s) => [h.name, s[0], s[1], s[2]]));
  if (st.length) out.push({ name: `${b}_surveys.csv`, text: csv(["hole_id", "depth", "azimuth", "dip"], st) });
  const kinds = (sec, numeric) => { const names = new Set(); for (const h of holes) for (const [k, v] of Object.entries(h[sec]?.columns || {})) if ((v instanceof Float64Array) === numeric) names.add(k); return [...names]; };
  // TASKS.csv #1993 step 1b — interval sets: one table per FROM / TO set when a hole has more than one (named by its first data names), the code columns
  // apart so the import guesses their layer; one set: <base>_interval_values.csv and a table per code column, as before
  const sets = [], sig = (s) => Object.keys(s.columns).sort().join("|");
  for (const h of holes) for (const s of h.intervalSets || (h.intervals ? [h.intervals] : [])) { let g = sets.find((x) => x.sig === sig(s)); if (!g) sets.push((g = { sig: sig(s), names: Object.keys(s.columns), parts: [] })); g.parts.push({ h, s }); }
  const multi = holes.some((h) => (h.intervalSets || []).length > 1);
  sets.forEach((g, gi) => {
    const isNum = (k) => g.parts.some(({ s }) => s.columns[k] instanceof Float64Array), num = g.names.filter(isNum), codes = g.names.filter((k) => !isNum(k));
    const tag = multi ? `intervals_${gi + 1}_${safeName(num.slice(0, 2).join("_")).slice(0, 40)}` : "interval_values";
    if (num.length) out.push({ name: `${b}_${tag}.csv`, text: csv(["hole_id", "from", "to", ...num], g.parts.flatMap(({ h, s }) => s.from.map((f, i) => [h.name, f, s.to[i], ...num.map((k) => s.columns[k]?.[i])]))) });
    for (const k of codes) out.push({ name: multi ? `${b}_intervals_${gi + 1}_${safeName(k)}.csv` : `${b}_${safeName(k)}.csv` /* multi: a code column of two sets would share a name */, text: csv(["hole_id", "from", "to", k], g.parts.flatMap(({ h, s }) => s.from.map((f, i) => [h.name, f, s.to[i], s.columns[k]?.[i]]).filter((r) => r[3] !== "" && r[3] != null))) });
  });
  const ptN = [...kinds("points", true), ...kinds("points", false)];
  if (ptN.length) out.push({ name: `${b}_points.csv`, text: csv(["hole_id", "depth", ...ptN], holes.flatMap((h) => (h.points ? h.points.depth.map((d, i) => [h.name, d, ...ptN.map((k) => h.points.columns[k]?.[i])]) : []))) });
  return out;
}
