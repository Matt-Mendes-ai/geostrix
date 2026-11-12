// TASKS.csv #2329 (review #2325, WA uranium) — a From / To gamma log at 5 cm is a downhole log, its readings at the interval middles;
// "Raw_cps" is a channel
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { looksLikeLogTable, logChannelColumns, logChannelsFor, logChannelRows, readingDepth } from "../src/lib/downholeLogChannels.js";
import { guessTargetFor, guessMapping } from "../src/lib/layers.js";

const H = ["Hole_ID", "mFrom", "mTo", "Priority", "Raw_cps", "eU3O8_cased_ppm"];
const rows = Array.from({ length: 40 }, (_, i) => ({ Hole_ID: i < 20 ? "A" : "B", mFrom: +(0.05 * (i % 20)).toFixed(2), mTo: +(0.05 * (i % 20) + 0.05).toFixed(2), Priority: 1, Raw_cps: 100 + i, eU3O8_cased_ppm: i % 7 }));

test("the WA gamma log is a downhole log, not Lithology", () => {
  assert.equal(looksLikeLogTable(H), true);
  assert.equal(guessTargetFor(H, "geophysics_2.csv"), "custom"); // was litho, then 'looked like Lithology' over the real log
  // an interval table without a log-only channel stays what it was
  assert.equal(looksLikeLogTable(["HOLEID", "FROM", "TO", "Density"]), false);
  assert.equal(guessTargetFor(["HOLEID", "FROM", "TO", "LITH", "Density"], "lith.csv"), "litho");
  assert.equal(looksLikeLogTable(["HOLEID", "FROM", "TO", "Alpha", "Beta", "Gamma"]), false); // oriented core's Gamma is an angle
});

test("Raw_cps and eU3O8 are channels (ticked); Priority is not one", () => {
  const m = guessMapping("custom", H);
  assert.equal(m.from, "mFrom"); assert.equal(m.to, "mTo"); assert.ok(!m.depth);
  const ch = logChannelColumns(H, rows, m);
  assert.deepEqual(ch.map((c) => [c.col, c.unit, c.named]), [["Raw_cps", "cps", true], ["eU3O8_cased_ppm", "ppm", true]]);
  assert.deepEqual(logChannelsFor("custom", H, rows, m, null), ["Raw_cps", "eU3O8_cased_ppm"]);
  // a lithology-style interval mapping never gets the log route
  assert.equal(logChannelsFor("custom", ["HOLEID", "FROM", "TO", "Density"], [{ HOLEID: "A", FROM: 0, TO: 1, Density: 2.7 }], { hole_id: "HOLEID", from: "FROM", to: "TO" }, null), null);
});

test("readings sit at the interval middles, raw and binned", () => {
  const m = guessMapping("custom", H);
  assert.ok(Math.abs(readingDepth(rows[1], m) - 0.075) < 1e-12);
  const raw = logChannelRows(rows, m, "Raw_cps", null);
  assert.equal(raw.rows.length, 40); assert.ok(Math.abs(raw.rows[0].depth - 0.025) < 1e-12);
  const bin = logChannelRows(rows, m, "Raw_cps", 0.5);
  assert.deepEqual(bin.rows.filter((r) => r.hole_id === "A").map((r) => [r.from, r.to, r.n]), [[0, 0.5, 10], [0.5, 1, 10]]);
});

test("the dialog shows the channels box for the interval log and says where the readings go", () => {
  const b = readFileSync(new URL("../src/components/LogChannelsBox.jsx", import.meta.url), "utf8");
  assert.match(b, /interval = !modal\.mapping\?\.depth && modal\.mapping\?\.from && modal\.mapping\?\.to && looksLikeLogTable\(modal\.headers, rows\)/); // rows: #2884
  assert.match(b, /Each reading is placed at the middle of its From–To interval/);
  const ip = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(ip, /Each reading placed at the middle of its \$\{mapping\.from\}-\$\{mapping\.to\} interval\./);
});
