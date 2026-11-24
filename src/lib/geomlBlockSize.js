// TASKS.csv #4054 (Matt, 2026-11-24: "is there a way to adjust the block size in the geoML modelling?") — the block size of a geoML run, in one place.
// Until now it only followed the Quality (rock units 60 / 40 / 25 m, grade 50 / 30 / 20 m), was halved for closed bodies (#4017) and grade shells (#4029),
// and was set by #4019's "smaller blocks" fix for the next rock-unit run. Now there is one number per kind that the person can type:
//   - a value typed wins over the Quality and over the halving; #4019's fix fills the same number;
//   - none typed: the Quality's size, halved for closed solids (bodiesBlockSize, never under 10 m), as before;
//   - the typed value is held to BLOCK_MIN_M .. BLOCK_MAX_M (the add-on's finer blocks cost after training only, 0.56 ms each on a recent laptop);
//   - the add-on grows a block until the box holds at most BLOCK_CAP of them (its MAX_BLOCKS_OUT, the 3D view's cell budget): the plan says what it will be;
//   - a size the person set that makes more than BLOCK_WARN blocks (and more than the Quality's own) is warned about: a lot for a modest computer (about half a minute of prediction on top of training, and the
//     meshes and the 3D view carry that many cells).
// Training is not touched: its settings stay with the Quality. Pure: no React, no DOM.
import { bodiesBlockSize, blockPlan, BLOCK_CAP, BODY_MIN_BLOCK_M } from "./geomlBodies.js";

export const BLOCK_MIN_M = BODY_MIN_BLOCK_M; // 10 m: the same floor the bodies' halving keeps
export const BLOCK_MAX_M = 500;
export const BLOCK_WARN = 40000; // blocks: about 22 s of prediction for a rock unit (0.56 ms a block), and a slow 3D view on a modest computer
export { BLOCK_CAP };

// a typed value as the number the run uses: a finite size held to BLOCK_MIN_M .. BLOCK_MAX_M, rounded to 0.5 m; anything else (blank, text, 0, negative) is "not set"
export function cleanBlockM(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(Math.min(BLOCK_MAX_M, Math.max(BLOCK_MIN_M, n)) * 2) / 2;
}

// the size a run asks the add-on for, and where it came from
// qualityM: the Quality's block for this kind (QUALITY[q].domain / .grade .block_size); halved: the run draws closed solids (bodies, grade shells); user: what was typed
// -> { m, source: "user" | "halved" | "quality", qualityM, defaultM } (defaultM: what it would be with nothing typed)
export function resolveBlockM({ qualityM, halved = false, user = null }) {
  const q = Number(qualityM) || 40, defaultM = halved ? bodiesBlockSize(q) : q, typed = cleanBlockM(user);
  return typed != null ? { m: typed, source: "user", qualityM: q, defaultM } : { m: defaultM, source: halved ? "halved" : "quality", qualityM: q, defaultM };
}

// what a size means for a model box [dx, dy, dz] in metres: the blocks the add-on will make (it grows the block over BLOCK_CAP), against the Quality's own count
// -> { m (asked), cell (made), blocks, grown, over (more than BLOCK_WARN), capped (over BLOCK_CAP: the add-on grows it), baseBlocks, more (blocks beyond the Quality's) } or null with no box
export function blockSizePlan(box, size, cap = BLOCK_CAP) {
  if (!box || !(size?.m > 0)) return null;
  const a = blockPlan(box, size.m, cap), base = blockPlan(box, size.qualityM, cap);
  const more = Math.max(0, a.blocks - base.blocks);
  // the budget warning is for a size the person set that makes more blocks than the Quality's own (what they already run is not new news)
  return { m: size.m, cell: a.cell, blocks: a.blocks, grown: a.grown, over: size.source === "user" && more > 0 && a.blocks > BLOCK_WARN, capped: a.grown, baseBlocks: base.blocks, baseCell: base.cell, more };
}
