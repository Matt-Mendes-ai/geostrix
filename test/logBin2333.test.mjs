// TASKS.csv #2333 (review #2325, WA uranium) — the log bin follows the ticked channels until the user picks one; the text never says
// "averaged" over a menu reading "Every reading"
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { effectiveLogBin, logBoxPatch, defaultLogBin, LOG_RAW_BUDGET } from "../src/lib/downholeLogChannels.js";

test("ticking channels leaves the bin unchosen: it follows the budget (the review's 439,225 readings x 3 channels -> 0.5 m)", () => {
  const n = 150000; // TASKS.csv #2430 lowered the budget to 200,000 values: a 150,000-reading log, one channel under it, two over
  let modal = { target: "custom" };
  assert.equal(effectiveLogBin(modal, n, 1), null); // 150,000 values: under the budget, every reading
  modal = logBoxPatch(modal, ["eU3O8"], { logChannels: ["eU3O8", "Priority"] }); // the first tick (the box's set())
  assert.equal(modal.logBinM, undefined); // it used to store null here: "every reading" as if chosen
  modal = logBoxPatch(modal, modal.logChannels, { logChannels: [...modal.logChannels, "Raw_cps"] });
  assert.equal(effectiveLogBin(modal, n, modal.logChannels.length), 0.5); // 450,000 values: binned, as the text says
  assert.equal(defaultLogBin(n, 3), 0.5); assert.ok(n * 3 > LOG_RAW_BUDGET);
  // a bin picked in the menu is kept, whatever is ticked after
  modal = logBoxPatch(modal, modal.logChannels, { logBinM: null });
  modal = logBoxPatch(modal, modal.logChannels, { logChannels: ["eU3O8"] });
  assert.equal(effectiveLogBin(modal, n, 1), null);
  assert.equal(effectiveLogBin(logBoxPatch(modal, ["eU3O8"], { logBinM: 1 }), n, 3), 1);
});

test("the box writes no bin on a tick, shows the menu whenever a channel is ticked, and the text matches the menu; the import reads the same rule", () => {
  const b = readFileSync(new URL("../src/components/LogChannelsBox.jsx", import.meta.url), "utf8");
  assert.match(b, /const set = \(patch\) => onChange\(logBoxPatch\(modal, ticked, patch\)\);/);
  assert.doesNotMatch(b, /logBinM: binM, \.\.\.patch/);
  assert.match(b, /\{ticked\.length > 0 \? \(/);
  assert.match(b, /over && binM\s*\? tr\("\{n\} readings × \{k\} channel\(s\) is more than GeoStrix keeps reading by reading on this computer: they are averaged/);
  assert.match(b, /Every reading is kept \(about \{mb\} MB of memory\)\. A bin averages them/);
  const u = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(u, /const binM = data\.logBinM !== undefined \? data\.logBinM : defaultLogBin\(readings, chans\.length, needsBinning\(readings, chans\.length\) \? logBinEstimate\(src, mapping\) : null\);/); // the estimate: #2885
});
