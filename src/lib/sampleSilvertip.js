// TASKS.csv #1346 — the parts of the Silvertip sample project (sample_data/silvertip, ARIS 42807) that are not drillhole tables:
// the drill-core assays (into Geochem) and the 2024 rock, soil and stream-sediment samples (surface samples). The drillhole CSVs
// go through the normal import queue like the other samples'. Each part is independent: one failing doesn't stop the other.
import Papa from "papaparse";
import { inferUnit, mergeAssayRows, readAssayCell, mergeSurfaceSamples } from "./geochem.js";
import { alignAssayUnits } from "./sampleWoodjam.js";
import { t as tr } from "./i18n.js";

export const SILVERTIP_EPSG = 26909; // NAD83 / UTM zone 9N — the NAD83_9N_* columns of the acQuire export
export const SILVERTIP_SURFACE = [["rocks.csv", "rock chip"], ["soils.csv", "soil"], ["streams.csv", "stream sediment"]];

// <El>_ppm | <El>_pct columns -> [{ symbol, header, unit, checked }]
const elementsOf = (fields) => fields.map((h) => { const m = /^([A-Z][a-z]?)_(ppm|pct)$/.exec(h); return m ? { symbol: m[1], header: h, unit: inferUnit(h, m[1]), checked: true } : null; }).filter(Boolean);

// values as the Geochem importer reads them (#333): a negative number is the lab's below-detection code, <= -99 not assayed
function valuesOf(r, elements) {
  const values = {}, bdl = [];
  for (const e of elements) {
    const c = readAssayCell(r[e.header]);
    if (c.kind === "neg_bdl" || c.qualifier === "<") bdl.push(e.symbol);
    if (c.value != null && Number.isFinite(c.value)) values[e.symbol] = c.value;
  }
  return { values, bdl };
}

// assays.csv (hole_id, from, to, sample_id, <El>_ppm | <El>_pct ...) -> Geochem rows + element list
export function silvertipAssays(text, srcFile = "assays.csv") {
  const t = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  const elements = elementsOf(t.meta.fields);
  const rows = [];
  for (const r of t.data) {
    const from = Number(r.from), to = Number(r.to), hole = String(r.hole_id || "").trim();
    if (!hole || !Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) continue;
    rows.push({ hole_id: hole, from, to, values: valuesOf(r, elements).values, source: "assay", srcFile, ...(r.sample_id ? { sample_id: String(r.sample_id).trim() } : {}) });
  }
  return { rows, elements };
}

// rocks / soils / streams .csv (sample_id, x, y, z, medium, <El>_...) -> surface samples + element list
export function silvertipSurface(text, medium) {
  const t = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  const elements = elementsOf(t.meta.fields);
  const samples = [];
  for (const r of t.data) {
    const x = Number(r.x), y = Number(r.y), zs = String(r.z ?? "").trim(), z = zs === "" ? null : Number(zs);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const { values, bdl } = valuesOf(r, elements);
    samples.push({ sample_id: String(r.sample_id || "").trim(), x, y, z: Number.isFinite(z) ? z : null, medium: String(r.medium || medium), values, ...(bdl.length ? { bdl } : {}) });
  }
  return { samples, elements };
}

// readFile(relPath) -> File; store: { setAssays, setAssayElements, setSurfaceSamples, setSurfaceElements }. Returns notices.
export async function loadSilvertipExtras(readFile, store, { existingElements = [], existingSurfaceElements = [] } = {}) {
  const notes = [tr("Silvertip survey: the downhole azimuths are grid azimuths (the export names their grid, NAD83 / UTM zone 9N). Magnetic susceptibility is as logged; the export does not state its unit.")];
  try {
    const raw = silvertipAssays(await (await readFile("assays.csv")).text());
    const { rows, elements, converted } = alignAssayUnits(raw.rows, raw.elements, existingElements);
    store.setAssays((prev) => mergeAssayRows(prev || [], rows).rows);
    store.setAssayElements((prev) => { const m = new Map((prev || []).map((e) => [e.symbol, e])); elements.forEach((e) => { if (!m.has(e.symbol)) m.set(e.symbol, e); }); return Array.from(m.values()); });
    notes.push(tr("Silvertip assays: {rows} drill-core samples, {elements} elements (the database's best value per element; Pb, Zn and Cu in %) — in the Geochem tab.{v}", { rows: rows.length.toLocaleString(), elements: elements.length, v: converted.length ? tr(" Converted {list} to the units already in this project.", { list: converted.map((c) => `${c.symbol} ${c.from} → ${c.to}`).join(", ") }) : "" }));
  } catch (e) { notes.push(tr("Silvertip assays could not be loaded: {message}", { message: e.message })); }
  try {
    const all = [], els = new Map();
    const counts = [];
    for (const [file, medium] of SILVERTIP_SURFACE) {
      const r = silvertipSurface(await (await readFile(file)).text(), medium);
      all.push(...r.samples);
      r.elements.forEach((e) => { if (!els.has(e.symbol)) els.set(e.symbol, e); });
      counts.push(`${r.samples.length} ${medium}`);
    }
    // an element already loaded keeps its unit (as the surface import does)
    const unitOf = new Map((existingSurfaceElements || []).map((e) => [e.symbol, e.unit]));
    store.setSurfaceSamples((prev) => mergeSurfaceSamples(prev || [], all).samples);
    store.setSurfaceElements((prev) => { const m = new Map((prev || []).map((e) => [e.symbol, e])); els.forEach((e) => { if (!m.has(e.symbol)) m.set(e.symbol, unitOf.has(e.symbol) ? { ...e, unit: unitOf.get(e.symbol) } : e); }); return Array.from(m.values()); });
    notes.push(tr("Silvertip surface samples: {list} — shown in the 3D View and the Geochem tab.", { list: counts.join(", ") }));
  } catch (e) { notes.push(tr("Silvertip surface samples could not be loaded: {message}", { message: e.message })); }
  return notes;
}
