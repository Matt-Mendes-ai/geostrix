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

// the Result step of the surface tools (Strat. stack, Implicit surface, Structural modelling): the surfaces of the newest run (they share params.runId, #1101) in
// numbers. surfaces: the generated surfaces, oldest first; only: which surface a run is looked up by (default: any) -> { runId, n, names, typicalMissM (the median of
// the surfaces' typical misses), worstMissM, left, of } | null
export function runResult(surfaces, only = () => true) {
  const list = surfaces || [];
  const last = [...list].reverse().find((s) => s?.params?.runId && only(s));
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
// the Strat. stack's own: a run is looked up by its stratigraphic contacts
export const stackResult = (surfaces) => runResult(surfaces, (s) => s.type === "stratigraphic_contact");

// the Vein / dyke pane's Result step: the newest vein landing (its walls and solid share one record, params.generatedAt) in numbers -> { key, target, surfaces,
// intercepts, meanM, minM, maxM, dip, dipDir, shape, source, rmsM, pinchOut } | null
export function veinResult(surfaces) {
  const v = (surfaces || []).filter((s) => String(s?.params?.tool || "").startsWith("vein/dyke"));
  if (!v.length) return null;
  const p = v[v.length - 1].params;
  return { key: p.generatedAt || null, target: p.target, surfaces: v.filter((s) => s.params.generatedAt === p.generatedAt && s.params.target === p.target).length,
    intercepts: p.intercepts, meanM: p.trueThicknessMeanM, minM: p.trueThicknessMinM, maxM: p.trueThicknessMaxM, dip: p.dip, dipDir: p.dipDir, shape: p.shape,
    source: p.attitudeSource, rmsM: p.contactResidualRmsM, pinchOut: !!p.pinchOut };
}

// the Alteration pane's Result step: the newest halo or unit body (indicator envelope) -> { key, target, samples, altered, farShare, beyondShare, closure,
// cellM, searchM } | null (the shares: 0..1, null when the run did not measure them)
export function alterationResult(surfaces) {
  const v = (surfaces || []).filter((s) => /^(alteration halo|unit body)/.test(String(s?.params?.tool || "")));
  if (!v.length) return null;
  const p = v[v.length - 1].params;
  return { key: p.generatedAt || null, target: p.target, samples: p.samplePoints ?? null, altered: p.alteredSamplePoints ?? null,
    farShare: Number.isFinite(p.farFromLogs?.share) ? p.farFromLogs.share : null, beyondShare: Number.isFinite(p.beyondDrilling?.share) ? p.beyondDrilling.share : null,
    closure: p.closure || null, cellM: p.cellSizeM ?? null, searchM: p.searchRadiusM ?? null };
}

// the Undrilled zones pane's Result step (#4070 part 3): a run's numbers -> { coveredPct, unitV, openV, zones, ignoredZones, drilled, planned } | null.
// result: the pane's run (unitCells, coveredCells, cellVolume, uncoveredCells, ignored { cells, zones }, zones [], holes { drilled, planned }): volumes in m3
export function undrilledNumbers(result) {
  if (!result || !(result.unitCells > 0)) return null;
  const cv = result.cellVolume || 0;
  return { coveredPct: (100 * result.coveredCells) / Math.max(1, result.unitCells), unitV: result.unitCells * cv, openV: Math.max(0, (result.uncoveredCells - (result.ignored?.cells || 0)) * cv),
    zones: result.zones?.length || 0, ignoredZones: result.ignored?.zones || 0, drilled: result.holes?.drilled || 0, planned: result.holes?.planned || 0 };
}
