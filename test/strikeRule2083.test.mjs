// TASKS.csv #2083 (review #2013, Surface Geology) — a strike-only file was always read by the right-hand rule: a left-hand-rule notebook
// turned every plane 180°. The column check now has a strike convention and an optional dip-quadrant column.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStructureRows, guessStructureColumns } from "../src/lib/mapLayers.js";
const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const cols = { x: "x", y: "y", dip: "dip", strike: "strike", dipDir: "dd", dipQuad: "q" };
const rows = [{ x: 1, y: 1, dip: 40, strike: 250 }, { x: 1, y: 1, dip: 40, strike: 250, q: "N" }, { x: 1, y: 1, dip: 40, strike: 250, q: "s" }, { x: 1, y: 1, dip: 40, strike: 135, dd: 45 }];

test("right-hand rule by default; left-hand rule when chosen; the quadrant settles each row either way", () => {
  const rhr = parseStructureRows(rows, cols), lhr = parseStructureRows(rows, { ...cols, strikeRule: "lhr" });
  assert.deepEqual(rhr.rows.map((r) => r.dipDir), [340, 340, 160, 45]);
  assert.deepEqual(lhr.rows.map((r) => r.dipDir), [160, 340, 160, 45]); // the reviewer's S04: an LHR strike 250 dips to 160
  assert.equal(rhr.strikeRule, "rhr"); assert.equal(lhr.strikeRule, "lhr");
  assert.equal(rhr.fromQuadrant, 2); assert.equal(rhr.derivedFromStrike, 1);
});
test("the strike / dip-direction check follows the chosen rule", () => {
  assert.equal(parseStructureRows(rows, cols).rhrMismatches, 1); // S03 (strike 135, dd 45) is left-hand
  assert.equal(parseStructureRows(rows, { ...cols, strikeRule: "lhr" }).rhrMismatches, 0);
});
test("an unreadable quadrant falls back to the rule and is counted; a quadrant column is guessed", () => {
  assert.equal(parseStructureRows([{ x: 1, y: 1, dip: 40, strike: 250, q: "up" }], cols).quadrantUnread, 1);
  assert.equal(guessStructureColumns(["Easting", "Northing", "Strike", "Dip", "Dip quadrant"]).dipQuad, "Dip quadrant");
});
test("the column check offers the convention; the notice names it", () => {
  assert.match(p, /aria-label=\{tr\("Strike convention"\)\}/);
  assert.match(p, /\["dipQuad", tr\("Dip quadrant"\)\]/);
  assert.match(p, /derived from strike by the left-hand rule \(strike − 90°\)/);
});
