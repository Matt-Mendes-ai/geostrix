// TASKS.csv #2388 — a model keeps a stamp of the lithology log it read; when the log is replaced or edited, the Last model line is greyed with
// a note and the surfaces built from the older log get a 'source changed' badge. A model made before stamps existed is never marked.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { layerStamp, isStaleStamp } from "../src/lib/layerStamp.js";

const log = [{ hole_id: "H1", from: 0, to: 10, value: "SST" }, { hole_id: "H1", from: 10, to: 25, value: "MST" }, { hole_id: "H2", from: 0, to: 5, value: "SST" }];

test("the same log, the same stamp; a re-import with the same rows (new objects) too", () => {
  assert.equal(layerStamp(log), layerStamp(log.map((r) => ({ ...r, extra: "ignored" }))));
  assert.match(layerStamp(log), /^3:[0-9a-f]{8}$/);
  assert.equal(layerStamp([]), layerStamp(null));
});

test("a changed code, depth, hole, row order or count changes the stamp", () => {
  const s = layerStamp(log);
  for (const changed of [
    log.map((r, i) => (i === 1 ? { ...r, value: "SLT" } : r)),
    log.map((r, i) => (i === 0 ? { ...r, to: 10.5 } : r)),
    log.map((r, i) => (i === 2 ? { ...r, hole_id: "H3" } : r)),
    [log[1], log[0], log[2]],
    log.slice(0, 2),
    [{ hole_id: "H1", from: 0, to: 1, value: "ab" }].concat(log.slice(1)),
  ]) assert.notEqual(layerStamp(changed), s);
  // the separator: "H1" + "0" is not "H10" + ""
  assert.notEqual(layerStamp([{ hole_id: "H1", from: "0", to: 1, value: "x" }]), layerStamp([{ hole_id: "H10", from: "", to: 1, value: "x" }]));
});

test("stale only when the model has a stamp and it differs", () => {
  assert.equal(isStaleStamp("3:aa", "3:aa"), false);
  assert.equal(isStaleStamp("3:aa", "2:bb"), true);
  assert.equal(isStaleStamp(undefined, "2:bb"), false, "a model made before stamps: unknown, not stale");
});

test("wiring: runs stamp their surfaces; the last model is stamped; the line and the surface rows are marked", () => {
  const r = fs.readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /lithoStamp: layerStamp\(layers\.litho\),/);
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const setLastLithBlock = \(lb\) => setLastLithBlockRaw\(lb && \{ \.\.\.lb, lithoStamp: layerStamp\(layers\.litho\) \}\);/);
  assert.match(v, /const lithoNow = useMemo\(\(\) => layerStamp\(layers\.litho\), \[layers\.litho\]\);/);
  assert.match(v, /opacity: isStaleStamp\(lastLithBlock\.lithoStamp, lithoNow\) \? 0\.55 : 1/);
  assert.match(v, /\{isStaleStamp\(s\.params\?\.lithoStamp, lithoNow\) && <span[^\n]*>\{tr\("source changed"\)\}<\/span>\}/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(fs.readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["source changed"], l);
});
