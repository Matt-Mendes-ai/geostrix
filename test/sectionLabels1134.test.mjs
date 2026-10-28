// TASKS.csv #1134 — section labels in one collision pass; planned holes drawn over everything
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveLabels } from "../src/lib/sectionLabels.js";

test("#1134 a label that would overlap a hole name moves to its next spot; a depth number with no room is left out", () => {
  const hole = [{ x: 100, y: 100, w: 60, h: 11 }]; // centre-x / baseline-y, as placeLabels returns
  const out = resolveLabels([
    { key: "off", text: "+49…+50 m", size: 9, prio: 2, cands: [{ x: 90, y: 100, anchor: "start" }, { x: 90, y: 130, anchor: "start" }] },
    { key: "d300", text: "300", size: 8, prio: 1, cands: [{ x: 100, y: 100, anchor: "middle" }] },
  ], hole);
  assert.deepEqual(out.map((l) => [l.key, l.y]), [["off", 130]]);
});

test("#1134 higher priority places first; two labels never share a spot", () => {
  const out = resolveLabels([
    { key: "depth", text: "400", size: 8, prio: 1, cands: [{ x: 0, y: 50, anchor: "start" }, { x: 0, y: 80, anchor: "start" }] },
    { key: "pierce", text: "559.3 m · FAULT2", size: 9, prio: 3, cands: [{ x: 0, y: 50, anchor: "start" }] },
  ]);
  assert.deepEqual(out.map((l) => [l.key, l.y]), [["pierce", 50], ["depth", 80]]);
});

test("#1134 the section draws planned holes after the ribbons and contacts, and the labels last", () => {
  const s = fs.readFileSync("src/components/SectionWindow.jsx", "utf8");
  const at = (t) => s.indexOf(t);
  assert.ok(at("{intervals.map((row, i) => {") < at("{plannedHoles.map((ph, i) => {"));
  assert.ok(at("{contacts.map((c) => (") < at("{plannedHoles.map((ph, i) => {"));
  assert.ok(at("{plannedHoles.map((ph, i) => {") < at("resolveLabels(floatLabels, holeLabelBoxes)"));
});
