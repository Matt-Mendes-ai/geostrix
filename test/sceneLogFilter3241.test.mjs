// TASKS.csv #3241 (#3116) — the 3D ribbons draw the built-in logs as Downhole logs read them (valid range, despike): withFilteredLogs and its wiring. SYNTHETIC.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { withFilteredLogs } from "../src/lib/numericSources.js";
const magsusc = [10, 11, 9999, 12].map((v, i) => ({ hole_id: "H1", from: i, to: i + 1, value: v }));
const layers = { magsusc, litho: [{ hole_id: "H1", from: 0, to: 4, value: "BAS" }], sg: [{ hole_id: "H1", from: 0, to: 1, value: 2.7 }] };
test("a range leaves the spike out; no range returns the same object; an unrelated change keeps the filtered array", () => {
  assert.equal(withFilteredLogs(layers, null), layers); assert.equal(withFilteredLogs(layers, {}), layers);
  const a = withFilteredLogs(layers, { magsusc: { range: [0, 5000] } });
  assert.equal(a.magsusc.length, 3); assert.equal(a.litho, layers.litho); assert.equal(a.sg, layers.sg); assert.equal(layers.magsusc.length, 4, "the project's rows are not edited");
  const b = withFilteredLogs({ ...layers, litho: [] }, { magsusc: { range: [0, 5000] } });
  assert.equal(b.magsusc, a.magsusc, "same source array and range: the same filtered array, so the scene keeps that group");
  const c = withFilteredLogs(layers, { magsusc: { range: [0, 20] } });
  assert.notEqual(c.magsusc, a.magsusc, "a new range is a new array: the group rebuilds");
  assert.ok(withFilteredLogs(layers, { magsusc: { despikeM: 3 } }).magsusc.every((r) => r.value < 100));
});
test("wired: ViewerModule builds the scene from the filtered layers", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.ok(v.includes("const sceneLayers = useMemo(() => withFilteredLogs(layers, project?.logValidRange), [layers, project?.logValidRange]);"));
  assert.ok(v.includes("layers: sceneLayers /* #3241 */") && v.includes("noHoles ? sceneLayers : layersForBuild"));
});
