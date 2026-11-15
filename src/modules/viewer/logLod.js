// TASKS.csv #2802 (split from #2746, WA uranium) — a level of detail for very long custom logs. Each reading of a custom point layer is a sphere
// instance (POINT_PROTO.sphere, ~180 triangles): the raw downhole gamma log (439,780 readings) is ~79 M triangles a frame, and the GPU
// process took 230-260 ms per frame to present it. Readings closer together than a marker's own width overlap on screen anyway, so when a
// typical spacing is under LOD_ON_PX (#3144's switch, with its margin back) a coarse set is drawn instead: each hole's readings binned along
// the hole (a bin is LOG_BIN_SPACINGS spacings, and never less than the marker's width), one marker per bin coloured by the bin's mean (a
// number) or its commonest value (codes), its tip naming the readings it stands for. Built the first time it is needed, beside the full set
// in the layer's group (so the layer's eye hides both), and dropped whenever drillholeScene rebuilds, patches or repaints the layer. A
// hole hidden in the Holes list is left out of the coarse set (rebuilt when the shown holes change while it is drawn).
// The builder (binReadings, buildCoarse) is logLodBuild.js, loaded the first time a coarse set is wanted: this part runs every frame.
import { lodWanted } from "../../lib/viewer/assayLod.js";
import { isTable, rowCount, fieldOf } from "../../lib/layerColumns.js"; // TASKS.csv #3140
import { rowsRefOf } from "../../lib/tableFields.js"; // TASKS.csv #3140 step 2

export const LOG_LOD_MIN = 20000, LOG_BIN_SPACINGS = 8;
export const isPoint = (r) => r && !(r.to != null && !isNaN(r.to)) && r.depth != null && !isNaN(r.depth);
// TASKS.csv #3140 — isPoint for row i of rows or a Table (a log held as columns is read by index, never as rows)
export function pointAt(rows) {
  if (!isTable(rows)) return (i) => isPoint(rows[i]);
  const to = fieldOf(rows, "to"), depth = fieldOf(rows, "depth");
  return (i) => { const t = to(i), d = depth(i); return !(t != null && !isNaN(t)) && d != null && !isNaN(d); };
}

// the median gap between consecutive readings of a hole (m), from at most ~4,000 gaps spread through the rows (in file order, by hole)
export function readingSpacingM(rows) {
  const n = rowCount(rows), step = Math.max(1, Math.floor(n / 4000)), gaps = [];
  const pt = pointAt(rows), hole = fieldOf(rows, "hole_id"), depth = fieldOf(rows, "depth"); // #3140: rows or a Table
  for (let i = step; i < n; i += step) {
    if (!pt(i - 1) || !pt(i) || hole(i - 1) !== hole(i)) continue;
    const d = Math.abs(Number(depth(i)) - Number(depth(i - 1)));
    if (d > 1e-6 && Number.isFinite(d)) gaps.push(d);
  }
  if (!gaps.length) return null;
  gaps.sort((x, y) => x - y);
  return gaps[Math.floor(gaps.length / 2)];
}

// the coarse set's markers out of the layer group, the full set shown again
export function dropLogCoarse(group) {
  const L = group?.userData?.logLod;
  if (!L) return;
  for (const c of L.coarse || []) { group.remove(c); c.dispose?.(); }
  L.coarse = null;
  if (L.lodOn) for (const c of group.children) c.visible = true;
  L.lodOn = false;
}

// after drillholeScene built, patched or repainted a custom layer: a long point log gets a fresh (unbuilt) level of detail
export function primeLogLod(group, layer, layerStyles) {
  if (!group) return;
  dropLogCoarse(group);
  let n = 0;
  const rowsRef = rowsRefOf(layer) || [], pt = pointAt(rowsRef), N = rowCount(rowsRef); // #3140: counted by index (rows or a Table; a view's rows are not built)
  for (let i = 0; i < N; i++) if (pt(i)) n++;
  if (n < LOG_LOD_MIN) { delete group.userData.logLod; return; }
  group.userData.logLod = { layer, layerStyles, spacingM: readingSpacingM(rowsRef), coarse: null, lodOn: false, vh: null };
}

let builder = null, loading = null;
// every frame, for a layer group carrying a long log: switch sets when a typical spacing crosses the threshold (lodWanted's margin)
export function logLodTick(group, metresPerPx, traces, visibleHoles) {
  const L = group.userData.logLod;
  if (!L || !(L.spacingM > 0)) return;
  const on = lodWanted(L.spacingM, metresPerPx, L.lodOn);
  let built = false;
  if (on && (!L.coarse || L.vh !== visibleHoles)) {
    if (!builder) { if (!loading) loading = import("./logLodBuild.js").then((m) => { builder = m; }); return; } // the next frame builds it
    for (const c of L.coarse || []) { group.remove(c); c.dispose?.(); }
    builder.buildCoarse(group, L, traces, visibleHoles); built = true;
  }
  if (on === L.lodOn && !built) return;
  const coarse = new Set(L.coarse || []);
  for (const c of group.children) c.visible = coarse.has(c) ? on : !on;
  L.lodOn = on;
}
