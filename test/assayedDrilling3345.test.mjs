// TASKS.csv #3345 (review #3195, Galore Creek) — 'Distance to drilling' and Undrilled zones counted every trace as testing the ground (24 of 70
// holes had no assay, and the unassayed top of a hole counted too). A choice now: every hole, the holes with assays, or the assayed parts only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assayedSpans, cutTrace, assayedTraceParts } from "../src/lib/assayedTraces.js";
import { drilledParts } from "../src/lib/evidenceSources.js";

const vertical = (x, len) => [{ x, y: 0, z: 100, md: 0 }, { x, y: 0, z: 100 - len, md: len }];
const traces = new Map([["A", vertical(0, 100)], ["B", vertical(50, 100)], ["C", vertical(100, 100)]]);
const assays = [{ hole_id: "A", from: 20, to: 22 }, { hole_id: "A", from: 22, to: 24 }, { hole_id: "A", from: 60, to: 62 }, { hole_id: "B", from: 0, to: 10 }]; // C: none

test("assayedSpans merges touching intervals; cutTrace keeps the span's part; the holes with none counted", () => {
  const sp = assayedSpans(assays);
  assert.deepEqual(sp.get("A"), [[20, 24], [60, 62]]);
  assert.equal(sp.has("C"), false);
  const part = cutTrace(traces.get("A"), 20, 24);
  assert.deepEqual(part.map((p) => [p.md, p.z]), [[20, 80], [24, 76]]);
  assert.deepEqual(cutTrace(traces.get("A"), 30, 20), []);
  const a = assayedTraceParts(traces, sp);
  assert.deepEqual([a.holes, a.none], [2, 1]);
  assert.equal(a.traces.get("A").length, 2);
});

test("drilledParts: every hole, the holes with assays, the assayed parts", () => {
  const a = assayedTraceParts(traces, assayedSpans(assays));
  assert.equal(drilledParts(traces).length, 3);
  assert.equal(drilledParts(traces, a.traces, "holes").length, 2);
  assert.equal(drilledParts(traces, a.traces, "intervals").length, 3, "A's two spans and B's one");
  assert.equal(drilledParts(traces, null, "holes").length, 3, "no assayed map: every hole, as before");
});

test("wiring: the card's choice and count; Undrilled zones' box, its traces and its line; keys", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('aria-label={tr("Which drilling counts")}'));
  assert.ok(p.includes('{ah.none > 0 && <span>{tr("{k} of the {n} holes have no assay.", { k: ah.none, n: traces.size })}</span>}'));
  const u = readFileSync(new URL("../src/components/UndrilledZonesPane.jsx", import.meta.url), "utf8");
  assert.ok(u.includes("const spans = useMemo(() => (assayedOnly ? assayedSpans(excludeQAQC(assays)) : null), [assayedOnly, assays]);"));
  assert.ok(u.includes("for (const [a, b] of sp) { const part = cutTrace(t, a, b); if (part.length > 1) out.push(part); }"));
  assert.ok(u.includes("drilled: holesUsed, planned: out.length - drilledParts"));
  const keys = ["Which drilling counts", "every hole ({n})", "holes with assays ({n})", "the assayed intervals only", "{k} of the {n} holes have no assay.", "Count only the assayed parts of holes", "Off: every metre drilled tests the ground, assayed or not.", "Only the assayed parts of holes were counted: {k} of the {n} drilled holes have no assay."];
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")); for (const k of keys) assert.ok(d[k], `${l}: ${k}`); }
});
