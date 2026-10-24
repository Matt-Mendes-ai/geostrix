// TASKS.csv #845 — stream catchments: depression filling (everything drains to the edge), D8 directions,
// accumulation, Strahler order, site snapping, nested catchments, Hawkes productivity, follow-up reaches, one sample type
// at a time, the stream network and the GPX export
import test from "node:test";
import assert from "node:assert/strict";
import { fillDepressions, flowDirections, accumulate, strahler, gridGeometry, snapSite, subcatchments, siteTree, hawkes, routeTerrain, downstreamOf } from "../src/lib/hydrology.js";
import { analyseCatchments, catchmentImage, streamNetwork, followUpGpx } from "../src/lib/catchments.js";

// a main valley draining south along x = 50 and a tributary joining from the east at row 60; 10 m cells
function valley() {
  const w = 101, h = 101, dx = 10, z = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const main = 0.1 * Math.abs(i - 50) * dx + 0.02 * (h - 1 - j) * dx;
    const trib = i > 50 ? 0.1 * Math.abs(j - 60) * dx + 0.02 * (i - 50) * dx + 0.02 * 40 * dx : Infinity;
    z[j * w + i] = Math.min(main, trib) + 100;
  }
  return { w, h, dx, z, terrain: { bbox: [0, 0, 1000, 1000], gridW: w, gridH: h, elevations: z } };
}

test("#845 a pit is filled and every cell drains to the outlet", () => {
  const { w, h, dx, z } = valley();
  z[30 * w + 50] -= 5;
  const f = fillDepressions(z, w, h);
  assert.ok(f[30 * w + 50] > f[31 * w + 50], "the pit now drains downstream");
  const dir = flowDirections(f, w, h, dx, dx);
  const { acc } = accumulate(dir, w, h);
  assert.equal(acc[100 * w + 50], w * h, "the whole grid reaches the south outlet");
});

test("#845 no-data cells are left out and the cells beside them drain into the gap", () => {
  const { w, h, dx, z } = valley();
  const nd = (i) => (i % w) < 3;
  const f = fillDepressions(z, w, h, nd);
  assert.ok(Number.isNaN(f[10 * w + 1]) && Number.isFinite(f[10 * w + 3]));
  const dir = flowDirections(f, w, h, dx, dx);
  assert.equal(dir[10 * w + 1], -1);
});

test("#845 Strahler order: 3 below the junction of two second-order streams", () => {
  const { w, h, dx, z } = valley();
  const dir = flowDirections(fillDepressions(z, w, h), w, h, dx, dx);
  const { acc, order } = accumulate(dir, w, h);
  const so = strahler(dir, acc, order, w, 30);
  assert.equal(so[100 * w + 50], 3);
  assert.equal(so[40 * w + 50], 2);
  assert.equal(so[60 * w + 80], 2);
});

test("#845 sites snap to the channel, catchments nest, areas add up", () => {
  const { terrain } = valley();
  const r = routeTerrain(terrain), g = gridGeometry(terrain);
  const a = snapSite(503, 100, r.acc, g, 30), b = snapSite(500, 700, r.acc, g, 30), c = snapSite(800, 400, r.acc, g, 30);
  assert.ok(a.moved <= 30.5 && r.acc[a.cell] > 9000);
  const cells = [a.cell, b.cell, c.cell], lab = subcatchments(r.dir, r.order, terrain.gridW, cells), t = siteTree(r.dir, terrain.gridW, cells, lab);
  assert.deepEqual([...t.down], [-1, 0, 0]);
  assert.equal(t.total[0], t.own[0] + t.own[1] + t.own[2]);
  assert.equal(t.total[0], r.acc[a.cell], "the outlet site's whole catchment is its accumulation");
  assert.equal(snapSite(2000, 2000, r.acc, g, 30), null);
  assert.equal(downstreamOf(b.cell, r.dir, terrain.gridW) >= 0, true);
});

test("#845 Hawkes productivity", () => {
  assert.equal(hawkes(180, 60, 0.5), 60);
  assert.equal(hawkes(30, 60, 2), -60);
  assert.equal(hawkes(null, 60, 2), null);
});

test("#845 the analysis: one sample type, ranking by productivity, follow-up only where nothing upstream is anomalous", () => {
  const { terrain } = valley();
  const route = routeTerrain(terrain);
  const S = [
    { sample_id: "A", x: 503, y: 100, medium: "stream sediment", values: { Cu: 60 } },
    { sample_id: "B", x: 500, y: 700, medium: "stream sediment", values: { Cu: 25 } },
    { sample_id: "C", x: 800, y: 400, medium: "stream sediment", values: { Cu: 180 } },
    { sample_id: "D", x: 500, y: 450, medium: "moss mat", values: { Cu: 400 } },
    { sample_id: "E", x: 5000, y: 5000, medium: "stream sediment", values: { Cu: 999 } },
  ];
  const a = analyseCatchments(S, route, terrain, { symbol: "Cu", minAreaKm2: 0.003, anomalyFrom: "percentile", percentile: 60, snapM: 30 }, { units: { Cu: "ppm" } });
  assert.equal(a.results.length, 4, "the moss mat is a different measurement");
  assert.ok(a.notes.some((n) => n.params?.n === 1 && /outside the terrain/.test(n.text)));
  const by = Object.fromEntries(a.results.map((r) => [r.sample_id, r]));
  assert.equal(by.C.rank, 1);
  assert.ok(by.C.anomalous && by.C.followUp && by.C.reachM > 0);
  assert.ok(!by.A.anomalous && !by.B.anomalous);
  const saved = analyseCatchments(S, route, terrain, { symbol: "Cu", minAreaKm2: 0.003, snapM: 30 }, { units: { Cu: "ppm" }, thresholds: [{ symbol: "Cu", values: { "stream sediment": 50 }, methodLabel: "Tukey upper fence (log)", decided: "2026-10-24" }] });
  const sb = Object.fromEntries(saved.results.map((r) => [r.sample_id, r]));
  assert.ok(sb.A.anomalous && sb.C.anomalous, "threshold 50: A (60) and C (180)");
  assert.ok(sb.C.followUp && !sb.A.followUp, "A's anomaly comes from C upstream");
  const img = catchmentImage(a);
  assert.equal(img.width * img.height * 4, img.data.length);
  assert.ok(streamNetwork(route, terrain, 300).length >= 3);
  const gpx = followUpGpx(a, (x, y) => [-130 + x / 1e5, 56 + y / 1e5]);
  assert.match(gpx, /<wpt lat="56\.004000" lon="-129\.992000"><name>C<\/name>/);
  assert.match(gpx, /<trk><name>Reach above C<\/name>/);
});

test("#845 the terrain's no-data mask is the demFill bitset (base64): its cells are left out of the routing", () => {
  const { w, h, terrain } = valley();
  const bits = new Uint8Array(Math.ceil((w * h) / 8));
  for (let i = 0; i < w * h; i++) if (i % w < 3) bits[i >> 3] |= 1 << (i & 7); // the three western columns
  const b64 = Buffer.from(bits).toString("base64");
  const r = routeTerrain({ ...terrain, noDataMask: b64 });
  assert.equal(r.dir[10 * w + 1], -1, "a masked cell has no direction");
  assert.notEqual(r.dir[10 * w + 60], -1);
  assert.equal(r.acc[10 * w + 1], 1, "nothing flows through a masked cell");
});
