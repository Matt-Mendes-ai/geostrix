// TASKS.csv #2656 — a logged-code card says how many holes never logged the layer; the occurrence element follows the first grade card
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { unloggedHoles, occurrenceSymbol } from "../src/lib/evidenceSources.js";

test("holes with a trace and no row of the layer", () => {
  const traces = new Map([["A", []], ["B", []], ["C", []], ["D", []]]);
  const rows = [{ hole_id: "A", from: 0, to: 2, value: "P" }, { hole_id: "A", from: 2, to: 4, value: "Q" }, { hole_id: "C", from: 0, to: 2, value: "P" }, { hole_id: "Z", from: 0, to: 1, value: "P" }];
  assert.deepEqual(unloggedHoles(rows, traces), { none: 2, total: 4 });
  assert.deepEqual(unloggedHoles([], traces), { none: 4, total: 4 });
  assert.deepEqual(unloggedHoles(null, new Map()), { none: 0, total: 0 });
});

test("the occurrence element: the first grade card's, when offered; else the current one, else the list's first", () => {
  const list = [{ symbol: "Au" }, { symbol: "U" }, { symbol: "Cu" }];
  assert.equal(occurrenceSymbol([{ kind: "raster", ref: "x" }, { kind: "grade", ref: "U" }, { kind: "grade", ref: "Cu" }], list, "Au"), "U");
  assert.equal(occurrenceSymbol([{ kind: "grade", ref: "Mo" }], list, "Cu"), "Cu");
  assert.equal(occurrenceSymbol([], list, "Zn"), "Au");
  assert.equal(occurrenceSymbol([], [], "Zn"), "");
});

test("the pane: the note on a zone card, the default on choosing drillhole occurrences", () => {
  const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.match(p, /\{l\.kind === "zone" && \(\(\) => \{/);
  assert.match(p, /const u = unloggedHoles\(rows, traces\);/);
  assert.match(p, /source === "collars" && list\?\.length \? \{ symbol: occurrenceSymbol\(layers, list, t\.symbol\) \}/);
});
