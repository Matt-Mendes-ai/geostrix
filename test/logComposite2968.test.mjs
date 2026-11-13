// TASKS.csv #2968 (review #2876, WA iron) — Downhole logs 'Composite to the assay intervals': a log in the project (range and despike applied)
// averaged over each assay sample of its hole, length-weighted, a sample under half covered left out, and added as a numeric layer the
// estimation tools read (numericSources).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compositeLogToAssays, compositeLayerName, compositeNotes } from "../src/lib/logComposite.js";
import { numericSourceChoices, sourceAssays } from "../src/lib/numericSources.js";

// hole A: 2 m samples 0-2, 2-4, 4-6, 6-8 (and a pXRF reading over 0-8, left out as the pairing leaves it); log on 0.5 m bins 0-6.5, and 9-9.5
const assays = [[0, 2], [2, 4], [4, 6], [6, 8]].map(([from, to]) => ({ hole_id: "A", from, to, values: { Fe: 50 } }));
assays.push({ hole_id: "A", from: 0, to: 8, values: { Fe: 1 }, source: "pXRF" });
const bins = [];
for (let i = 0; i < 13; i++) bins.push({ hole_id: "A", from: i * 0.5, to: i * 0.5 + 0.5, value: 2 + 0.1 * i });
bins.push({ hole_id: "A", from: 9, to: 9.5, value: 7 });
const near = (a, b) => Math.abs(a - b) < 1e-9;

test("each sample: the length-weighted mean of the readings whose middle it holds, with min, max and n; thin samples and unsampled readings counted", () => {
  const data = sourceAssays(numericSourceChoices({ layers: { sg: bins }, customLayers: [] })[0], { layers: { sg: bins } });
  const res = compositeLogToAssays(data, assays);
  assert.equal(res.samples, 3);
  assert.deepEqual(res.rows.map((r) => [r.from, r.to, r.n]), [[0, 2, 4], [2, 4, 4], [4, 6, 4]]);
  assert.ok(near(res.rows[0].value, 2.15) && near(res.rows[0].min, 2) && near(res.rows[0].max, 2.3));
  assert.equal(res.thin, 1, "6-8 holds one 0.5 m bin: a quarter covered");
  assert.equal(res.unsampled, 1, "the 9 m bin is in no sample");
  assert.equal(res.readings, 13);
  // half covered is enough
  const half = compositeLogToAssays({ symbol: "x", assays: [{ hole_id: "A", from: 4, to: 5, values: { x: 3 } }] }, assays);
  assert.deepEqual(half.rows.map((r) => [r.from, r.value]), [[4, 3]]);
});

test("unequal readings weigh by their length; a point log (given a support by sourceAssays) composites too", () => {
  const data = { symbol: "x", assays: [{ hole_id: "A", from: 0, to: 1.5, values: { x: 1 } }, { hole_id: "A", from: 1.5, to: 2, values: { x: 5 } }] };
  assert.ok(near(compositeLogToAssays(data, assays).rows[0].value, (1 * 1.5 + 5 * 0.5) / 2));
  const pts = [0.25, 0.75, 1.25, 1.75].map((d, i) => ({ hole_id: "A", depth: d, value: 10 + i }));
  const pd = sourceAssays(numericSourceChoices({ layers: { magsusc: pts }, customLayers: [] })[0], { layers: { magsusc: pts } });
  const pr = compositeLogToAssays(pd, assays);
  assert.equal(pr.rows.length, 1); assert.ok(near(pr.rows[0].value, 11.5)); assert.equal(pr.rows[0].n, 4);
});

test("the range and despike come first (the readings sourceAssays gives); the result reads back as a log on the assay intervals", () => {
  const spiky = bins.map((b, i) => (i === 1 ? { ...b, value: 900 } : i === 2 ? { ...b, value: -999 } : b));
  const ch = numericSourceChoices({ layers: { sg: spiky }, customLayers: [], logValidRange: { sg: { range: [0, null], despikeM: 1 } } })[0];
  const data = sourceAssays(ch, { layers: { sg: spiky } });
  const res = compositeLogToAssays(data, assays);
  assert.ok(res.rows[0].max < 3, `the 900 spike despiked away (max ${res.rows[0].max})`);
  assert.equal(res.rows[0].n, 3, "the -999 left out by the range");
  const notes = compositeNotes(ch.label, res, { despikeM: data.despikeM, outOfRange: data.outOfRange });
  assert.match(notes, /^Composited from Specific gravity \(range 0–…, despiked 1 m\) to the assay sample intervals/);
  assert.match(notes, /1 reading\(s\) outside the log's valid range were left out first\. The readings were despiked first \(a 1 m moving median\)\./);
  const layer = { id: "c1", name: compositeLayerName(ch.symbol, []), rows: res.rows, binM: "assay" };
  assert.equal(layer.name, "Specific gravity on assay intervals");
  const back = numericSourceChoices({ layers: {}, customLayers: [layer], models: false }).find((s) => s.layerId === "c1" && s.field === "value");
  assert.equal(back.binM, "assay");
  assert.equal(sourceAssays(back, { customLayers: [layer] }).assays.length, 3);
});

test("the name is made unique; the pane's button loads the lib on the click and keeps no component state", () => {
  assert.equal(compositeLayerName("SG", [{ name: "SG on assay intervals" }, { name: "SG on assay intervals (2)" }]), "SG on assay intervals (3)");
  const p = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.match(p, /lib = await import\("\.\.\/lib\/logComposite\.js"\)/);
  assert.match(p, /const res = lib\.compositeLogToAssays\(dataAll, assays\);/);
  assert.match(p, /binM: "assay", notes: lib\.compositeNotes\(/);
  assert.match(p, /\{compositeMsg\?\.key === source\.key && <div role="status">/);
  assert.doesNotMatch(p, /import \{[^}]*\} from "\.\.\/lib\/logComposite\.js"/, "not a static import");
  assert.doesNotMatch(p, /useState\(/);
});
