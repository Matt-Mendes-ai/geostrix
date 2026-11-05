// TASKS.csv #1622 (review #1497, Lawyers) — surface samples gridded to a raster, as docs/ideas/soils-stream-sediments.md §6.2 asks:
// one element, one medium, log10 for trace elements, blanked away from the samples. The only route was re-importing the soils as a
// geophysics point survey: raw-ppm IDW (Au is lognormal: median 0.003, P98 0.129 ppm), every sample above the 2-98 % clip its own
// bullseye, the magnetic filters offered for gold in soil, and a legend with no unit.
//
// In log mode the IDW runs on log10 of the values (the space a lognormal grade is smooth in) and the grid is turned back into the
// element's unit, so it is coloured with the log stretch (#1857) and its legend and identify read in ppm. Zero / negative values
// cannot be logged and are counted out.
import { idwGrid, suggestBlankingDistance } from "./idw.js";

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
export function gridSamples(samples, symbol, { medium = "", log = false, cellM, power = 2, blankM = null, maxCells = 4_000_000 } = {}) {
  const { points, n, nonPositive } = samplePoints(samples, symbol, { medium, log });
  if (points.length < 3) return { error: "few", n: points.length };
  const cell = Number(cellM) > 0 ? Number(cellM) : (suggestSampleGrid(points)?.cellM ?? 25);
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const p of points) { if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y; }
  xmin = Math.floor(xmin / cell) * cell - cell; ymin = Math.floor(ymin / cell) * cell - cell;
  xmax = Math.ceil(xmax / cell) * cell + cell; ymax = Math.ceil(ymax / cell) * cell + cell;
  const nx = Math.round((xmax - xmin) / cell), ny = Math.round((ymax - ymin) / cell);
  if (nx * ny > maxCells) return { error: "cells", nx, ny };
  const blank = blankM == null || blankM === "" ? (suggestBlankingDistance(points)?.distance ?? Infinity) : Number(blankM) > 0 ? Number(blankM) : Infinity;
  const { gridW, gridH, values } = idwGrid(points, { xmin, ymin, xmax, ymax, cellSize: cell, power, maxDistance: blank });
  let valid = 0;
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) { if (log) values[i] = 10 ** values[i]; valid++; }
  return {
    grid: { nx: gridW, ny: gridH, x0: xmin + cell / 2, yTop: ymax - cell / 2, dx: cell, dy: cell, values },
    bbox: [xmin, ymax - gridH * cell, xmin + gridW * cell, ymax],
    points: points.length, n, nonPositive, valid, blankM: Number.isFinite(blank) ? Math.round(blank) : null, cellM: cell,
  };
}
