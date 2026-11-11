// TASKS.csv #2188 (review #2174, WA gold) — of two *_StrucType columns the fullest is the type; alpha-only picks are counted in a notice
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fullestTypeColumn } from "../src/lib/downholeTableGuess.js";
import { guessMapping } from "../src/lib/layers.js";

test("Planar_StrucType (filled on all rows) over Linear_StrucType (blank on most)", () => {
  const headers = ["HOLEID", "GEOLFROM", "GEOLTO", "Struc_Alpha", "Struc_Beta", "Linear_StrucType", "Planar_StrucType"];
  const rows = Array.from({ length: 20 }, (_, i) => ({ Linear_StrucType: i < 2 ? "LIN" : "", Planar_StrucType: ["VN", "FLT", "BED"][i % 3] }));
  const g = guessMapping("structure", headers);
  assert.equal(g.value, "Linear_StrucType"); // the name guess the review saw
  assert.equal(fullestTypeColumn(headers, rows, g.value), "Planar_StrucType");
  assert.equal(fullestTypeColumn(["Struc_Type"], rows, "Struc_Type"), "Struc_Type"); // one candidate: the guess
  assert.equal(fullestTypeColumn(headers, rows, ""), "");
});

test("the import wires both", () => {
  const u = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(u, /if \(target === "structure" && mapping\?\.value\) return \{ \.\.\.mapping, value: fullestTypeColumn\(headers, rows, mapping\.value\) \};/);
  assert.match(u, /pick\(s\) have an alpha angle and no beta: kept unoriented/);
});
