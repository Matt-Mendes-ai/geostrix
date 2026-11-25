// TASKS.csv #4070 — the 3D Modelling panes as steps; the Grade shell and the Strat. stack first (Matt's layout C, "steps, like the Guide", 2026-11-24): the numbers each step shows, kept pure so they
// are tested apart from the pane (test/stepPane4070.test.mjs).
import { arrMax } from "./arrayStats.js"; // #371 — no spread into Math.max
//   1 Element  — the elements with a lab value, most samples first, with their counts
//   2 Cut-off  — quick values from the samples (P75, P90 the suggested one, P95) and the share of samples at or above a cut-off
//   3 Shape    — one choice over two settings the run already reads (shellMode, shellPlaneSearch)
//   4 Result   — the run's own record (params) in numbers: composites inside, the share beyond the drilling, the surface's data support

// rows: assay rows { values: { [symbol]: number } }; symbols: the elements to count -> [{ symbol, n }], most samples first (ties keep the given order)
export function elementCounts(rows, symbols) {
  const n = new Map((symbols || []).map((s) => [s, 0]));
  for (const r of rows || []) for (const s of n.keys()) if (Number.isFinite(r?.values?.[s])) n.set(s, n.get(s) + 1);
  return [...n].map(([symbol, k], i) => ({ symbol, n: k, i })).sort((a, b) => b.n - a.n || a.i - b.i).map(({ symbol, n: k }) => ({ symbol, n: k }));
}

// the positive values, sorted -> { p75, p90, p95 } at 3 significant figures (P90: the same rank the pane's proposal uses), null when there are none
export function quickCutoffs(sorted) {
  const v = (sorted || []).filter((x) => Number.isFinite(x) && x > 0);
  if (!v.length) return null;
  const at = (q) => +v[Math.floor(q * (v.length - 1))].toPrecision(3);
  return { p75: at(0.75), p90: at(0.9), p95: at(0.95) };
}

// the share (0..1) of the values at or above the cut-off; null without values or a cut-off
export function shareAbove(values, cutoff) {
  const v = (values || []).filter(Number.isFinite);
  if (!v.length || !Number.isFinite(cutoff)) return null;
  return v.filter((x) => x >= cutoff).length / v.length;
}

// step 3: the shape the two settings give, and the settings a shape sets. Tight along the composites' plane is the default (Matt, 2026-11-20; #3655):
// "trend". "auto" (per drilled area, #3673) is not one of the three; it stays in Fine-tune's Shell list and reads back as "auto".
export const SHELL_SHAPES = ["tight", "smooth", "trend"];
export function shapeOf(shellMode, planeSearch) {
  if (shellMode === "envelope") return "smooth";
  if (shellMode === "tight") return planeSearch ? "trend" : "tight";
  return "auto";
}
export function shapeSettings(shape) {
  if (shape === "smooth") return { shellMode: "envelope" };
  if (shape === "tight") return { shellMode: "tight", planeSearch: false };
  if (shape === "trend") return { shellMode: "tight", planeSearch: true };
  return { shellMode: "auto" };
}

// step 4: the numbers of one shell from its record. surface: { params: { compositesInShell, beyondDrilling, ... }, surfaceSupportCounts }; volume: { volumeM3,
// watertight } or null. -> { inside, above, insideLow, beyond, beyondLevel, interpolated, volumeM3, open }
export function shellResult(surface, volume) {
  const p = surface?.params || {};
  const cs = p.compositesInShell || null;
  const sc = surface?.surfaceSupportCounts || p.surfaceSupportCounts || null;
  const total = sc ? Object.values(sc).reduce((t, x) => t + (Number(x) || 0), 0) : 0;
  const beyond = Number.isFinite(p.beyondDrilling?.share) ? p.beyondDrilling.share : null;
  return {
    inside: cs ? cs.inside : null, above: cs ? cs.above : null, insideLow: !!(cs && cs.above && cs.inside * 2 < cs.above),
    beyond, beyondLevel: beyond == null ? null : beyond >= 0.5 ? "high" : beyond >= 0.05 ? "some" : "low", // the run's own thresholds (#2757: a notice from 5 %, an error from 50 %)
    interpolated: total ? (Number(sc.interpolated) || 0) / total : null,
    volumeM3: volume && volume.watertight && Number.isFinite(volume.volumeM3) ? volume.volumeM3 : null, open: !!volume && !volume.watertight,
  };
}

// the Strat. stack's Result step: the surfaces of the newest run (they share params.runId, #1101) in numbers. surfaces: the generated surfaces, oldest
// first -> { runId, n, names, typicalMissM (the median of the surfaces' typical misses), worstMissM, left, of } | null
export function stackResult(surfaces) {
  const list = surfaces || [];
  const last = [...list].reverse().find((s) => s?.params?.runId && s.type === "stratigraphic_contact");
  if (!last) return null;
  const run = list.filter((s) => s?.params?.runId === last.params.runId);
  const fits = run.map((s) => s.params.contactFit).filter(Boolean);
  const typ = fits.map((f) => f.typicalMissM).filter(Number.isFinite).sort((a, b) => a - b);
  const worst = fits.map((f) => f.worstMissM).filter(Number.isFinite);
  const left = run.reduce((t, s) => t + (s.params.contactsWithoutSurface?.left || 0), 0);
  const of = run.reduce((t, s) => t + (s.params.contactsWithoutSurface?.of || s.params.contactFit?.points || 0), 0);
  return { runId: last.params.runId, n: run.length, names: run.map((s) => s.name), typicalMissM: typ.length ? typ[Math.floor((typ.length - 1) / 2)] : null,
    worstMissM: worst.length ? arrMax(worst) : null, left, of };
}
