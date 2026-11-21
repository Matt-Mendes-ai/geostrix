// TASKS.csv #3898 — "Build it for me" for the grade shell: the cut-off from the grade distribution itself, and the shell's cell size from
// the drilling. The user still names the element; GeoStrix never assumes a deposit style or a "usual" cut-off for a metal.
//
// The cut-off is where the grades split into a low background and a higher population, on the logarithm of the grades (assays are
// skewed). First the threshold that leaves the two groups most apart (Otsu's method: the largest between-group variance); then, on the
// smoothed histogram, the lowest point between the peaks either side of it. When that valley drops below CLEAR_VALLEY of the smaller peak,
// the grades really are two groups and the cut-off sits in the valley (the natural break, even for a small high-grade group, where Otsu
// alone leans into the background). Otherwise there is no valley (one population, or a flat spread): the Otsu threshold is still given,
// with a note that it is the best split, not a natural one, rather than drawn as a confident shell.
//
// TASKS.csv #3922 (Matt: "should GeoStrix offer values read from the data? I think that's a better way to do it") — the cell and the search
// from the drilling, the grid only round the grade:
//  - the drill spacing: the median distance from a drill site to the next (collars within 2 m are one site), over the holes that carry
//    grades. A nearest-site distance is measured within a cluster, so clusters kilometres apart do not stretch it (#3898's block model boxed
//    the whole 21 km of Macpass and grew 500 m blocks);
//  - cells about half that spacing (rounded down to a whole 5 m above 20 m, a whole metre above 5 m), never under a quarter of it;
//  - the search about three spacings (rounded to 5 m), so a block reaches the holes round it: tied to the spacing, never to the cell;
//  - the blocks counted as the run counts them, over the boxes round the composites at or above the cut-off (lib/viewer/shellBoxes.js
//    gradeBoxes; the drilled clusters' boxes for an envelope shell); over the block budget the cells grow until they fit, and the reason says so;
//  - no measurable spacing (fewer than three drill sites carry grades): GeoStrix's standard settings (#3921: 50 m cells, a 200 m search),
//    said as such.
//
// input: { collars, samples: [{ hole_id, x, y, z, from, to, value }] (positions: desurveyed sample centres; vertical below the collar will do
//          for the cut-off, not for the blocks), unit: "g/t" | "%" | "ppm" ... (shown with the cut-off), tight (a Tight shell: default true),
//          budget (the block budget: GRADE_SHELL_BLOCK_BUDGET), padM (GRADE_SHELL_PAD_DEFAULT) }
// -> values: { cutoff, cellSize, searchRadius, fromData, spacing, blocks, areas, refit, shareAbove (length-weighted, 0-1), holesAbove }
import { thin, fin, twoFigures, metres, siteSpacing, holesOf, autoResult, because, say } from "./autoCommon.js";
import { fmtNum } from "../i18n.js";
import { drilledBoxes, gradeBoxes, boxesBlocks } from "../viewer/shellBoxes.js";
import { NUMERIC_CELL_DEFAULT, GRADE_SHELL_SEARCH_DEFAULT, GRADE_SHELL_PAD_DEFAULT, GRADE_SHELL_BLOCK_BUDGET } from "../estimationMeta.js";

export const CLEAR_VALLEY = 0.5;
const BINS = 64;
export const CELL_SHARE = 0.5, SEARCH_SPACINGS = 3;

// -> { cut (a log10 grade), clear (a valley between two peaks), valley (its height / the smaller peak's) } | null
export function bestSplit(logs, weights) {
  let lo = Infinity, hi = -Infinity;
  for (const v of logs) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(hi > lo)) return null;
  const w = new Float64Array(BINS), s = new Float64Array(BINS), width = (hi - lo) / BINS;
  let W = 0, S = 0;
  logs.forEach((v, i) => { const b = Math.min(BINS - 1, Math.floor((v - lo) / width)), k = weights[i]; w[b] += k; s[b] += k * v; W += k; S += k * v; });
  let w0 = 0, s0 = 0, best = -1, cutBin = -1;
  for (let b = 0; b < BINS - 1; b++) {
    w0 += w[b]; s0 += s[b];
    const w1 = W - w0;
    if (w0 <= 0 || w1 <= 0) continue;
    const between = (w0 * w1 / (W * W)) * (s0 / w0 - (S - s0) / w1) ** 2;
    if (between > best) { best = between; cutBin = b; }
  }
  if (cutBin < 0) return null;
  // the histogram smoothed over five bins, its peak on each side of the Otsu threshold, and the lowest point between them
  const h = Array.from(w, (_, b) => { let t = 0, n = 0; for (let k = Math.max(0, b - 2); k <= Math.min(BINS - 1, b + 2); k++) { t += w[k]; n++; } return t / n; });
  // a peak is a local maximum (a tail falling away from the other side's peak is not one); none on a side: that side's highest bin
  const isPeak = (b) => (b === 0 || h[b] >= h[b - 1]) && (b === BINS - 1 || h[b] >= h[b + 1]);
  const peakIn = (from, to) => { let p = -1; for (let b = from; b <= to; b++) if (isPeak(b) && (p < 0 || h[b] > h[p])) p = b; if (p < 0) { p = from; for (let b = from; b <= to; b++) if (h[b] > h[p]) p = b; } return p; };
  const p0 = peakIn(0, cutBin), p1 = peakIn(cutBin + 1, BINS - 1);
  let v = p0;
  for (let b = p0; b <= p1; b++) if (h[b] < h[v]) v = b;
  const valley = h[v] / Math.min(h[p0], h[p1]);
  const clear = valley < CLEAR_VALLEY && v > p0 && v < p1;
  return { cut: lo + (clear ? v + 0.5 : cutBin + 1) * width, clear, valley };
}

// a cell rounded DOWN to a step that reads as chosen (5 m from 20 m, 1 m from 5 m, else 0.5 m), and the next step up
export const cellStep = (v) => (v >= 20 ? Math.floor(v / 5) * 5 : v >= 5 ? Math.floor(v) : Math.max(0.5, Math.floor(v * 2) / 2));
const stepUp = (c) => (c >= 20 ? c + 5 : c >= 5 ? c + 1 : c + 0.5);
const searchStep = (v) => (v >= 20 ? Math.round(v / 5) * 5 : Math.max(1, Math.round(v)));

// the grid the run would make at a cell and a search: { blocks, areas, drilledBlocks } (lib/viewer/shellBoxes.js, as modellingRuns.js uses it)
export function shellBlocks(points, cutoff, { cell, search, padM = GRADE_SHELL_PAD_DEFAULT, tight = true }) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of points) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z; }
  const bounds = { xmin: x0 - padM, xmax: x1 + padM, ymin: y0 - padM, ymax: y1 + padM, zmin: z0 - padM, zmax: z1 + padM };
  const linkM = 2 * Math.max(search, padM);
  const drilled = drilledBoxes(points, { bounds, padM, linkM }), drilledBlocks = boxesBlocks(drilled, cell);
  if (!tight) return { blocks: drilledBlocks, areas: drilled.length, drilledBlocks };
  const g = gradeBoxes(points, cutoff, { bounds, padM, linkM, drilled, marginM: search + Math.max(padM, cell) });
  return { blocks: boxesBlocks(g, cell), areas: g.length, drilledBlocks };
}

export function autoGradeShell({ collars = [], samples = [], unit = "", tight = true, budget = GRADE_SHELL_BLOCK_BUDGET, padM = GRADE_SHELL_PAD_DEFAULT } = {}) {
  const pts = thin(samples.filter((s) => fin(s.value) && s.value > 0));
  const holes = holesOf(pts), problems = [], notes = [];
  if (holes < 3) problems.push(holes === 1 ? say("Grades in only one hole: a grade shell needs grades in three or more holes.") : say("Grades in only {n} holes: a grade shell needs grades in three or more holes.", { n: holes }));
  if (pts.length < 20) problems.push(say("Only {n} samples with a grade above zero: too few to see where the grades split.", { n: pts.length }));
  if (problems.length) return autoResult(null, [], notes, problems);

  const len = (s) => (fin(s.to) && fin(s.from) && s.to > s.from ? s.to - s.from : 1); // length-weighted, as a run of samples is reported
  const split = bestSplit(pts.map((s) => Math.log10(s.value)), pts.map(len));
  if (!split) return autoResult(null, [], notes, [say("All the grades are the same: there is nothing to separate into a shell.")]);
  const cutoff = twoFigures(10 ** split.cut);
  let wAll = 0, wAbove = 0;
  const above = new Set();
  for (const s of pts) { const k = len(s); wAll += k; if (s.value >= cutoff) { wAbove += k; above.add(s.hole_id); } }
  const shareAbove = wAbove / wAll, holesAbove = above.size;
  if (holesAbove < 2) problems.push(say("Only one hole has grades above the cut-off ({c}): a shell around one hole would be a guess.", { c: `${fmtNum(cutoff)} ${unit}`.trim() }));
  if (problems.length) return autoResult(null, [], notes, problems);

  const reasons = [];
  reasons.push(because("cutoff", "Cut-off {c}: where these grades split best into a low background and a higher group ({p} % of the sampled length is above it, in {h} holes).",
    { c: `${fmtNum(cutoff)} ${unit}`.trim(), p: fmtNum(100 * shareAbove, { maximumFractionDigits: shareAbove < 0.1 ? 1 : 0 }), h: holesAbove }));
  if (!split.clear) notes.push(say("The grades do not split clearly into two groups: this cut-off is the best split, not a natural one. Check it against your geology, or choose one yourself."));

  // #3922 — the drill spacing of the holes that carry grades
  const graded = new Set(pts.map((s) => s.hole_id));
  const { spacing } = siteSpacing(collars.filter((c) => graded.has(c?.hole_id)));
  const placed = pts.filter((p) => fin(p.x) && fin(p.y) && fin(p.z));
  if (!(spacing > 0) || placed.length < 2) {
    reasons.push(because("cells", "Cells {c} x {c} m and a {r} m search: GeoStrix's standard grade-shell settings, because your data didn't give a clear drill spacing (fewer than three drill sites with grades). Change them in the grade shell pane.", { c: NUMERIC_CELL_DEFAULT, r: GRADE_SHELL_SEARCH_DEFAULT }));
    return autoResult({ cutoff, cellSize: NUMERIC_CELL_DEFAULT, searchRadius: GRADE_SHELL_SEARCH_DEFAULT, fromData: false, spacing: null, blocks: null, areas: null, refit: false, shareAbove, holesAbove }, reasons, notes, problems);
  }
  const searchRadius = searchStep(SEARCH_SPACINGS * spacing);
  const want = cellStep(CELL_SHARE * spacing); // rounded down, it stays above a quarter of the spacing
  let cellSize = want, grid = shellBlocks(placed, cutoff, { cell: cellSize, search: searchRadius, padM, tight });
  // over the budget: the cells grow until the blocks fit (a cube-root guess, then a step at a time)
  for (let k = 0; k < 60 && grid.blocks > budget; k++) {
    const guess = cellStep(cellSize * Math.cbrt(grid.blocks / budget));
    cellSize = guess > cellSize ? guess : stepUp(cellSize);
    grid = shellBlocks(placed, cutoff, { cell: cellSize, search: searchRadius, padM, tight });
  }
  const refit = cellSize > want;
  if (refit) reasons.push(because("cellSize", "Cells {c} x {c} m: half your {s} m drill spacing ({w} m) would need more blocks than the {b}-block budget here, so the cells are the finest that fit.", { c: metres(cellSize), s: metres(spacing), w: metres(want), b: fmtNum(budget) }));
  else reasons.push(because("cellSize", "Cells {c} x {c} m: about half your {s} m drill spacing (the median distance between the drill sites that carry grades), so the shell bends between holes, not only at them.", { c: metres(cellSize), s: metres(spacing) }));
  reasons.push(because("searchRadius", "Search {r} m: about three drill spacings, so each block reaches the holes round it.", { r: metres(searchRadius) }));
  if (tight && grid.blocks < 0.95 * grid.drilledBlocks) reasons.push(grid.areas === 1
    ? because("box", "The grid covers only the ground within the search of the grades above the cut-off: {n} blocks in one area, not the {d} the drilled ground would need.", { n: fmtNum(grid.blocks), d: fmtNum(grid.drilledBlocks) })
    : because("box", "The grid covers only the ground within the search of the grades above the cut-off: {n} blocks in {a} areas, not the {d} the drilled ground would need.", { n: fmtNum(grid.blocks), a: grid.areas, d: fmtNum(grid.drilledBlocks) }));
  return autoResult({ cutoff, cellSize, searchRadius, fromData: true, spacing, blocks: grid.blocks, areas: grid.areas, refit, shareAbove, holesAbove }, reasons, notes, problems);
}
