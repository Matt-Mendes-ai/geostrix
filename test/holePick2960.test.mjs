// TASKS.csv #2960 (review #2876, WA iron) — a grade card's Holes pick by the import's own 'hole type' class read no hole: the pick
// 'hole type=Reverse circulation (RC)' went through the typed filter, which splits on spaces. The card now matches the pick whole, and the
// Atlas list writes it in the typed form ('_' for spaces), as the 3D View's hole list does.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { collarsWithPick, collarsMatching, pickTerm, collarAttrChoices } from "../src/lib/holeFilter.js";

const C = [
  { hole_id: "RHRC001", attrs: { "hole type": "Reverse circulation (RC)", DrillholeType: "RC" } },
  { hole_id: "RHRC002", attrs: { hole_type: "Reverse circulation (RC)", DrillholeType: "RC" } },
  { hole_id: "RHDD001", attrs: { "hole type": "Diamond (DD)", DrillholeType: "DD" } },
  { hole_id: "X", attrs: { "hole type": "Reverse circulation (RC) twin" } },
];
const ids = (list) => list.map((c) => c.hole_id);

test("#2960 a pick with spaces in its field and value reads the holes it names", () => {
  assert.deepEqual(ids(collarsMatching(C, "hole type=Reverse circulation (RC)")), [], "the typed filter split it: the bug");
  for (const ch of collarAttrChoices(C)) for (const v of ch.values) {
    const want = C.filter((c) => Object.entries(c.attrs).some(([k, x]) => k.replace(/_/g, " ").toLowerCase() === ch.key.replace(/_/g, " ").toLowerCase() && x === v));
    assert.deepEqual(ids(collarsWithPick(C, `${ch.key}=${v}`)), ids(want), `${ch.key}=${v}`);
  }
  assert.deepEqual(ids(collarsWithPick(C, "hole type=Reverse circulation (RC)")), ["RHRC001", "RHRC002"], "both spellings of the field (#2488), the value whole");
  assert.deepEqual(ids(collarsWithPick(C, "DrillholeType=RC")), ["RHRC001", "RHRC002"]);
  assert.deepEqual(ids(collarsWithPick(C, "RHDD")), ["RHDD001"], "no '=': a typed filter");
});

test("#2960 the typed form of a pick goes through the typed filter", () => {
  assert.equal(pickTerm("hole type", "Reverse circulation (RC)"), "hole_type=Reverse_circulation_(RC)");
  assert.deepEqual(ids(collarsMatching(C, pickTerm("hole type", "Reverse circulation (RC)"))), ["RHRC001", "RHRC002"]);
});

test("#2960 wiring: the grade card matches its pick whole; the Atlas list writes the typed form", () => {
  const ev = fs.readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.ok(ev.includes("new Set(collarsWithPick(collars, opts.value).map((c) => c.hole_id))"));
  assert.ok(!ev.includes("collarsMatching("), "the card reads no typed filter");
  const at = fs.readFileSync(new URL("../src/components/GenerateAtlasModal.jsx", import.meta.url), "utf8");
  assert.ok(at.includes("value={pickTerm(ch.key, v)"));
});
