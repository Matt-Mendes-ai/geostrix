// TASKS.csv #3919 (Main / Matt, 2026-11-20: the guided Faults tool spent 6 minutes on WA lode gold's 621 FZ picks) — a quick first fault model.
// The run's time is the modelling engine's own work model (lib/gempyLimits.js: rows of data x evaluated points, at this computer's measured rate),
// estimated here before anything starts, so the card can say both times and let the user choose. The quick model declusters the picks: per hole,
// one pick per depth bin (the middle one of the bin), the bin growing from the model's vertical cell until the run fits QUICK_SHARE of the engine's
// few-minute budget; every hole keeps at least one pick. Positions are the collar's, down the hole as if vertical: they size the model box and
// the estimate only (the run desurveys the picks itself). Pure.
import { gempyWork, GEMPY_WORK_BUDGET, GEMPY_REF_SECONDS_PER_EVAL } from "../gempyLimits.js";
import { axisResolution } from "../modelResolution.js";
import { autoSurface, QUICK_RESOLUTION } from "./autoSurface.js";
import { fin } from "./autoCommon.js";

export const QUICK_SHARE = 0.4; // of the engine's budget (about five minutes at the reference rate): a first model in about two minutes
const has = (v) => v != null && v !== "" && Number.isFinite(Number(v));

// one fault surface of n picks (a point and an orientation each) on a block of `blockCells` -> the engine's evaluations
const workOf = (n, blockCells) => gempyWork([{ points: new Array(n), orientations: new Array(n) }], { blockCells });

// per hole, one pick per `binM` of depth (the middle pick of each bin); every hole keeps one
export function declusterPicks(picks, binM) {
  const by = new Map();
  for (const p of picks) { if (!by.has(p.hole_id)) by.set(p.hole_id, []); by.get(p.hole_id).push(p); }
  const out = [];
  for (const list of by.values()) {
    list.sort((a, b) => Number(a.depth) - Number(b.depth));
    const bins = new Map();
    for (const p of list) { const k = Math.floor(Number(p.depth) / binM); if (!bins.has(k)) bins.set(k, []); bins.get(k).push(p); }
    for (const b of bins.values()) out.push(b[Math.floor(b.length / 2)]);
  }
  return out;
}

// picks: the structure rows of one type ({ hole_id, depth, dip, azimuth }); rate: seconds per evaluation on this computer (gempyRate)
// -> { ok, verdict } | { ok, resolution, blockCells, cellsM, all: { n, seconds }, quick: null | { rows, n, binM, seconds } }
export function faultPlan({ collars = [], picks = [], rate = GEMPY_REF_SECONDS_PER_EVAL, maxResolution = QUICK_RESOLUTION } = {}) {
  const at = new Map(collars.map((c) => [c.hole_id, c]));
  const rows = picks.filter((p) => has(p.dip) && has(p.azimuth) && has(p.depth) && at.has(p.hole_id));
  const pos = rows.map((p) => { const c = at.get(p.hole_id); return { hole_id: p.hole_id, x: Number(c.x), y: Number(c.y), z: Number(c.z) - Number(p.depth) }; }).filter((q) => fin(q.x) && fin(q.y) && fin(q.z));
  const box = autoSurface({ collars, contacts: pos, hasLogs: true, maxResolution });
  if (!box.ok) return { ok: false, verdict: box.verdict };
  const axes = axisResolution(box.values.extent, box.values.resolution), blockCells = axes[0] * axes[1] * axes[2];
  const all = { n: rows.length, seconds: workOf(rows.length, blockCells) * rate };
  const budget = QUICK_SHARE * GEMPY_WORK_BUDGET;
  let quick = null;
  if (workOf(rows.length, blockCells) > budget) {
    let binM = Math.max(1, box.values.cellsM[2]), kept = declusterPicks(rows, binM);
    for (let i = 0; i < 20 && workOf(kept.length, blockCells) > budget; i++) { binM *= 1.5; kept = declusterPicks(rows, binM); }
    if (kept.length >= 3 && kept.length < rows.length) quick = { rows: kept, n: kept.length, binM: +binM.toFixed(1), seconds: workOf(kept.length, blockCells) * rate };
  }
  return { ok: true, resolution: box.values.resolution, blockCells, cellsM: box.values.cellsM, all, quick };
}

export const minutesOf = (seconds) => Math.max(1, Math.round(seconds / 60));
