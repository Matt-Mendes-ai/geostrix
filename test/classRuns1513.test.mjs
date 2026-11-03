// TASKS.csv #1513 (review #1497, Lawyers) — a classification joins touching samples of one class per hole
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeClassRuns } from "../src/lib/geochemDiagrams.js";

test("touching samples of one class become one interval; a class change, a gap or another hole start a new one", () => {
  const rows = [
    { hole_id: "A", from: 2, to: 3, value: "basalt" }, { hole_id: "A", from: 0, to: 1, value: "basalt" }, { hole_id: "A", from: 1, to: 2, value: "basalt" },
    { hole_id: "A", from: 3, to: 4, value: "andesite" },
    { hole_id: "A", from: 6, to: 7, value: "andesite" }, // 2 m gap: not joined across it
    { hole_id: "B", from: 0, to: 1.5, value: "basalt" }, { hole_id: "B", from: 1.52, to: 3, value: "basalt" }, // 2 cm: joined
  ];
  assert.deepEqual(mergeClassRuns(rows).map((r) => [r.hole_id, r.from, r.to, r.value, r.samples]), [
    ["A", 0, 3, "basalt", 3], ["A", 3, 4, "andesite", 1], ["A", 6, 7, "andesite", 1], ["B", 0, 3, "basalt", 2],
  ]);
});

test("rows without depths are left out; an empty list stays empty", () => {
  assert.deepEqual(mergeClassRuns([{ hole_id: "A", from: null, to: 1, value: "x" }]), []);
  assert.deepEqual(mergeClassRuns([]), []);
});

test("Classify writes the joined runs", () => {
  const src = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.ok(src.includes("const runs = mergeClassRuns(rows);") && src.includes("replaceLayer(targetKey, runs);"));
});
