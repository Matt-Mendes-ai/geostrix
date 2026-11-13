// TASKS.csv #3133 (split from #3100) — a BC sample's card on the empty 3D View loaded before asking: the tab was renamed and an error notice
// showed behind the download dialog. loadSample now asks first (the 'geostrix-sample-missing' event App.jsx answers) and stops there.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { askSampleDownload } from "../src/lib/sampleCards.js";

test("a BC sample not on this computer asks, and nothing else does", async () => {
  const asked = [];
  const dispatch = (id) => asked.push(id);
  assert.equal(await askSampleDownload("harry", async () => ({ harry: "missing" }), dispatch), true);
  assert.equal(await askSampleDownload("harry", async () => ({ harry: "downloaded" }), dispatch), false);
  assert.equal(await askSampleDownload("harry", async () => ({ harry: "bundled" }), dispatch), false);
  assert.equal(await askSampleDownload("silvertip", async () => ({}), dispatch), false, "a browser preview: every sample served");
  assert.equal(await askSampleDownload("wa_iron", async () => ({ wa_iron: "missing" }), dispatch), false, "not a BC sample: shipped");
  assert.equal(await askSampleDownload("perk", async () => { throw new Error("no IPC"); }, dispatch), false);
  assert.deepEqual(asked, ["harry"]);
});

test("loadSample asks before it renames the tab", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(v, /const loadSample = async \(which\) => \{\n\s*if \(await askSampleDownload\(which\)\) return;[^\n]*\n\s*store\.setProjectName\(/);
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.ok(app.includes('window.addEventListener("geostrix-sample-missing"'), "App answers the event with the download dialog");
});
