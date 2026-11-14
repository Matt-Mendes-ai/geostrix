// TASKS.csv #2342 (review #2325) — the bundled WA uranium sample: oxidation as a Weathering table, the gamma log as two channels with units
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTableText } from "../src/lib/tabular.js";

const dir = new URL("../sample_data/wa_uranium/", import.meta.url);
const t = (f) => parseTableText(readFileSync(new URL(f, dir), "utf8"));

test("weath.csv: the oxidation of every current lithology interval that has one", () => {
  const w = t("weath.csv").rows, li = t("litho.csv").rows;
  assert.equal(w.length, li.filter((r) => String(r.oxidation ?? "").trim()).length);
  assert.deepEqual([...new Set(w.map((r) => r.weathering))].sort(), ["HR", "LR", "NR", "OX", "RD", "TR"]);
  const u = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(u, /files: \["collars\.csv", "survey\.csv", "litho\.csv", "alt\.csv", "weath\.csv"\]/);
  const b = readFileSync(new URL("../scripts/samples/build-wa-uranium.mjs", import.meta.url), "utf8");
  assert.match(b, /write\("weath\.csv", \["hole_id", "from", "to", "weathering"\]/); // a rebuild keeps it
});

test("the gamma channels each get a layer with a unit", () => {
  const s = readFileSync(new URL("../src/lib/sampleWaUranium.js", import.meta.url), "utf8");
  assert.match(s, /name: WA_URANIUM_CPS_LAYER, rows: cps, unit: "cps" \}/);
  assert.match(s, /name: WA_URANIUM_GAMMA_LAYER, rows, unit: "ppm" \}/);
});
