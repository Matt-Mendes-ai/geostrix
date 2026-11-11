// TASKS.csv #2168 — the parts of the Western Australian palaeochannel-uranium sample (sample_data/wa_uranium, WAMEX report A87304) that
// are not drillhole tables: the multi-element assays (into Geochem) and the downhole gamma log, loaded the way a log import makes it
// (TASKS.csv #2160 / #2342): one numeric point layer per channel with its unit, eU3O8 (ppm) and the raw counts (cps), drawn along the
// holes in the 3D View, offered by the Downhole Logs pane and the numeric sources of the modelling tools (lib/numericSources.js). The
// collar, survey, lithology, alteration and weathering CSVs go through the normal import queue like the other samples'. Each part is
// independent.
import Papa from "papaparse";
import { mergeAssayRows } from "./geochem.js";
import { silvertipAssays } from "./sampleSilvertip.js"; // the same hole_id / from / to / sample_id / <El>_ppm | <El>_pct layout
import { alignAssayUnits } from "./sampleWoodjam.js";
import { t as tr } from "./i18n.js";

export const WA_URANIUM_EPSG = 28351; // GDA94 / MGA zone 51 — the company's MGA_East / MGA_North / MGA_RL
export const WA_URANIUM_GAMMA_LAYER = "Gamma eU3O8 (ppm)";
export const WA_URANIUM_CPS_LAYER = "Gamma raw (cps)"; // TASKS.csv #2342 — its own channel, as a log import makes it

// gamma.csv (hole_id, depth, raw_cps, eU3O8_ppm) -> custom point rows { hole_id, depth, value } of one channel: "eU3O8_ppm" (the default;
// negative values left out) or "raw_cps" (#2342: it was a field buried in the eU3O8 rows)
export function waUraniumGamma(text, channel = "eU3O8_ppm") {
  const t = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  const rows = [];
  for (const r of t.data) {
    const hole = String(r.hole_id || "").trim(), depth = Number(r.depth), cell = String(r[channel] ?? "").trim(), value = cell === "" ? NaN : Number(cell);
    if (!hole || !Number.isFinite(depth) || !Number.isFinite(value) || value < 0) continue;
    rows.push({ hole_id: hole, depth, value });
  }
  return rows;
}

// readFile(relPath) -> File; store: { setAssays, setAssayElements, addCustomLayer({ id, name, rows }) }. Returns notices.
export async function loadWaUraniumExtras(readFile, store, { existingElements = [] } = {}) {
  const notes = [tr("WA uranium survey: every hole was drilled vertically (one station per hole, dip -90); collars are MGA94 zone 51 with the company's RL. The gamma eU3O8 is the probe's equivalent uranium, not an assay.")];
  try {
    const raw = silvertipAssays(await (await readFile("assays.csv")).text());
    const { rows, elements, converted } = alignAssayUnits(raw.rows, raw.elements, existingElements);
    store.setAssays((prev) => mergeAssayRows(prev || [], rows).rows);
    store.setAssayElements((prev) => { const m = new Map((prev || []).map((e) => [e.symbol, e])); elements.forEach((e) => { if (!m.has(e.symbol)) m.set(e.symbol, e); }); return Array.from(m.values()); });
    notes.push(tr("WA uranium assays: {rows} aircore and core samples, {elements} elements (one lab method per sample; Fe, Ca, K and Al in %) — in the Geochem tab.{v}", { rows: rows.length.toLocaleString(), elements: elements.length, v: converted.length ? tr(" Converted {list} to the units already in this project.", { list: converted.map((c) => `${c.symbol} ${c.from} → ${c.to}`).join(", ") }) : "" }));
  } catch (e) { notes.push(tr("WA uranium assays could not be loaded: {message}", { message: e.message })); }
  try {
    const text = await (await readFile("gamma.csv")).text();
    const rows = waUraniumGamma(text), cps = waUraniumGamma(text, "raw_cps");
    store.addCustomLayer({ id: `custom_wa_gamma_${Date.now()}`, name: WA_URANIUM_GAMMA_LAYER, rows, unit: "ppm" }); // unit: TASKS.csv #2421 — eU3O8 ppm, as a downhole-log import keeps it
    if (cps.length) store.addCustomLayer({ id: `custom_wa_cps_${Date.now()}`, name: WA_URANIUM_CPS_LAYER, rows: cps, unit: "cps" }); // #2342 — the raw counts, the second channel
    notes.push(tr("WA uranium gamma log: {rows} eU3O8 readings (every 0.5 m, cased probe) added as the custom layer \"{name}\" — along the holes in the 3D View, and a log in Downhole Logs and the modelling tools' numeric sources.", { rows: rows.length.toLocaleString(), name: WA_URANIUM_GAMMA_LAYER }));
  } catch (e) { notes.push(tr("WA uranium gamma log could not be loaded: {message}", { message: e.message })); }
  return notes;
}
