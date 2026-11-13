// TASKS.csv #3085 (from #2905) — the layer-cake grids built in a worker with progress (they blocked the window 2.8-3.8 s), and the layer-cake
// question asked before the pre-solve notices, so a run that takes it does not say them twice.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { layerCake } from "../src/lib/layerCake.js";
import { runLayerCake } from "../src/lib/layerCakeClient.js";

const holes = []; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) holes.push({ id: `H${i}_${j}`, x: 50 + i * 120, y: 50 + j * 120 });
const specs = ["A", "B", "C"].map((u, k) => ({ meshName: u, orientations: [{ x: 0 }], codes: [u], points: holes.map((h) => ({ x: h.x, y: h.y, z: 450 - 0.01 * h.x - k * 6, hole_id: h.id, srcCode: u })) }));
const EXT = [0, 1000, 0, 1000, 380, 470], RES = [10, 10, 5];

test("the client gives the cake the function gives, with progress after each top and the block (no Worker here: on this thread)", async () => {
  const seen = [];
  const r = await runLayerCake(specs, EXT, RES, { evalPts: [[500, 500, 440]], onProgress: (d, t) => seen.push([d, t]) });
  const direct = layerCake(specs.map((s) => ({ meshName: s.meshName, points: s.points })), EXT, RES, { evalPts: [[500, 500, 440]] });
  assert.deepEqual(r.surfaces, direct.surfaces);
  assert.deepEqual(Array.from(r.block.ids), Array.from(direct.block.ids));
  assert.deepEqual(r.evaluated, direct.evaluated);
  assert.deepEqual(seen, [[1, 4], [2, 4], [3, 4], [4, 4]]);
  assert.match((await runLayerCake([{ meshName: "A", points: [] }], EXT, RES)).error, /no top picks/);
});

test("wiring: the run uses the worker client; the held pre-solve notices are said after the question, then the model box", () => {
  const s = fs.readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(s, /const r = await runLayerCake\(specs\.filter\(\(sp\) => !sp\.fault\), extent, resolution, \{ evalPts, faults: specs\.filter\(\(sp\) => sp\.fault\), onProgress: \(done, total\) => setTaskProgress/); // faults: #3086
  assert.match(s, /held\.push\(notice\(onlyEstimate \? "Pick check before solving/);
  assert.match(s, /if \(thinSpecs\.length\) held\.push\(notice\("Too few contacts/);
  const offer = s.indexOf("return runSurfaceStack(rawSpecs, { ...stackOpts, engine: \"layercake\", offerCake: false });");
  const flush = s.indexOf("if (held.length) setNotices((p) => [...p, ...held]);"), box = s.indexOf("notice(anisotropy.enabled ? \"Model box");
  assert.ok(offer > 0 && flush > offer && box > flush, "question, then the held notices, then the box");
  const w = fs.readFileSync(new URL("../src/lib/layerCake.worker.js", import.meta.url), "utf8");
  assert.match(w, /self\.postMessage\(\{ id, progress: \[done, total\] \}\)/);
});
