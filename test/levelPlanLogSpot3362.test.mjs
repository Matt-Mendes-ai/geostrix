// TASKS.csv #3362 (#3249's follow-up, WA uranium's gamma log) — a numeric log read at depths (a custom point layer, Mag. susc.) on a vertical
// hole put a slab's readings on one spot of the plan; they now show as the highest of them, the tooltip saying so, as #3249 does for assays.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { highestOnSpot } from "../src/modules/viewer/levelPlanBuild.js";

const g = (md, value, extra = {}) => ({ hole_id: "U1", md, x: 10, y: 20.1 * (md > 100 ? 0 : 1), color: "#f00", label: `Gamma: ${value}`, layer: "custom:gamma", value, ...extra });

test("one hole's readings of one layer on one spot: the highest, saying of how many", () => {
  const out = highestOnSpot([g(50, 120), g(50.1, 340), g(50.2, "95"), g(50.3, 210)]);
  assert.equal(out.length, 1);
  assert.equal(out[0].md, 50.1);
  assert.match(out[0].label, /^Gamma: 340 \(highest of 4 in the slab\)$/);
});

test("other layers, other holes, other spots and readings with no number stay as they are; assays by their own element", () => {
  const ms = { hole_id: "U1", md: 50, x: 10, y: 20.1, layer: "magsusc", value: 12, label: "Mag. susc.: 12" };
  const other = { ...g(50, 999), hole_id: "U2" }, text = g(50, "", { label: "Gamma: blank" }), apart = { ...g(50, 5), x: 40 };
  const au = (v) => ({ hole_id: "U1", md: 50, x: 10, y: 20.1, label: `Au: ${v}`, assay: { sym: "Au", value: v } });
  const out = highestOnSpot([g(50, 1), g(50, 2), ms, other, text, apart, au(0.2), au(3.1)]);
  assert.deepEqual(out.map((p) => p.label.split(" (")[0]), ["Gamma: 2", "Mag. susc.: 12", "Gamma: 999", "Gamma: blank", "Gamma: 5", "Au: 3.1"]);
});

test("the readings carry their value from the 3D View's primitives to the plan", () => {
  const b = fs.readFileSync(new URL("../src/modules/viewer/levelPlanBuild.js", import.meta.url), "utf8");
  assert.match(b, /assay: pt\.assay \|\| null, layer: pt\.layer, value: pt\.value \}\);/);
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /layer: `custom:\$\{layer\.id\}`, value: row\.value \}\);/);
  assert.match(v, /layer: key, value: meta\.numeric \? row\.value : undefined \}\);/);
});
