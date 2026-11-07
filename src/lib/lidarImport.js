// TASKS.csv #1994 — the renderer side of a lidar import: the header read on the spot (no points), the points read in
// lidar.worker.js, and the file's coordinate system and height units set against the project's.
import { inspectLidar, fileSource, COPC_POINT_BUDGET, copcLevelsWithin } from "./lidar.js";
import { getProj4Def, reprojectXY } from "./reproject.js";

export const inspectLidarFile = (file) => inspectLidar(fileSource(file));

// how many points a read goes through: all of them, or a COPC file's levels within the budget
export function pointsToRead(info) {
  return info.kind === "COPC" ? copcLevelsWithin(info.nodes, COPC_POINT_BUDGET).points : info.header.pointCount;
}

// The ground cell: the terrain detail setting over the long side, and never finer than twice the mean point spacing
// (the points read over the area), so most cells hold a point
export function lidarCellSize(h, gridMax, points) {
  const w = h.max[0] - h.min[0], d = h.max[1] - h.min[1], span = Math.max(w, d);
  const spacing = points > 0 && w > 0 && d > 0 ? Math.sqrt((w * d) / points) : 0;
  return Math.max(span / Math.max(2, gridMax), 2 * spacing);
}

// metres per unit of a proj4 definition (+units=m / ft / us-ft, +to_meter=)
export function unitOfDef(def) {
  if (!def) return null;
  const tm = def.match(/\+to_meter=([\d.eE+-]+)/);
  if (tm) return Number(tm[1]);
  const u = (def.match(/\+units=([\w-]+)/) || [])[1];
  return u === "m" ? 1 : u === "ft" ? 0.3048 : u === "us-ft" ? 1200 / 3937 : u === "km" ? 1000 : /\+proj=longlat/.test(def) ? null : 1;
}

// -> { fileEpsg, reproject: fn | null, zFactor, hFactor, zUnit, problem }
//   reproject: (x, y) -> { x, y } from the file's CRS to the project's, null when they are the same (or the file names none:
//   its coordinates are taken as the project's, and noCrs says so).
//   zFactor: the file's heights to the project's linear unit (the vertical unit when the file gives one, else its horizontal one).
export async function lidarCrsPlan(info, projectEpsg) {
  const c = info.crs, fileEpsg = c.epsg, proj = Number(projectEpsg) || null;
  const fileDef = fileEpsg ? await getProj4Def(fileEpsg) : null, projDef = proj ? await getProj4Def(proj) : null;
  const hFile = c.hUnit ?? unitOfDef(fileDef) ?? 1;
  const zFile = c.zUnit ?? hFile;
  const projUnit = unitOfDef(projDef) ?? 1;
  const out = { fileEpsg, noCrs: !fileEpsg, hFactor: hFile, zFile, zFactor: zFile / projUnit, reproject: null, problem: null };
  if (fileEpsg && proj && fileEpsg !== proj) {
    if (!fileDef || !projDef) out.problem = !fileDef ? "file" : "project";
    else out.reproject = (x, y) => reprojectXY(x, y, fileEpsg, proj);
  }
  return out;
}

// the points of a file through the worker. opts: lidar.js makeAccumulator's. onProgress(fraction 0-1)
export function readLidarAsync(file, opts, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker(new URL("./lidar.worker.js", import.meta.url), { type: "module" }); } catch (e) { reject(e); return; }
    w.onmessage = (e) => {
      if (e.data.progress != null) { onProgress(e.data.progress); return; }
      w.terminate();
      if (e.data.failed) reject(new Error(e.data.failed)); else resolve(e.data.res);
    };
    w.onerror = (e) => { e.preventDefault?.(); w.terminate(); reject(new Error(e.message || "The lidar reader stopped.")); };
    w.postMessage({ file, opts });
  });
}

// every n-th row so at most `target` remain -> { rows, every }
export function thinTo(rows, target) {
  const every = Math.max(1, Math.ceil(rows.length / Math.max(1, target)));
  return { rows: every > 1 ? rows.filter((_, i) => i % every === 0) : rows, every };
}
