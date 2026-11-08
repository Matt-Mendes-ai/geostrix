// TASKS.csv #1654 — 'Custom layer' keeps the value guess and turns a points-only table into Depth.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { customFromPrevious } from "../src/lib/viewer/customMapping.js";

test("the previous kind's value carries over; existing Custom guesses win", () => {
  const m = customFromPrevious({ hole_id: "HOLEID", from: "GEOLFROM", to: "GEOLTO", value: "" }, { hole_id: "HOLEID", from: "GEOLFROM", to: "GEOLTO", value: "Rock_Oxidation" }, [{ GEOLFROM: 1, GEOLTO: 2 }]);
  assert.equal(m.value, "Rock_Oxidation");
  assert.equal(m.from, "GEOLFROM");
  assert.equal(customFromPrevious({ value: "label" }, { value: "X" }, []).value, "label");
});

test("From = To on every row: Depth, From / To cleared; real intervals stay", () => {
  const pts = [{ GEOLFROM: 5, GEOLTO: 5 }, { GEOLFROM: 9.9, GEOLTO: "9.9" }];
  const m = customFromPrevious({ hole_id: "H", from: "GEOLFROM", to: "GEOLTO", value: "Min1" }, {}, pts);
  assert.deepEqual([m.depth, m.from, m.to], ["GEOLFROM", "", ""]);
  const iv = customFromPrevious({ hole_id: "H", from: "GEOLFROM", to: "GEOLTO", value: "Min1" }, {}, [{ GEOLFROM: 5, GEOLTO: 6 }, { GEOLFROM: 6, GEOLTO: 6 }]);
  assert.deepEqual([iv.depth, iv.from, iv.to], [undefined, "GEOLFROM", "GEOLTO"]);
});

test("the dialog uses it when switching to Custom", () => {
  assert.match(fs.readFileSync("src/components/ImportMappingModal.jsx", "utf8"), /if \(target === "custom"\) mapping = customFromPrevious\(mapping, modal\.mapping \|\| \{\}, modal\.allRows \|\| modal\.sampleRows \|\| \[\]\);/);
});
