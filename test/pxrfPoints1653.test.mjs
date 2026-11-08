// TASKS.csv #1653 — pXRF readings with From = To on every row are recognised as points, and a real To column is offered.
import test from "node:test";
import assert from "node:assert/strict";
import { pointReadings } from "../src/lib/pxrfPoints.js";

const headers = ["HOLEID", "SAMPFROM", "SAMPTO", "XRF_To_D", "Cu_XRF_ppm"];
const rows = [5, 9.9, 15, 20.2].map((d) => ({ HOLEID: "H1", SAMPFROM: d, SAMPTO: d, XRF_To_D: +(d + 0.01).toFixed(2), Cu_XRF_ppm: 100 }));
const mapping = { hole_id: "HOLEID", from: "SAMPFROM", to: "SAMPTO" };

test("Copley's layout: all points, XRF_To_D offered", () => {
  assert.deepEqual(pointReadings(rows, headers, mapping), { allPoints: true, n: 4, candidate: "XRF_To_D" });
});

test("real intervals, or points with no To column: nothing offered", () => {
  assert.equal(pointReadings(rows.map((r) => ({ ...r, SAMPTO: r.SAMPFROM + 1 })), headers, mapping).allPoints, false);
  assert.equal(pointReadings(rows, ["HOLEID", "SAMPFROM", "SAMPTO", "Cu_XRF_ppm"], mapping).candidate, null);
  assert.equal(pointReadings(rows, headers, { hole_id: "HOLEID", from: "SAMPFROM" }).allPoints, false); // no To mapped
});
