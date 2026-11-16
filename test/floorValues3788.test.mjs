// TASKS.csv #3788 — the detection floor modelled as grade: said, and the floor values can be left out or set to a stated value
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { floorElements, applyFloorModes } from "../src/lib/floorShare.js";

// 100 silver results: 86 exactly 1 (the half-limit), 14 real values; no '<' flags (the Scottie Gold shape)
const rows = Array.from({ length: 100 }, (_, i) => ({ hole_id: "H1", from: i, to: i + 1, values: { Ag: i < 86 ? 1 : 2 + i / 10, Au: 0.1 + i / 100 } }));
const found = floorElements(rows, ["Ag", "Au"], { Ag: "ppm", Au: "ppm" });

test("silver is found mostly on its floor (86 %), gold is not", () => {
  assert.equal(found.length, 1); assert.equal(found[0].symbol, "Ag"); assert.equal(found[0].floor, 1);
  assert.ok(found[0].share > 0.8);
});
test("keep changes nothing; leave out drops the floor values; set puts the stated value in", () => {
  assert.equal(applyFloorModes(rows, found, {}), rows);
  assert.equal(applyFloorModes(rows, found, { Ag: { mode: "keep" } }), rows);
  const out = applyFloorModes(rows, found, { Ag: { mode: "out" } });
  assert.equal(out.filter((r) => typeof r.values.Ag === "number").length, 14);
  assert.equal(out[0].values.Au, 0.1, "the other elements of the row stay");
  const set = applyFloorModes(rows, found, { Ag: { mode: "set", value: "0.25" } });
  assert.equal(set.filter((r) => r.values.Ag === 0.25).length, 86);
  assert.equal(rows[0].values.Ag, 1, "the input rows are not changed");
  assert.equal(applyFloorModes(rows, found, { Ag: { mode: "set", value: "" } }), rows, "no value typed: nothing changes yet");
});
test("wired: the estimate dialog (note, choice, record), Grade-tonnage's warning and the shell's proposal above the floor", () => {
  const e = fs.readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(e, /const srcAssays = useMemo\(\(\) => applyFloorModes\(srcAssaysRaw, floorsFound, floorModes\)/);
  assert.match(e, /floorValues: floorsFound\.map/);
  const g = fs.readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.match(g, /floorKept\.length > 0 && <div role="note"/);
  const m = fs.readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(m, /if \(p90 <= v\[0\]\)/);
});
