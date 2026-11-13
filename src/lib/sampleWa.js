// TASKS.csv #3107 — the Western Australian open-file samples added after the BC ones could no longer be bundled (#3100): each is one
// report of the State's WAMEX mineral drillhole database (DEMIRS, CC BY 4.0), re-shaped into tidy CSVs by its own script in
// scripts/samples/. Their collar, survey and interval tables go through the normal import queue (viewer/useImportPipeline.js SAMPLES);
// this module loads the parts that are not drillhole tables: the assays (into Geochem, read with the assay importer's own column
// detection, so oxides stay oxides and LOI stays LOI), surface samples, downhole logs (one numeric layer per channel, as a log import
// makes them) and a grid. Each part is independent: one failing does not stop the others.
import Papa from "papaparse";
import { pickElementColumns, importStoreUnit, readAssayCell, readLoiCell, mergeAssayRows, mergeSurfaceSamples, LOI } from "./geochem.js";
import { alignAssayUnits } from "./sampleWoodjam.js";
import { notice, errorNotice } from "./notices.js";
import { t as tr } from "./i18n.js";

// which -> what its folder holds beside the drillhole tables. label: the sample's short name in notices (project data, English).
export const WA_SAMPLES = {
  wa_iron: {
    dir: "wa_iron", epsg: 28350, label: "WA bedded iron",
    assays: "assays.csv",
    logs: { file: "logs.csv", channels: [["density", "Density (g/cm3)", "g/cm3"], ["gamma", "Natural gamma", ""], ["susceptibility", "Magnetic susceptibility", ""]] },
    grid: { file: "tmi_80m.tif", name: "Total magnetic intensity (Geoscience Australia, 80 m)", method: "mag", units: "nT", source: "Geoscience Australia, Total Magnetic Intensity Grid of Australia 2019, seventh edition, 80 m" },
  },
};

const cellOf = (e, raw) => (e.symbol === LOI ? readLoiCell(raw) : readAssayCell(raw));
// the element columns of a table, as the assay import dialog would offer them with every default taken
function elementsOf(fields, data) {
  return pickElementColumns(fields, data).map((e) => ({ symbol: e.symbol, header: e.header, unit: importStoreUnit(e), checked: true }));
}
function valuesOf(r, elements) {
  const values = {}, qualifiers = {};
  for (const e of elements) {
    const c = cellOf(e, r[e.header]);
    if (c.value == null || !Number.isFinite(c.value)) continue;
    values[e.symbol] = c.value;
    if (c.qualifier) qualifiers[e.symbol] = c.qualifier;
  }
  return { values, qualifiers };
}
const withValues = (elements, rows) => elements.filter((e) => rows.some((r) => r.values?.[e.symbol] != null));

// assays.csv (hole_id, from, to, sample_id, <El>_ppm | <El>_pct | <Oxide>_pct | LOI_pct ...) -> Geochem rows + element list
export function waAssays(text, srcFile = "assays.csv") {
  const t = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  const elements = elementsOf(t.meta.fields, t.data);
  const rows = [];
  for (const r of t.data) {
    const from = Number(r.from), to = Number(r.to), hole = String(r.hole_id || "").trim();
    if (!hole || !Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) continue;
    const { values, qualifiers } = valuesOf(r, elements);
    rows.push({ hole_id: hole, from, to, values, source: "assay", srcFile, ...(Object.keys(qualifiers).length ? { qualifiers } : {}), ...(r.sample_id ? { sample_id: String(r.sample_id).trim() } : {}) });
  }
  return { rows, elements: withValues(elements, rows) };
}

// a surface table (sample_id, x, y, z, medium, <El>_...) -> surface samples + element list
export function waSurface(text, medium) {
  const t = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  const elements = elementsOf(t.meta.fields, t.data);
  const samples = [];
  for (const r of t.data) {
    const x = Number(r.x), y = Number(r.y), zs = String(r.z ?? "").trim(), z = zs === "" ? null : Number(zs);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const { values, qualifiers } = valuesOf(r, elements);
    const bdl = Object.keys(qualifiers).filter((s) => qualifiers[s] === "<");
    samples.push({ sample_id: String(r.sample_id || "").trim(), x, y, z: Number.isFinite(z) ? z : null, medium: String(r.medium || medium), values, ...(bdl.length ? { bdl } : {}) });
  }
  return { samples, elements: withValues(elements, samples) };
}

// logs.csv (hole_id, depth, <channel> ...) -> the point rows { hole_id, depth, value } of one channel; blank cells left out
export function waLog(text, channel) {
  const t = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  const rows = [];
  for (const r of t.data) {
    const hole = String(r.hole_id || "").trim(), depth = Number(r.depth), cell = String(r[channel] ?? "").trim(), value = cell === "" ? NaN : Number(cell);
    if (!hole || !Number.isFinite(depth) || !Number.isFinite(value)) continue;
    rows.push({ hole_id: hole, depth, value });
  }
  return rows;
}

const mergeElements = (prev, elements, unitOf = null) => { const m = new Map((prev || []).map((e) => [e.symbol, e])); elements.forEach((e) => { if (!m.has(e.symbol)) m.set(e.symbol, unitOf?.has(e.symbol) ? { ...e, unit: unitOf.get(e.symbol) } : e); }); return Array.from(m.values()); };

// readFile(relPath) -> File; store: { setAssays, setAssayElements, setSurfaceSamples, setSurfaceElements, addCustomLayer, addRaster };
// project: the open project ({ epsg, crsSet }). -> notices
export async function loadWaSampleExtras(which, readFile, store, { existingElements = [], existingSurfaceElements = [], project = null } = {}) {
  const S = WA_SAMPLES[which], notes = [];
  if (!S) return notes;
  if (S.assays) {
    try {
      const raw = waAssays(await (await readFile(S.assays)).text(), S.assays);
      const { rows, elements, converted } = alignAssayUnits(raw.rows, raw.elements, existingElements);
      store.setAssays((prev) => mergeAssayRows(prev || [], rows).rows);
      store.setAssayElements((prev) => mergeElements(prev, elements));
      notes.push(notice("{name} assays: {rows} samples, {elements} columns ({list}) — in the Geochem tab.{v}", { name: S.label, rows: rows.length.toLocaleString(), elements: elements.length, list: elements.slice(0, 8).map((e) => `${e.symbol} ${e.unit}`).join(", ") + (elements.length > 8 ? " …" : ""),
        v: converted.length ? tr(" Converted {list} to the units already in this project.", { list: converted.map((c) => `${c.symbol} ${c.from} → ${c.to}`).join(", ") }) : "" }));
    } catch (e) { notes.push(errorNotice(tr("The {name} assays could not be loaded: {message}", { name: S.label, message: e.message }))); }
  }
  if (S.surface) {
    try {
      const all = [], els = new Map(), counts = [];
      for (const [file, medium] of S.surface) {
        const r = waSurface(await (await readFile(file)).text(), medium);
        all.push(...r.samples);
        r.elements.forEach((e) => { if (!els.has(e.symbol)) els.set(e.symbol, e); });
        counts.push(`${r.samples.length} ${medium}`);
      }
      const unitOf = new Map((existingSurfaceElements || []).map((e) => [e.symbol, e.unit]));
      store.setSurfaceSamples((prev) => mergeSurfaceSamples(prev || [], all).samples);
      store.setSurfaceElements((prev) => mergeElements(prev, [...els.values()], unitOf));
      notes.push(notice("{name} surface samples: {list} — shown in the 3D View and the Geochem tab.", { name: S.label, list: counts.join(", ") }));
    } catch (e) { notes.push(errorNotice(tr("The {name} surface samples could not be loaded: {message}", { name: S.label, message: e.message }))); }
  }
  if (S.logs) {
    try {
      const text = await (await readFile(S.logs.file)).text(), made = [];
      for (const [channel, name, unit] of S.logs.channels) {
        const rows = waLog(text, channel);
        if (!rows.length) continue;
        store.addCustomLayer({ id: `custom_${which}_${channel}_${Date.now()}`, name, rows, ...(unit ? { unit } : {}) });
        made.push(`${name} (${rows.length.toLocaleString()})`);
      }
      notes.push(notice("{name} downhole logs: {list} — along the holes in the 3D View, in Geophysics > Downhole logs and among the modelling tools' numeric sources.", { name: S.label, list: made.join(", ") }));
    } catch (e) { notes.push(errorNotice(tr("The {name} downhole logs could not be loaded: {message}", { name: S.label, message: e.message }))); }
  }
  if (S.grid) {
    try {
      const projectEpsg = !project || project.crsSet === false || !project.epsg ? S.epsg : Number(project.epsg);
      const { buildRasterImport } = await import("./raster.js");
      const { raster } = await buildRasterImport(await readFile(S.grid.file), { epsg: projectEpsg, sourceEpsg: S.epsg, name: S.grid.name });
      store.addRaster({ ...raster, surveyMethod: S.grid.method, units: S.grid.units, drapeMode: "flat", provenance: { tool: "Bundled sample", source: S.grid.source } });
      notes.push(notice("{name} grid: {grid} — in Maps, and in Geophysics for filters and an inversion against the holes.", { name: S.label, grid: S.grid.name }));
    } catch (e) { notes.push(errorNotice(tr("The {name} grid could not be loaded: {message}", { name: S.label, message: e.message }))); }
  }
  return notes;
}
