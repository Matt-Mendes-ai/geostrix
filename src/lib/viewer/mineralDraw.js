// TASKS.csv #3987 (Matt: the Mineralization style 'some will switch to what I select and some won't') — a Mineralization layer drew rows longer
// than 0.5 m as tubes (interval style: cylinder / smooth / square, Width by, the tube size choice) and shorter or point rows as markers (point
// style: sphere / cube / disc ...), so one hole showed tubes, boxes and spheres and a style change reached only some of them. A layer that has
// interval rows now draws every row as a tube (a short or point row as a MIN_TUBE_M tube centred on its depth) with one style; a layer of
// points only keeps its markers (#684: a point log, Harry and the synthetic set).
export const MIN_TUBE_M = 1;
export const MNLGY_RADIUS = 2.8; // the layer's tube radius (drillholeScene; LAYER_META has none: the layer is a 'point' kind)
const isInterval = (r) => Number.isFinite(r?.from) && Number.isFinite(r?.to) && r.to - r.from > 0.5; // drillholeScene's isIntervalRow
export const hasDepths = (r) => Number.isFinite(r?.from) && Number.isFinite(r?.to) && r.to >= r.from;
// does the layer draw as tubes (it has interval rows)? cached per rows array
const cache = new WeakMap();
export function mineralAsTubes(rows) {
  if (!Array.isArray(rows) || !rows.length) return false;
  if (!cache.has(rows)) cache.set(rows, rows.some(isInterval));
  return cache.get(rows);
}
// the depths a row's tube spans: its own, or minLen centred on its middle when shorter (never above the collar)
export function tubeSpan(row, minLen = MIN_TUBE_M) {
  const len = row.to - row.from;
  if (!(len < minLen)) return [row.from, row.to];
  const mid = (row.from + row.to) / 2, a = Math.max(0, mid - minLen / 2);
  return [a, a + minLen];
}
