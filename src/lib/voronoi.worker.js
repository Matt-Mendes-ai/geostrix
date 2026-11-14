// TASKS.csv #3310 — Spatial analysis's tessellation off the main thread. "prepare" (flat x / y / z arrays) answers the cloud's shape
// (cloudShape, #1783: is it a 3D cloud?) for the dialog's Run gate; "run" (x / y / value arrays and the map's size) answers progress, then
// the statistics, the bounds and colour stretch it used, each cell's area (transferred) and the map as an ImageBitmap; "find" answers the
// cell under a map position (the hover). The dialog's Cancel terminates the worker. Static imports: workers are one file.
import { voronoiDecluster, drawDecluster, robustStretch } from "./voronoiDecluster.js";
import { paddedBounds } from "./geoprocessing.js";
import { cloudShape } from "./cloudShape.js";

const objects = (xs, ys, zs = null) => { const out = new Array(xs.length); for (let i = 0; i < xs.length; i++) out[i] = { x: xs[i], y: ys[i], z: zs ? zs[i] : undefined }; return out; };
let state = null;
self.onmessage = (e) => {
  const d = e.data || {};
  if (d.type === "find") {
    if (!state) return;
    const i = state.delaunay.find(d.x, d.y, state.last);
    state.last = i;
    self.postMessage({ type: "found", seq: d.seq, index: i });
    return;
  }
  if (d.type === "prepare") {
    try { self.postMessage({ type: "shape", id: d.id, shape: cloudShape(objects(d.xs, d.ys, d.zs)) }); } catch (err) { self.postMessage({ type: "failed", id: d.id, error: String(err?.message || err) }); }
    return;
  }
  if (d.type !== "run") return;
  try {
    const bounds = paddedBounds(objects(d.xs, d.ys));
    const stretch = robustStretch(d.vs);
    const r = voronoiDecluster(d.xs, d.ys, d.vs, bounds, { onProgress: (done, total, phase) => self.postMessage({ type: "progress", id: d.id, done, total, phase }) });
    let bitmap = null;
    if (typeof OffscreenCanvas !== "undefined" && d.map) {
      self.postMessage({ type: "progress", id: d.id, done: 0, total: 1, phase: "draw" });
      const { w, h, pad, scale } = d.map;
      const canvas = new OffscreenCanvas(Math.round(w * scale), Math.round(h * scale));
      drawDecluster(canvas.getContext("2d"), { delaunay: r.delaunay, voronoi: r.voronoi, xs: d.xs, ys: d.ys, vs: d.vs, areas: r.areas, bounds, w, h, pad, vmin: stretch.min, vrange: stretch.max - stretch.min || 1, scale,
        onRow: (done, total) => self.postMessage({ type: "progress", id: d.id, done, total, phase: "draw" }) });
      bitmap = canvas.transferToImageBitmap();
    }
    state = { delaunay: r.delaunay, last: 0 };
    const stats = { n: r.n, totalArea: r.totalArea, naiveMean: r.naiveMean, declusteredMean: r.declusteredMean, declusteredStd: r.declusteredStd };
    self.postMessage({ type: "done", id: d.id, stats, bounds, stretch, areas: r.areas, bitmap }, [r.areas.buffer, ...(bitmap ? [bitmap] : [])]);
  } catch (err) {
    self.postMessage({ type: "failed", id: d.id, error: String(err?.message || err) });
  }
};
