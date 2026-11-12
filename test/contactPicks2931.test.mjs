// TASKS.csv #2931 (WA iron review) — Contact picks froze 9-12.6 s opening on 6,390 holes / 150,455 strand intervals: every interval
// looked its hole up with traces.find. The intercepts are now lib/viewer/boundaryIntercepts.js, with a hole -> trace Map and a binary
// search per trace (modelHelpers traceOfHole / traceAtOf): the same rows, at the review's size in well under a second.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { boundaryIntercepts } from "../src/lib/viewer/boundaryIntercepts.js";
import { findOnTrace, interceptId, traceAtOf, traceOfHole } from "../src/lib/viewer/modelHelpers.js";
import { intervalEndIndex, intervalStartIndex, upperContactOf } from "../src/lib/viewer/intervals.js";

const sceneToApi = (p) => ({ x: p.x, y: -p.z, z: p.y });
const ORIGIN = { x: 500000, y: 7000000, z: 0 };
const CODES = ["ALU", "DIW", "CLA", "BIF", "SHA", "CHT"];

// nHoles vertical-ish holes of `stations` points, each logged in `per` intervals (back-to-back rows of one code now and then, and one
// up-hole so the #569 rule is exercised)
function project(nHoles, per, stations = 17) {
  const traces = [], litho = [];
  for (let h = 0; h < nHoles; h++) {
    const id = `H${h}`, depth = per * 2, pts = [];
    const up = h % 97 === 5;
    for (let k = 0; k < stations; k++) { const md = (depth * k) / (stations - 1); pts.push({ md, x: h * 3 + md * 0.01, y: up ? 400 + md * 0.5 : 400 - md, z: -h * 2 }); }
    traces.push({ hole_id: id, pts });
    for (let i = 0; i < per; i++) litho.push({ hole_id: id, from: i * 2, to: i * 2 + 2, value: CODES[(h + Math.floor(i / 2)) % CODES.length] });
  }
  return { traces, layers: { litho, alt: [], vein: [] } };
}

// the loop as it stood before #2931 (traces.find and findOnTrace per interval)
function before(layers, traces, o) {
  const out = [];
  [["litho", "Lithology"], ["alt", "Alteration"], ["vein", "Vein / dyke"]].forEach(([layerKey, layerLabel]) => {
    const ends = intervalEndIndex(layers[layerKey]), starts = intervalStartIndex(layers[layerKey]);
    (layers[layerKey] || []).forEach((r) => {
      if (isNaN(r.from)) return;
      const t = traces.find((tc) => tc.hole_id === r.hole_id);
      if (!t) return;
      const top = upperContactOf(r, (md) => findOnTrace(t.pts, md)?.y, { startIndex: starts, endIndex: ends, codes: new Set([r.value]) });
      if (top.continues) return;
      const p = findOnTrace(t.pts, top.md);
      if (!p) return;
      const api = sceneToApi(p);
      out.push({ id: interceptId(layerKey, r), layerKey, layerLabel, hole_id: r.hole_id, unit: r.value, from: top.md, x: api.x + o.x, y: api.y + o.y, z: api.z + o.z });
    });
  });
  return out;
}

test("the same intercepts as before, an up-hole and a hole with no trace included", () => {
  const { traces, layers } = project(300, 24);
  layers.litho.push({ hole_id: "NOTRACE", from: 0, to: 5, value: "ALU" }, { hole_id: "H1", from: NaN, to: 3, value: "ALU" });
  layers.vein = [{ hole_id: "H7", from: 3.3, to: 3.9, value: "QV" }, { hole_id: "H200", from: 47.5, to: 60, value: "QV" }]; // the second past the trace's end
  const got = boundaryIntercepts(layers, traces, ORIGIN, sceneToApi);
  assert.deepEqual(got, before(layers, traces, ORIGIN));
  assert.ok(got.some((i) => i.hole_id === "H5" && i.from > 0), "the up-hole's tops are at `to`");
  assert.ok(!got.some((i) => i.hole_id === "NOTRACE"));
});

test("traceOfHole is the first trace of the hole, rebuilt for a new list; traceAtOf matches findOnTrace", () => {
  const a = { hole_id: "A", pts: [{ md: 0, x: 0, y: 0, z: 0 }, { md: 10, x: 0, y: -10, z: 0 }] }, a2 = { hole_id: "A", pts: [] };
  const list = [a, a2];
  assert.equal(traceOfHole(list, "A"), a);
  assert.equal(traceOfHole(list, "B"), undefined);
  assert.equal(traceOfHole([a2], "A"), a2, "another list, another map");
  assert.equal(traceOfHole(null, "A"), undefined);
  for (const md of [-5, 0, 3.3, 10, 10.005, 25]) assert.deepEqual(traceAtOf(a.pts)(md), findOnTrace(a.pts, md), String(md));
  assert.equal(traceAtOf([])(3), null);
  assert.equal(traceAtOf(undefined)(3), null);
  assert.equal(traceAtOf(a.pts), traceAtOf(a.pts), "built once per trace");
});

test("the review's size (6,390 holes, about 150,000 intervals) in well under a second", () => {
  const { traces, layers } = project(6390, 24);
  const t0 = performance.now();
  const got = boundaryIntercepts(layers, traces, ORIGIN, sceneToApi);
  const ms = performance.now() - t0;
  assert.ok(got.length > 50000, String(got.length));
  assert.ok(ms < 1500, `${ms.toFixed(0)} ms (the traces.find loop took about 10 s on this machine)`);
});

test("wiring: the hook calls the lib; the model runs and the domain / ellipsoid filters use traceOfHole", () => {
  const hook = fs.readFileSync(new URL("../src/modules/viewer/useModelling.js", import.meta.url), "utf8");
  assert.match(hook, /const computeIntercepts = useCallback\(\(\) => boundaryIntercepts\(layers, tracesRef\.current, originRef\.current, sceneToApi\), \[layers\.litho, layers\.alt, layers\.vein\]\);/);
  for (const f of ["../src/modules/viewer/modellingRuns.js", "../src/modules/ViewerModule.jsx"]) {
    const s = fs.readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(s, /traces\.find\(\((tc|tr)\) => \1\.hole_id === (r|s|c)\.hole_id\)/, f);
  }
});
