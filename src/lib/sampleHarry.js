// TASKS.csv #1124 — the Harry property sample's assays (assay_wide.csv) go into Geochem when the sample is loaded, as
// Woodjam's do (#637). They used to need a second step from the Geochem tab, so Geochem read "No assays loaded" and
// Grade stats, Best intercepts and the 3D assay colouring had nothing to show after "Sample: Harry property".
// The sample's README says below-detection results ("<0.001" in the source) were left blank, so a blank element cell in
// a row that has any result is read as below detection, exactly as the import dialog's "Below detection" choice does
// (#502, #716): '<DL' at half the limit, DL = the column's most common '<x', else its smallest reported value.
import Papa from "papaparse";
import { inferUnit, mergeAssayRows, blankDetectionLimit, isBlankAssayCell, parseAssayValue } from "./geochem.js";
import { alignAssayUnits } from "./sampleWoodjam.js";
import { t as tr } from "./i18n.js";

// assay_wide.csv (hole_id, from, to, <El>_ppm | <El>_pct …) -> { rows, elements, bdlFilled }
export function harryAssays(text, srcFile = "assay_wide.csv") {
  const t = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  const elements = t.meta.fields.map((h) => { const m = /^([A-Z][a-z]?)_(ppm|pct)$/.exec(h); return m ? { symbol: m[1], header: h, unit: inferUnit(h, m[1]), checked: true } : null; }).filter(Boolean);
  const limits = new Map(elements.map((e) => [e.symbol, blankDetectionLimit(t.data.map((r) => r[e.header])).limit]));
  const rows = [];
  let bdlFilled = 0;
  for (const r of t.data) {
    const from = Number(r.from), to = Number(r.to), hole = String(r.hole_id || "").trim();
    if (!hole || !Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) continue;
    const anyResult = elements.some((e) => !isBlankAssayCell(r[e.header]));
    const values = {}, qualifiers = {};
    for (const e of elements) {
      const cell = r[e.header];
      if (isBlankAssayCell(cell)) {
        const L = limits.get(e.symbol);
        if (anyResult && L) { values[e.symbol] = L / 2; qualifiers[e.symbol] = "<"; bdlFilled++; }
        continue;
      }
      const v = parseAssayValue(cell);
      if (v != null && Number.isFinite(v) && v >= 0) values[e.symbol] = v;
    }
    rows.push({ hole_id: hole, from, to, values, source: "assay", srcFile, ...(Object.keys(qualifiers).length ? { qualifiers } : {}) });
  }
  return { rows, elements, bdlFilled };
}

// readFile(relPath) -> File; store: { setAssays, setAssayElements } -> notes
export async function loadHarryAssays(readFile, store, { existingElements = [] } = {}) {
  try {
    const raw = harryAssays(await (await readFile("assay_wide.csv")).text());
    const { rows, elements, converted } = alignAssayUnits(raw.rows, raw.elements, existingElements); // #722 — the project's units
    store.setAssays((prev) => mergeAssayRows(prev || [], rows).rows);
    store.setAssayElements((prev) => { const m = new Map((prev || []).map((e) => [e.symbol, e])); elements.forEach((e) => { if (!m.has(e.symbol)) m.set(e.symbol, e); }); return Array.from(m.values()); });
    return [tr("Harry assays: {rows} samples, {elements} elements — in the Geochem tab. {bdl} blank results read as below detection (half the column's detection limit), as the sample's README says they are.{v}", { rows: rows.length.toLocaleString(), elements: elements.length, bdl: raw.bdlFilled.toLocaleString(), v: converted?.length ? ` ${tr("Converted to this project's units: {v}.", { v: converted.map((c) => `${c.symbol} ${c.from} → ${c.to}`).join(", ") })}` : "" })];
  } catch (e) { return [tr("Harry assays could not be loaded: {message}", { message: e.message })]; }
}
