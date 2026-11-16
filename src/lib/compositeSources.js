// TASKS.csv #3584 (follow-up of #3567) — Best intercepts took only the assay table, so a news-release table could not be cut on the composites that
// Compositing's 'Keep as a layer in the project' adds (a numeric layer: value = the first element, one field per element, the coverage, the density).
//
// TASKS.csv #3744 (Scottie Gold review; regression of #3584) — the kept layers' rows were MIXED INTO the raw assay table for every element: after
// keeping a 2 m Au layer, 'Au (g/t)' read '19575 intervals loaded' (9,777 assays + 9,798 composites), the raw rows were cut at the composites'
// boundaries (one 5.10 m intercept split in two, 164 -> 165 intercepts) and 'Samples >= cutoff' changed on 102 of 164 rows. And (#3750) the layer was
// one 'element' named for all its elements ('Composites 2 m: Au Ag Cu (ppm)'), only its first could be cut.
//
// Now each kept layer is a SOURCE of its own: one element per composited element, named '<El> (<n> m composites)' in that element's unit, all of the
// layer's elements on the same intervals (so 'Also show' averages the composites, not the raw assays); Best intercepts reads the chosen source's
// rows only, and the raw assay table never sees them. Pure.
import { sourceAssays, CUSTOM_UNIT } from "./numericSources.js";
import { isTable, rowCount, fieldOf, fieldNames } from "./layerColumns.js";
import { rowsRefOf } from "./tableFields.js";

export const isCompositeLayer = (c) => !!c && /^Composites of /.test(String(c.notes || "")) && c.sourceModel == null;

// the layer's composited elements, in order: 'Composites of Au, Ag, Cu at 2 m, ...' (the notes Compositing writes), else the value field alone
function layerElements(c) {
  const m = /^Composites of (.+?) at ([\d.]+) m\b/.exec(String(c.notes || ""));
  const els = m ? m[1].split(/,\s*/).map((s) => s.trim()).filter(Boolean) : [];
  return { els, lengthM: m ? Number(m[2]) : null };
}

// -> { sources: [{ layerId, layerName, lengthM, elements: [{ symbol, unit, element, field }], assays }], bySymbol: Map(symbol -> source) }
export function compositeSources(customLayers) {
  const sources = [], bySymbol = new Map(), used = new Set();
  for (const c of customLayers || []) {
    if (!isCompositeLayer(c)) continue;
    const { els, lengthM } = layerElements(c);
    const fields = els.length ? els.map((el, i) => ({ element: el, field: i === 0 && !rowsHaveField(c, el) ? "value" : el, first: i === 0 })) : [{ element: String(c.valueField || c.name), field: "value", first: true }];
    const tag = lengthM != null ? `${lengthM} m composites` : "composites";
    const elements = [], byKey = new Map(), assays = [];
    for (const { element, field, first } of fields) {
      let symbol = `${element} (${tag})`;
      for (let k = 2; used.has(symbol); k++) symbol = `${element} (${tag}, ${k})`; // two kept layers of the same element and length
      const unit = String(c.fieldUnits?.[field] || (first || element === c.valueField ? c.unit : "") || CUSTOM_UNIT); // the layer's unit is its first element's
      const r = sourceAssays({ symbol, unit, field, layerId: c.id, key: `custom:${c.id}:${field}` }, { customLayers });
      if (!r.assays.length) continue;
      used.add(symbol);
      elements.push({ symbol, unit, element, field });
      // one row per composite interval, carrying every element of the layer
      for (const a of r.assays) {
        const key = `${a.hole_id}\u0001${a.from}\u0001${a.to}`;
        let row = byKey.get(key);
        if (!row) { row = { hole_id: a.hole_id, from: a.from, to: a.to, values: {}, source: "composite" }; byKey.set(key, row); assays.push(row); }
        row.values[symbol] = a.values[symbol];
      }
    }
    if (!elements.length) continue;
    const src = { layerId: c.id, layerName: String(c.name), lengthM, elements, assays };
    sources.push(src);
    for (const e of elements) bySymbol.set(e.symbol, src);
  }
  return { sources, bySymbol };
}
// a layer written before its element fields were named in the notes keeps the first element in 'value' only
function rowsHaveField(c, f) {
  const rows = rowsRefOf(c);
  if (!rows) return false;
  if (isTable(rows)) return fieldNames(rows).includes(f);
  const get = fieldOf(rows, f), n = Math.min(rowCount(rows), 50);
  for (let i = 0; i < n; i++) if (get(i) != null) return true;
  return false;
}
