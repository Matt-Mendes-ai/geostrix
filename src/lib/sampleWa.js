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
import { MACPASS_CREDIT } from "./sampleCredits.js"; // TASKS.csv #3496
// TASKS.csv #3539 (Fireweed rehearsal) — the extras load beside the import queue (one status-bar slot: the queue's label wins while it
// runs): their own label is set again before each step and kept until the main thread is quiet (lib/busyUntilQuiet.js), and the
// assays step yields between its parse, its unit alignment and its commit (three tasks, not one).
import { whenQuiet, showBusy } from "./busyUntilQuiet.js";
const nextTask = () => new Promise((r) => setTimeout(r, 0));

// which -> what its folder holds beside the drillhole tables. label: the sample's short name in notices (project data, English).
export const WA_SAMPLES = {
  wa_iron: {
    dir: "wa_iron", epsg: 28350, label: "WA bedded iron",
    assays: "assays.csv",
    logs: { file: "logs.csv", channels: [["density", "Density (g/cm3)", "g/cm3"], ["gamma", "Natural gamma", ""], ["susceptibility", "Magnetic susceptibility", ""]] },
    grid: { file: "tmi_80m.tif", name: "Total magnetic intensity (Geoscience Australia, 80 m)", method: "mag", units: "nT", source: "Geoscience Australia, Total Magnetic Intensity Grid of Australia 2019, seventh edition, 80 m" },
  },
  wa_lead_zinc: { dir: "wa_lead_zinc", epsg: 28352, label: "WA lead-silver-zinc", assays: "assays.csv" },
  wa_zinc_copper: { dir: "wa_zinc_copper", epsg: 28350, label: "WA zinc-copper", assays: "assays.csv", surface: [["soils.csv", "soil"], ["streams.csv", "stream sediment"]] },
  wa_gold: { dir: "wa_gold", epsg: 28351, label: "WA lode gold", assays: "assays.csv" },
  // TASKS.csv #2006 — GeoMet (CC BY 4.0): a local grid, no CRS; only its assays are loaded here (the collars and the reconstructed survey go through the import queue)
  geomet: { dir: "geomet", epsg: null, label: "GeoMet", assays: "assays.csv" },
  // TASKS.csv #3496 — Fireweed Metals' Macpass drilling, used with their permission: Ag in ppm, Pb and Zn in %; the credit is kept with the project (Layout prints it)
  yk_macpass: { dir: "yk_macpass", epsg: 26909, label: "Macpass", assays: "assays.csv", credit: MACPASS_CREDIT, showFirst: "Zn" /* #3588 (1) */ },
  // Century (Geological Survey of Queensland, CC BY 4.0): the same parts as a WA sample, from Queensland's database
  // TASKS.csv #4056 / #4094 — the Geoscience Queensland samples (CC BY 4.0): their geophysics and mapping files stay in the folder for the user to open. Black Mountain writes below detection as 0 (README): read as "<" at half the column's smallest reading
  gsq_cloncurry: { dir: "gsq_cloncurry", epsg: 28354, label: "Cloncurry", assays: "assays.csv", surface: [["soils.csv", "soil"], ["rocks.csv", "rock chip"]] },
  gsq_carbo_creek: { dir: "gsq_carbo_creek", epsg: 28354, label: "Carbo Creek", assays: "assays.csv" },
  gsq_altia_south: { dir: "gsq_altia_south", epsg: 28354, label: "Altia South", assays: "assays.csv", surface: [["rocks.csv", "rock chip"]] },
  gsq_black_mountain: { dir: "gsq_black_mountain", epsg: 20255, label: "Black Mountain", assays: "assays.csv", zeroBdl: true },
  gsq_edinburgh_park: { dir: "gsq_edinburgh_park", epsg: 28355, label: "Edinburgh Park", assays: "assays.csv", surface: [["soils.csv", "soil"], ["rocks.csv", "rock chip"], ["streams.csv", "stream sediment"]] },
  qld_century: {
    dir: "qld_century", epsg: 7854, label: "Century", assays: "assays.csv", surface: [["soils.csv", "soil"]],
    grid: { file: "tmi_80m.tif", name: "Total magnetic intensity (Geoscience Australia, 80 m)", method: "mag", units: "nT", source: "Geoscience Australia, Total Magnetic Intensity Grid of Australia 2019, seventh edition, 80 m" },
  },
};

const cellOf = (e, raw) => (e.symbol === LOI ? readLoiCell(raw) : readAssayCell(raw));
// the element columns of a table, as the assay import dialog would offer them with every default taken. The tables' own fixed columns are
// left out first: a surface table's "y" (northing) reads as yttrium by its name, and took the place of the real Y_ppm column.
const FIXED = new Set(["hole_id", "from", "to", "sample_id", "x", "y", "z", "medium"]);
function elementsOf(fields, data) {
  return pickElementColumns(fields.filter((f) => !FIXED.has(f)), data).map((e) => ({ symbol: e.symbol, header: e.header, unit: importStoreUnit(e), checked: true }));
}
function valuesOf(r, elements, zl = null) {
  const values = {}, qualifiers = {};
  for (const e of elements) {
    const L = zl?.get(e.header);
    const c = L > 0 && e.symbol !== LOI && String(r[e.header] ?? "").trim() !== "" && Number(r[e.header]) === 0 ? readAssayCell(`<${L}`) : cellOf(e, r[e.header]); // zl: a 0 is below detection
    if (c.value == null || !Number.isFinite(c.value)) continue;
    values[e.symbol] = c.value;
    if (c.qualifier) qualifiers[e.symbol] = c.qualifier;
  }
  return { values, qualifiers };
}
const withValues = (elements, rows) => elements.filter((e) => rows.some((r) => r.values?.[e.symbol] != null));

// assays.csv (hole_id, from, to, sample_id, <El>_ppm | <El>_pct | <Oxide>_pct | LOI_pct ...) -> Geochem rows + element list
// TASKS.csv #3649 — the rows of a parsed table are built by assayRowsOf, which waAssays does in one go and waAssaysSliced in slices.
function assayRowsOf(data, elements, srcFile, rows, a, b, zl = null) {
  for (let i = a; i < b; i++) {
    const r = data[i];
    const from = Number(r.from), to = Number(r.to), hole = String(r.hole_id || "").trim();
    if (!hole || !Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) continue;
    const { values, qualifiers } = valuesOf(r, elements, zl);
    rows.push({ hole_id: hole, from, to, values, source: "assay", srcFile, ...(Object.keys(qualifiers).length ? { qualifiers } : {}), ...(r.sample_id ? { sample_id: String(r.sample_id).trim() } : {}) });
  }
}
export function waAssays(text, srcFile = "assays.csv") {
  const t = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  const elements = elementsOf(t.meta.fields, t.data);
  const rows = [];
  assayRowsOf(t.data, elements, srcFile, rows, 0, t.data.length);
  return { rows, elements: withValues(elements, rows) };
}
// TASKS.csv #3649 — the same result as waAssays, in slices: the CSV is parsed ~PARSE_CHUNK characters at a time (Papa's chunk mode, paused
// and resumed after a task break) and the rows are built ROW_SLICE at a time, so the sample load's longest main-thread task is a slice, not the
// whole ~1 MB table (~280 ms measured on Macpass). yieldTask() is the break (a setTimeout 0 by default).
export const PARSE_CHUNK = 128 * 1024, ROW_SLICE = 1500;
// a column's smallest positive reading: the detection limit given to its zeros when a sample writes "below detection" as 0 (zeroBdl)
const zeroLimits = (data, elements) => new Map(elements.map((e) => { let L = Infinity; for (const r of data) { const x = Number(String(r[e.header] ?? "").trim() === "" ? NaN : r[e.header]); if (x > 0 && x < L) L = x; } return [e.header, L]; }).filter(([, L]) => Number.isFinite(L)));
export async function waAssaysSliced(text, srcFile = "assays.csv", yieldTask = nextTask, { zeroBdl = false } = {}) {
  const data = []; let fields = null;
  await new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true, skipEmptyLines: true, dynamicTyping: false, chunkSize: PARSE_CHUNK,
      chunk: (res, parser) => {
        if (!fields) fields = res.meta.fields;
        for (const r of res.data) data.push(r);
        parser.pause();
        yieldTask().then(() => parser.resume(), reject);
      },
      complete: () => resolve(),
      error: reject,
    });
  });
  const elements = elementsOf(fields || [], data);
  const zl = zeroBdl ? zeroLimits(data, elements) : null;
  await yieldTask();
  const rows = [];
  for (let a = 0; a < data.length; a += ROW_SLICE) {
    assayRowsOf(data, elements, srcFile, rows, a, Math.min(data.length, a + ROW_SLICE), zl);
    await yieldTask();
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
    if (!Number.isFinite(x) || !Number.isFinite(y) || String(r.x ?? "").trim() === "" || String(r.y ?? "").trim() === "") continue; // a blank coordinate is not 0 (#4094: Edinburgh Park's 43 standards have none and landed at 0, 0, millions of metres away)
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
  const label = tr("Loading the {name} sample's assays and extras…", { name: S.label }); // #3539
  showBusy(store.setTaskProgress, label);
  try {
  if (S.credit && typeof store.setProjectDataCredit === "function") store.setProjectDataCredit(S.credit); // #3496 — saved with the project; Layout's {credits} prints it
  if (S.assays) {
    try {
      const text = await (await readFile(S.assays)).text();
      showBusy(store.setTaskProgress, label); // #3539 — again: the queue's label may have replaced it
      const raw = S.zeroBdl ? await waAssaysSliced(text, S.assays, nextTask, { zeroBdl: true }) : await waAssaysSliced(text, S.assays); // #3649 — in slices; zeroBdl: #4094
      const { rows, elements, converted } = alignAssayUnits(raw.rows, raw.elements, existingElements);
      await nextTask(); // #3539
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
      notes.push(notice("{name} surface samples: {list} — shown in StrixViewer and the Geochem tab.", { name: S.label, list: counts.join(", ") }));
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
      notes.push(notice("{name} downhole logs: {list} — along the holes in StrixViewer, in Geophysics > Downhole logs and among the modelling tools' numeric sources.", { name: S.label, list: made.join(", ") }));
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
  } finally {
    showBusy(store.setTaskProgress, label); // #3539 — shown while the builds these commits start run
    await whenQuiet(); // then it goes (only ours: a later task's label stays)
    store.setTaskProgress?.((cur) => (cur && cur.label === label ? null : cur));
  }
  return notes;
}
