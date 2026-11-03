// TASKS.csv #1457 (review #1352, Silvertip) — reopening the Evidence overlay recomputed every saved layer on mount (a CPU profile of
// an 11-layer recipe: ~105 ms of a ~150 ms stall in computeValues; the review measured 1.4 s before #1449-#1451). A layer's values
// are a pure function of the grid, the source and its options, and the project data, so they are kept here between openings:
// keyed by grid + source + options, and reused only while every data input is the same object (the store replaces an array when
// it changes, so identity is the version). Least recently used first out; at most MAX layers (each is one value per grid cell).
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

export const evidenceCacheSize = () => cache.size; // for tests
export const clearEvidenceCache = () => cache.clear();
