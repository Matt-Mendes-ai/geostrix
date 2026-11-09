// TASKS.csv #1455 (review #1352, Silvertip) — every coded log as "distance to" evidence, a mineral's percent along the holes
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeTraces, zoneCodes, zoneParts, layerFieldPoints } from "../src/lib/evidenceSources.js";

const collars = [{ hole_id: "H1", x: 200, y: 500, z: 1000, azimuth: 0, dip: -90, length: 300 }, { hole_id: "H2", x: 600, y: 500, z: 1000, azimuth: 0, dip: -90, length: 300 }];
const traces = holeTraces(collars, [], "tangential");

test("#1455 codes logged fewer than `min` times are not offered; point rows (depth) count and become one-vertex parts", () => {
  const alt = [
    { hole_id: "H1", from: 0, to: 20, value: "ARG" }, { hole_id: "H1", from: 20, to: 60, value: "PROP" }, { hole_id: "H1", from: 60, to: 80, value: "ARG" },
    { hole_id: "H2", from: 0, to: 40, value: "ARG" }, { hole_id: "H2", from: 40, to: 50, value: "SIL" },
  ];
  assert.deepEqual(zoneCodes(alt, traces), ["ARG", "PROP", "SIL"]);
  assert.deepEqual(zoneCodes(alt, traces, { min: 3 }), ["ARG"]);
  const mnlgy = [{ hole_id: "H1", depth: 12, value: "PY", extra: 2 }, { hole_id: "H1", depth: 30, value: "PY", extra: 5 }, { hole_id: "H2", depth: 8, value: "CPY", extra: 0.5 }];
  assert.deepEqual(zoneCodes(mnlgy, traces), ["CPY", "PY"], "point rows count");
  const parts = zoneParts(mnlgy, "PY", traces);
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => p.length === 1 && Math.abs(p[0][0] - 200) < 1e-6), "one vertex each, on H1");
  // the percent of one mineral along the holes: its rows only, the field is `extra`
  const py = layerFieldPoints(mnlgy.filter((r) => r.value === "PY"), "extra", traces);
  assert.equal(py.length, 1); assert.equal(py[0].value, 5, "the highest percent in the bin");
});

test("#1455 the pane offers the coded logs and reads a mineral's percent", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('const CODED_LAYERS = ["litho", "alt", "vein", "breccia", "weath", "mnlgy", "structzone", "litho_gc", "alt_gc"]'));
  assert.ok(p.includes('tr("Distance to logged {layer}: {code}", { layer: name, code })') && p.includes('tr("Drillholes: {code} % along the holes", { code })'));
  assert.ok(p.includes("zoneCodes(rows, traces, { min: 3 })") && p.includes('/^coded:([^:]+):(.+):([^:]+)$/.exec(ref)'));
});
