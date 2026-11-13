// TASKS.csv #2950 (review #2876, WA iron) — the inversion's drillhole constraint (#323) and the geology-model test (#760) read the built-in
// Mag. susc. / Specific gravity layers only: the project's 475,849 susceptibility and 484,531 density bins, imported by the log route (#2160)
// as custom layers ('downhole_logs: Suscep_Best', 'downhole_logs: Density_Best'), were '0 rows'. The logs that can constrain a method are the
// built-in layer, then every numeric custom log (numericSourceChoices, no model evaluations), those whose name says the property first; the
// default is the built-in layer when it has readings, else the first custom log named for the property, else none (the user picks). Pure.
import { numericSourceChoices } from "./numericSources.js";

export const SUSC_NAME = /susc|mag[\s._-]*sus|\bms\b|kappa/i;
export const DENS_NAME = /dens|\bsg\b|specific[\s._-]*grav|bulk/i;
const num = (v) => (typeof v === "number" ? v : v == null || v === "" ? NaN : Number(v));

// -> [{ key, label, n, builtIn, named, rows() -> [{ hole_id, from, to, depth, value }] }]
export function inversionLogSources({ layers = {}, customLayers = [] } = {}, method) {
  const builtKey = method === "grav" ? "sg" : "magsusc", re = method === "grav" ? DENS_NAME : SUSC_NAME;
  const out = [];
  const own = layers?.[builtKey] || [];
  if (own.length) out.push({ key: `layer:${builtKey}`, label: method === "grav" ? "Specific gravity" : "Mag. susc.", n: own.length, builtIn: true, named: true, rows: () => own });
  const custom = numericSourceChoices({ layers: {}, customLayers, models: false }).filter((s) => s.layerId != null);
  const byId = new Map((customLayers || []).map((c) => [c.id, c]));
  const items = custom.map((s) => {
    const L = byId.get(s.layerId);
    return {
      key: s.key, label: s.label, n: s.n, builtIn: false, named: re.test(s.label), unit: s.unit,
      rows: () => (L?.rows || []).map((r) => ({ hole_id: r.hole_id, from: num(r.from), to: num(r.to), depth: num(r.depth), value: r[s.field] })),
    };
  });
  items.sort((a, b) => Number(b.named) - Number(a.named)); // stable: numericSourceChoices' order (imported logs first, then by count) within each
  return [...out, ...items];
}
export function defaultLogSource(sources) {
  return sources.find((s) => s.builtIn) || sources.find((s) => s.named) || null;
}
// the readings a project has for each property: the built-in layer plus the custom logs named for it (the empty state, the status line)
export function logReadingCounts({ layers = {}, customLayers = [] } = {}) {
  const named = (re) => numericSourceChoices({ layers: {}, customLayers, models: false }).filter((s) => s.layerId != null && s.field === "value" && re.test(s.label)).reduce((a, s) => a + s.n, 0);
  return { ms: (layers?.magsusc || []).length + named(SUSC_NAME), sg: (layers?.sg || []).length + named(DENS_NAME) };
}
