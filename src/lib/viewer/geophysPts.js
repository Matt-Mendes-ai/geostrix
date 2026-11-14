// TASKS.csv #3309 (Galore Creek review: with both IP clouds loaded, 543,820 points, every zoom, Fit, Method pick, keystroke in a survey's
// units box, import or removal froze the window 3-8 s) — the survey points drawn per survey, written straight into compact batches
// (assayBatcher, as #3055 did for assays: no stand-in object, no tooltip string per point), and a survey rebuilt only when what it draws
// changed: its rows (the same row objects, sampled), its colour model, the symbol style, the size floor (#2849) or the scene origin.
// A units or label edit changes no drawing: the tooltip is made when it is read, from the survey as it is then (tipOf). Each survey's
// 2-98 % range (a sort of its values) is kept while its rows are unchanged.
// The batches sit directly in the layer's group (picking reads its direct children), each tagged userData.geophysSurvey = its key.
import * as THREE from "three";
import { makeAssayBatcher, BATCH_MIN } from "./assayBatcher.js";
import { buildLayerBatches, addCompactBatch, syncBatchedInstances } from "./layerBatches.js";
import { colorFrom } from "./pickStandIn.js";
import { surveyKey, robustRange, surveyColourModel, colourOfModel, tIn } from "../geophysSurveys.js";
import { colorForVoxelValue } from "../layers.js";

// a point's userData: its row, and its tooltip made when read (one small object per point, no closure; as lazyTip's TipData, #1500)
class SurveyPointTip {
  constructor(row, tipOf) { this.row = row; this._tipOf = tipOf; this._tip = null; }
  get tip() { return this._tip ?? (this._tip = this._tipOf(this.row)); }
  set tip(v) { this._tip = v; }
}

// the rows of one survey, identified by their count and a sample of the row objects themselves (a filter or another survey's import keeps them)
export function rowsSignature(rows) {
  const n = rows.length;
  if (!n) return "0";
  const step = Math.max(1, Math.floor(n / 64));
  const ids = [];
  for (let i = 0; i < n; i += step) ids.push(rowId(rows[i]));
  ids.push(rowId(rows[n - 1]));
  return `${n}|${ids.join(",")}`;
}
const ROW_IDS = new WeakMap();
let nextRowId = 1;
const rowId = (r) => { let id = ROW_IDS.get(r); if (!id) ROW_IDS.set(r, (id = nextRowId++)); return id; };

// a symbol's radius before the style's size (ViewerModule's #2849 rule): the floor matters only above the base 1.4 m
export const symbolRadius = (t, minR) => Math.max(1.4 + 2.8 * t, minR * (1 + t));
const sizeKey = (minR) => (minR > 1.4 ? minR.toFixed(3) : "base");

// group: the geophys_pts layer group; rows: the points to draw (finite z, passing the filters); opts: { stops, colorMode, min, max };
// surveys: geophysSurveys (the legends); style: resolveLayerStyle(...); proto: the symbol geometry; minR: the size floor (m); origin;
// tipOf(row): the tooltip, read on hover. -> { rebuilt: [keys], kept: [keys], removed: [keys], resized: [keys] }
// A change of the size floor alone (the zoom settling, #2849) rescales a survey's batch in place from its points' kept colour positions.
export function syncGeophysPts(group, rows, { opts = {}, surveys = null, style, proto, minR = 0, origin, tipOf }) {
  const cache = group.userData.geophysCache || (group.userData.geophysCache = new Map());
  const byKey = new Map();
  for (const r of rows) { const k = surveyKey(r); let a = byKey.get(k); if (!a) byKey.set(k, (a = [])); a.push(r); }
  const single = byKey.size <= 1;
  const styleSig = `${proto?.uuid}|${style.color || ""}|${style.opacity}|${style.size}|${style.shape}`;
  const originSig = `${origin.x},${origin.y},${origin.z}`;
  const out = { rebuilt: [], kept: [], removed: [], resized: [] };
  for (const [k, entry] of cache) if (!byKey.has(k)) { dropBatches(group, entry); cache.delete(k); out.removed.push(k); }
  for (const [k, list] of byKey) {
    const rowsSig = rowsSignature(list);
    const prev = cache.get(k);
    const rr = prev && prev.rowsSig === rowsSig ? prev.rr : robustRange(list.map((r) => r.value));
    const model = surveyColourModel(rr, surveys?.[k]?.legend || null, opts, single);
    const dataSig = [rowsSig, JSON.stringify(model), styleSig, originSig].join("#"), sk = sizeKey(minR);
    if (prev && prev.dataSig === dataSig && prev.batches.every((b) => b.parent === group)) {
      if (prev.sizeKey === sk) { out.kept.push(k); continue; }
      if (prev.ts) { rescale(prev.batches[0], prev.ts, minR, style.size); prev.sizeKey = sk; out.resized.push(k); continue; }
    }
    if (prev) dropBatches(group, prev);
    const built = buildSurvey(group, k, list, model, { style, proto, minR, origin, tipOf });
    cache.set(k, { dataSig, sizeKey: sk, rowsSig, rr, batches: built.batches, ts: built.ts });
    out.rebuilt.push(k);
  }
  return out;
}

// the batch's scales from its points' colour positions (t) at a new floor. The pick index is NOT rebuilt (no cp.moves): the points did not
// move, and rebuilding it over 543,820 instances was most of a 1-2 s zoom stall; a hover still tests each candidate's current size, from
// boxes as they were built (a grown symbol's rim may be missed until the next full build)
function rescale(inst, ts, minR, size) {
  const cp = inst.userData.compact, base = cp.base;
  for (let i = 0; i < ts.length; i++) { const s = symbolRadius(ts[i], minR) * size, o = i * 16; base[o] = s; base[o + 5] = s; base[o + 10] = s; }
  syncBatchedInstances(inst);
}

function dropBatches(group, entry) {
  for (const b of entry.batches) {
    group.remove(b);
    if (b.isInstancedMesh) { b.material?.dispose?.(); b.dispose?.(); } // the shared symbol geometry stays
  }
}

function buildSurvey(group, key, list, model, opts) {
  if (list.length >= BATCH_MIN) { const { inst, ts } = buildSurveyBatch(group, key, list, model, opts); return { batches: [inst], ts }; }
  return { batches: buildSurveySmall(group, key, list, model, opts), ts: null };
}

// one survey = one symbol and one material: its matrices (a uniform scale and a translation, as Matrix4.compose writes them), colours and
// userData written straight into the compact batch's arrays (measured on 543,820 points: the generic batcher's two closures and an object a
// point, and a THREE.Color parsed for each new colour string, were most of the build)
function buildSurveyBatch(group, key, list, model, { style, proto, minR, origin, tipOf }) {
  const { x: ox, y: oy, z: oz } = origin, n = list.length, size = style.size;
  const base = new Float32Array(n * 16), col = new Float32Array(n * 3), rows = new Array(n), rgb = new Map(), ts = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const row = list[i], v = row.value;
    const color = style.color || colorForVoxelValue(model, v);
    let c = rgb.get(color);
    if (!c) { const k = colorFrom(color, true); rgb.set(color, (c = [k.r, k.g, k.b])); }
    const t = (ts[i] = tIn(model, v)), s = symbolRadius(t, minR) * size, o = i * 16;
    base[o] = s; base[o + 5] = s; base[o + 10] = s; base[o + 15] = 1;
    base[o + 12] = row.x - ox; base[o + 13] = row.z - oz; base[o + 14] = -(row.y - oy);
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    rows[i] = new SurveyPointTip(row, tipOf);
  }
  const inst = addCompactBatch(group, proto, { transparent: style.opacity < 1, opacity: style.opacity, side: style.shape === "disc" ? THREE.DoubleSide : THREE.FrontSide }, base, rows, col);
  inst.userData.geophysSurvey = key;
  return { inst, ts };
}

// a survey under BATCH_MIN points: stand-ins, batched like any layer's (in a group of their own, then moved in)
function buildSurveySmall(group, key, list, model, { style, proto, minR, origin, tipOf }) {
  const { x: ox, y: oy, z: oz } = origin;
  const batcher = makeAssayBatcher();
  const mat = { color: null, transparent: style.opacity < 1, opacity: style.opacity, side: style.shape === "disc" ? THREE.DoubleSide : THREE.FrontSide }; // one spec, its colour set per point
  for (const row of list) {
    const { color: c0, t } = colourOfModel(model, row.value);
    mat.color = style.color || c0;
    batcher.add(proto, mat, (tr) => {
      tr.scale.setScalar(symbolRadius(t, minR) * style.size);
      tr.position.set(row.x - ox, row.z - oz, -(row.y - oy));
      return true;
    }, () => new SurveyPointTip(row, tipOf));
  }
  const tmp = new THREE.Group();
  batcher.finish(tmp);
  buildLayerBatches(tmp);
  const batches = [...tmp.children];
  for (const b of batches) { b.userData.geophysSurvey = key; group.add(b); }
  return batches;
}

// a point's tooltip, made when it is read (the survey's units as they are then)
export function geophysTipText(row, surveys) {
  const units = surveys?.[row._src]?.units;
  return `${row._src || "Geophysics point"}${row.line != null ? ` · line ${row.line}` : ""}${row.fid != null ? ` · fid ${row.fid}` : ""}\n${row.label || "value"}: ${row.value}${units ? ` ${units}` : ""}\n${row.x.toFixed(0)}E ${row.y.toFixed(0)}N ${row.z.toFixed(0)}Z`;
}
