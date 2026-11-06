// TASKS.csv #1523 — the project's lead commodity for a tool's opening element (see leadCommodity): from the drillhole assays when there
// are any, else the surface samples. Cached per table, so a tool opening on Lawyers (83,670 assays, ~160 ms) pays it once per data change.
import { useStore } from "./store.jsx";
import { leadCommodity } from "./preferredElement.js";
import { valueIn } from "./geochem.js";

const cache = new WeakMap(); // the rows array -> its lead (or null)

export function leadFor(rows, elements) {
  if (!Array.isArray(rows) || !rows.length) return null;
  if (cache.has(rows)) return cache.get(rows);
  const units = Object.fromEntries((elements || []).map((e) => [e.symbol, e.unit]));
  const lead = leadCommodity(rows, (s, sym) => valueIn(s, sym, "ppm", units));
  cache.set(rows, lead);
  return lead;
}

export function useLeadCommodity() {
  const { assays = [], assayElements = [], surfaceSamples = [], surfaceElements = [] } = useStore() || {};
  return leadFor(assays, assayElements) || leadFor(surfaceSamples, surfaceElements);
}
