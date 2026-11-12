// TASKS.csv #2958 (WA iron review) — a horizontal reading (dip 0, or 'flat' / 'horizontal') needs no dip direction: kept, not skipped
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStructureRows, upwardPole } from "../src/lib/mapLayers.js";

const cols = { x: "E", y: "N", dip: "Dip", dipDir: "DD", strike: null, type: "Type", station: "Stn" };
const rows = [
  { Stn: "A1", E: "1", N: "2", Dip: "0", DD: "", Type: "Bedding" },
  { Stn: "A2", E: "1", N: "2", Dip: "flat", DD: "", Type: "Bedding" },
  { Stn: "A3", E: "1", N: "2", Dip: "Horizontal", DD: "", Type: "Bedding" },
  { Stn: "A4", E: "1", N: "2", Dip: "12", DD: "", Type: "Bedding" },
  { Stn: "", E: "1", N: "2", Dip: "8", DD: "", Type: "Bedding" },
  { Stn: "A6", E: "1", N: "2", Dip: "0", DD: "135", Type: "Bedding" },
];

test("dip 0, 'flat' and 'horizontal' with no direction are kept as flat planes with a vertical pole; a dipping row with none is skipped and named", () => {
  const out = parseStructureRows(rows, cols);
  assert.equal(out.rows.length, 4);
  assert.equal(out.horizontal, 3);
  for (const r of out.rows.slice(0, 3)) { assert.equal(r.dip, 0); assert.equal(r.dipDir, 0); assert.equal(r.horizontal, true); assert.deepEqual(upwardPole(r.dipDir, r.dip).map((v) => +v.toFixed(9)), [0, 0, 1]); }
  assert.equal(out.rows[3].horizontal, undefined, "a dip 0 with a recorded direction keeps it and is not flagged");
  assert.equal(out.rows[3].dipDir, 135);
  assert.equal(out.skipWhy.noDirection, 2);
  assert.deepEqual(out.skipNames.noDirection, ["A4", "row 6"]);
});

test("a bearing that is not a number on a dip 0 row is still 'not read', not made horizontal", () => {
  const out = parseStructureRows([{ Stn: "B", E: "1", N: "2", Dip: "0", DD: "N45E", Type: "" }], cols);
  assert.equal(out.rows.length, 0); assert.equal(out.skipWhy.bearingUnread, 1);
});

test("the typed form, the notice, the disc cross and Identify", () => {
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /\(Number\.isFinite\(n\(typing\.dipDir\)\) \|\| n\(typing\.dip\) === 0\)/);
  assert.match(p, /out\.horizontal \? tr\(" \{n\} horizontal reading\(s\)/);
  assert.match(p, /skipReasons\(out\.skipWhy, out\.skipNames\)/);
  assert.match(readFileSync(new URL("../src/lib/viewer/sceneBuilders.js", import.meta.url), "utf8"), /if \(r\.horizontal \|\| r\.dip === 0\) \{ \/\/ TASKS\.csv #2958/);
  assert.match(readFileSync(new URL("../src/lib/viewer/identify.js", import.meta.url), "utf8"), /r\.horizontal \? tr\("none \(horizontal\)"\)/);
});
