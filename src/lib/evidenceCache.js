// TASKS.csv #1457 (review #1352, Silvertip) — reopening the Evidence overlay recomputed every saved layer on mount (a CPU profile of
// an 11-layer recipe: ~105 ms of a ~150 ms stall in computeValues; the review measured 1.4 s before #1449-#1451). A layer's values
// are a pure function of the grid, the source and its options, and the project data, so they are kept here between openings:
// keyed by grid + source + options, and reused only while every data input is the same object (the store replaces an array when
// it changes, so identity is the version). Least recently used first out; at most MAX layers (each is one value per grid cell).
import { parseCodedRef, codedRowsOf } from "./evidenceSources.js"; // TASKS.csv #2453

const MAX = 16;
const cache = new Map();

export const gridSignature = (g) => (g ? [g.nx, g.ny, g.x0, g.yTop, g.dx, g.dy].join(",") : "");

// key: string; deps: array of the data objects the values were computed from; compute: () => values | null
export function cachedEvidence(key, deps, compute) {
  const hit = cache.get(key);
  if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => d === deps[i])) {
    cache.delete(key); cache.set(key, hit); // most recently used last
    return hit.values;
  }
  const values = compute();
  if (values) {
    cache.set(key, { deps, values });
    while (cache.size > MAX) cache.delete(cache.keys().next().value);
  } else cache.delete(key);
  return values;
}

// TASKS.csv #1560 (review #1497, Lawyers) — the data a source reads, and nothing else: keyed on the whole project every layer
// was recomputed when a raster's eye was toggled or a block model's display range edited (the reopen stalled 2.2-2.4 s instead
// of ~0.5 s). A raster reads its grid, a map layer its features, a block model its cells (and the support cutoff), the logs
// their rows; a visibility flag, a colour or a range lives on the parent object and never counts. The hole traces are the
// collars, the survey and the desurvey method (the derived Map is rebuilt on every opening of the pane, the inputs are not).
export function evidenceDeps(src, opts = {}, d = {}) {
  const holes = [d.collars, d.survey, d.desurveyMethod];
  const coded = parseCodedRef(src.ref); // TASKS.csv #2453 — a coded field's card reads its layer's rows
  if (coded) return [codedRowsOf(coded.l, d.projectLayers, d.customLayers), ...holes];
  switch (src.kind) {
    case "raster": return [(d.rasters || []).find((r) => r.id === src.ref)?.grid];
    case "distance": return [(d.mapLayers || []).find((l) => String(l.id) === String(src.ref))?.features];
    case "element": case "index": return [d.surfaceSamples, d.surfaceElements];
    case "survey": return [d.geophysPts];
    case "voxel": { const m = (d.voxelModels || []).find((x) => (x.id ?? x.name) === src.ref); return [m?.cells, m?.supportCutoff, m?.method]; }
    case "grade": case "pxrf": return [d.assays, d.assayElements, ...holes];
    case "pick": return [d.structurePicks, ...holes];
    case "numeric": {
      const c = /^custom:(.+):[^:]+$/.exec(src.ref); if (c) return [(d.customLayers || []).find((l) => String(l.id) === c[1])?.rows, ...holes];
      const k = src.ref.startsWith("coded:") ? src.ref.split(":")[1] : src.ref.split(":")[0]; return [d.projectLayers?.[k], ...holes];
    }
    case "zone": return [d.projectLayers?.[src.ref.slice(0, src.ref.indexOf(":"))], ...holes];
    case "drilled": return holes; // #1456 — the traces only
    case "solid": { const s = (d.solids || []).find((x) => x.id === src.ref); return [s, s?.faceCount, s?.vertexCount]; } // #1567 — a rebuilt body is a new entry
    default: return [d.rasters, d.mapLayers, d.surfaceSamples, d.surfaceElements, d.assays, d.assayElements, d.voxelModels, d.geophysPts, d.structurePicks, d.projectLayers, d.customLayers, ...holes];
  }
}

export const evidenceCacheSize = () => cache.size; // for tests
export const clearEvidenceCache = () => cache.clear();
