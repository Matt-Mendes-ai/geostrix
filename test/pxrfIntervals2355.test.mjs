// TASKS.csv #2355 — pXRF vs lab: one pair per lab interval (its readings averaged), and the readings below the instrument's LOD counted
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pxrfVsLab } from "../src/lib/pxrfVsLab.js";

// 12 lab intervals of 1 m; three pXRF readings in each (10 cm apart), one of them below LOD in the first four intervals
const assays = [];
for (let i = 0; i < 12; i++) {
  assays.push({ hole_id: "H1", from: i, to: i + 1, values: { U: 100 * (i + 1) } });
  for (let k = 0; k < 3; k++) {
    const lod = i < 4 && k === 2;
    assays.push({ hole_id: "H1", from: i + 0.2 + 0.3 * k, to: i + 0.2 + 0.3 * k, source: "pXRF", values: { U: lod ? 5 : 80 * (i + 1) + k }, ...(lod ? { qualifiers: { U: "<" } } : {}) });
  }
}

test("each lab interval is one pair; the readings averaged; below-LOD readings counted apart", () => {
  const r = pxrfVsLab(assays, [{ symbol: "U", unit: "ppm" }], { U: "ppm" }).rows.find((x) => x.symbol === "U");
  assert.equal(r.n, 12, "12 lab intervals, not 36 readings");
  assert.equal(r.readings, 32);
  assert.equal(r.belowLod, 4);
  assert.ok(Math.abs(r.medianRatio - 0.8) < 0.02, String(r.medianRatio));
  assert.ok(r.rho > 0.99);
});

test("fewer than ten lab intervals: no row, however many readings", () => {
  const few = assays.filter((a) => a.from < 5);
  assert.equal(pxrfVsLab(few, [{ symbol: "U", unit: "ppm" }], { U: "ppm" }).rows.length, 0);
});

test("wired: the QAQC tab's columns and the CSV", () => {
  const q = readFileSync(new URL("../src/components/QAQCPanel.jsx", import.meta.url), "utf8");
  assert.match(q, /\[tr\("Element"\), tr\("Lab intervals"\), tr\("Readings"\), tr\("Below LOD"\),/);
  assert.match(q, /lab_intervals: r\.n, pxrf_readings_averaged: r\.readings, pxrf_readings_below_lod: r\.belowLod/);
});
