// TASKS.csv #3794 — the model's top cut as CSV cells (and a record for a pit's / stope's params): 'top_cut' (the cap, or 'none'), 'top_cut_samples', 'top_cut_pct_metal_removed'.
// Nothing for a model that carries no estimate record. Pure.
import { topCutOf } from "./topCutNote.js";

export function topCutCells(params) {
  const t = topCutOf(params);
  if (!t) return {};
  if (t.kind === "uncapped") return { top_cut: "none" };
  return { top_cut: t.cap, ...(t.nCapped != null ? { top_cut_samples_cut: t.nCapped, top_cut_samples: t.nSamples } : {}), ...(t.pctMetal != null ? { top_cut_pct_metal_removed: Math.round(t.pctMetal * 10) / 10 } : {}) };
}
export const topCutRecord = (params) => { const t = topCutOf(params); return t ? { kind: t.kind, ...(t.kind === "capped" ? { cap: t.cap, nCapped: t.nCapped, nSamples: t.nSamples, pctMetalRemoved: t.pctMetal } : {}) } : null; };
