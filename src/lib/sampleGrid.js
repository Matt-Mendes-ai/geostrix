// TASKS.csv #1622 (review #1497, Lawyers) — surface samples gridded to a raster, as docs/ideas/soils-stream-sediments.md §6.2 asks:
// one element, one medium, log10 for trace elements, blanked away from the samples. The only route was re-importing the soils as a
// geophysics point survey: raw-ppm IDW (Au is lognormal: median 0.003, P98 0.129 ppm), every sample above the 2-98 % clip its own
// bullseye, the magnetic filters offered for gold in soil, and a legend with no unit.
//
// In log mode the IDW runs on log10 of the values (the space a lognormal grade is smooth in) and the grid is turned back into the
// element's unit, so it is coloured with the log stretch (#1857) and its legend and identify read in ppm. Zero / negative values
// cannot be logged and are counted out.
import { idwGrid, suggestBlankingDistance } from "./idw.js";
import { minCurvatureGrid } from "./minCurvature.js"; // TASKS.csv #1622
import { contourLevel } from "./contours.js";

export const logByDefault = (unit) => /^(ppm|ppb|ppt|g\/t)$/i.test(String(unit || "").trim());

export function samplePoints(samples, symbol, { medium = "", log = false } = {}) {
  const points = [];
  let n = 0, nonPositive = 0;
  for (const s of samples || []) {
    if (medium && s.medium !== medium) continue;
    const v = s.values?.[symbol];
    if (!Number.isFinite(v) || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
    n++;
    if (log) { if (v <= 0) { nonPositive++; continue; } points.push({ x: s.x, y: s.y, value: Math.log10(v) }); }
    else points.push({ x: s.x, y: s.y, value: v });
  }
  return { points, n, nonPositive };
}

// A starting cell: half the typical sample spacing, rounded to 5 / 10 / 25 / 50 ... m. -> { cellM, blankM, spacingM } or null
export function suggestSampleGrid(points) {
  const s = suggestBlankingDistance(points);
  if (!s) return null;
  const half = s.spacing / 2, steps = [5, 10, 20, 25, 50, 100, 200, 250, 500];
  return { cellM: steps.find((v) => v >= half) || 500, blankM: Math.round(s.distance), spacingM: s.spacing };
}

// -> { grid: { nx, ny, x0, yTop, dx, dy, values: Float32Array }, bbox, points, n, nonPositive, valid, blankM } or { error }
// method: "idw" (power) or "mincurv" (tension 0-1, lib/minCurvature.js; capped at MINCURV_MAX_CELLS: a million cells take ~4 s)
export const MINCURV_MAX_CELLS = 1_000_000;
export function gridSamples(samples, symbol, { medium = "", log = false, cellM, power = 2, blankM = null, maxCells = 4_000_000, method = "idw", tension = 0.25 } = {}) {
  const { points, n, nonPositive } = samplePoints(samples, symbol, { medium, log });
  if (points.length < 3) return { error: "few", n: points.length };
  const cell = Number(cellM) > 0 ? Number(cellM) : (suggestSampleGrid(points)?.cellM ?? 25);
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const p of points) { if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y; }
  // Nodes on round multiples of the cell (cell edges half a cell off): a soil grid surveyed on round coordinates then has a node on
  // every sample and IDW, an exact interpolator, keeps the sample's value there. With edges on round numbers the nodes sat half a
  // cell off every sample and a lone 1.2 ppm sample gridded to 0.016 ppm under log10.
  xmin = Math.floor(xmin / cell) * cell - 1.5 * cell; ymin = Math.floor(ymin / cell) * cell - 1.5 * cell;
  xmax = Math.ceil(xmax / cell) * cell + 1.5 * cell; ymax = Math.ceil(ymax / cell) * cell + 1.5 * cell;
  const nx = Math.round((xmax - xmin) / cell), ny = Math.round((ymax - ymin) / cell);
  if (nx * ny > maxCells) return { error: "cells", nx, ny };
  if (method === "mincurv" && nx * ny > MINCURV_MAX_CELLS) return { error: "mincurvCells", nx, ny };
  const blank = blankM == null || blankM === "" ? (suggestBlankingDistance(points)?.distance ?? Infinity) : Number(blankM) > 0 ? Number(blankM) : Infinity;
  let gridW, gridH, values, iterations = null;
  if (method === "mincurv") {
    // the same blanking as IDW: a node with no sample within `blank` stays empty (the nearest-sample IDW pass is that mask)
    const mask = idwGrid(points, { xmin, ymin, xmax, ymax, cellSize: cell, power: 1, maxDistance: blank, maxPoints: 1 });
    ({ gridW, gridH } = mask);
    // solved only within 3x the blanking distance of a sample: the far field is blanked anyway and slow to converge. Lawyers' soil Au
    // (54,040 cells, 50 m, blank 185 m): the whole box 2.1 s, within blank + 2 cells 0.6 s but up to 0.34 log10 off the whole-box
    // surface at the edges of the sampled area, within 3x blank 0.83 s and 95% of the kept cells within 0.011 log10 (worst 0.11)
    const near = Number.isFinite(blank) ? idwGrid(points, { xmin, ymin, xmax, ymax, cellSize: cell, power: 1, maxDistance: 3 * blank, maxPoints: 1 }) : null;
    const active = near ? Uint8Array.from(near.values, (v) => (Number.isFinite(v) ? 1 : 0)) : null;
    const mc = minCurvatureGrid(points.map((p) => ({ x: p.x, y: p.y, v: p.value })), { xmin, ymax, cell, nx: gridW, ny: gridH }, { tension, active });
    values = mc.values; iterations = mc.iterations;
    for (let i = 0; i < values.length; i++) if (!Number.isFinite(mask.values[i])) values[i] = NaN;
  } else ({ gridW, gridH, values } = idwGrid(points, { xmin, ymin, xmax, ymax, cellSize: cell, power, maxDistance: blank }));
  let valid = 0;
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) { if (log) values[i] = 10 ** values[i]; valid++; }
  return {
    grid: { nx: gridW, ny: gridH, x0: xmin + cell / 2, yTop: ymax - cell / 2, dx: cell, dy: cell, values },
    bbox: [xmin, ymax - gridH * cell, xmin + gridW * cell, ymax],
    points: points.length, n, nonPositive, valid, blankM: Number.isFinite(blank) ? Math.round(blank) : null, cellM: cell, method, ...(method === "mincurv" ? { tension, iterations } : {}),
  };
}

// TASKS.csv #1622 — contours of a gridded raster (any { nx, ny, x0, yTop, dx, dy } grid; blank nodes NaN stop the lines), with
// lib/contours.js's marching squares, which takes node extents.
export function gridNodes(grid, values) {
  return { bbox: [grid.x0, grid.yTop - (grid.ny - 1) * grid.dy, grid.x0 + (grid.nx - 1) * grid.dx, grid.yTop], gridW: grid.nx, gridH: grid.ny, elevations: values };
}
// Starting levels: the grid's 75th, 90th, 95th and 98th percentiles (positive values) to two significant figures. The median was dropped:
// on Lawyers' soil Au its line was most of 1,129 background loops; an anomaly map wants the upper tail.
export function suggestedContourLevels(values) {
  const v = [];
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i]) && values[i] > 0) v.push(values[i]);
  if (!v.length) return [];
  v.sort((a, b) => a - b);
  const at = (p) => v[Math.min(v.length - 1, Math.round(p * (v.length - 1)))];
  return [...new Set([0.75, 0.9, 0.95, 0.98].map((p) => +at(p).toPrecision(2)))].sort((a, b) => a - b);
}
export function gridContours(grid, values, levels) {
  const nodes = gridNodes(grid, values);
  return (levels || []).map((level) => ({ level, polylines: contourLevel(nodes, level) })).filter((l) => l.polylines.length);
}
