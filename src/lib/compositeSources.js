// TASKS.csv #3584 (follow-up of #3567) — Best intercepts took only the assay table, so a news-release table could not be cut on the composites that
// Compositing's 'Keep as a layer in the project' adds (a numeric layer: value = the first element, one field per element, the coverage, the density).
// Each such layer is offered as one element of Best intercepts: its value (the first element) in the layer's own unit, as assay-shaped intervals of
// the composite's own length (numericSources.sourceAssays), named by the layer ('Composites 2 m: Au Cu'). Pure.
import { sourceAssays, CUSTOM_UNIT } from "./numericSources.js";

export const isCompositeLayer = (c) => !!c && /^Composites of /.test(String(c.notes || "")) && c.sourceModel == null;

// -> { assays, assayElements, sources: [{ symbol, unit, layerId, n }] }
export function compositeSourceAssays(customLayers) {
  const assays = [], assayElements = [], sources = [];
  for (const c of customLayers || []) {
    if (!isCompositeLayer(c)) continue;
    const symbol = String(c.name), unit = c.unit ? String(c.unit) : CUSTOM_UNIT;
    const r = sourceAssays({ symbol, unit, field: "value", layerId: c.id, key: `custom:${c.id}:value` }, { customLayers });
    if (!r.assays.length) continue;
    assays.push(...r.assays);
    assayElements.push({ symbol, unit });
    sources.push({ symbol, unit, layerId: c.id, n: r.assays.length });
  }
  return { assays, assayElements, sources };
}
