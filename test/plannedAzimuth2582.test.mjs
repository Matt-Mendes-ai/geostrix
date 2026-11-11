// TASKS.csv #2582 — the planned-hole defaults follow the drilling (#2450), but a vertical hole's azimuth (0) entered the azimuth mean:
// 12 RC holes at -60 toward 074 and 4 vertical aircore holes gave a default azimuth of 058.
import test from "node:test";
import assert from "node:assert/strict";
import { drilledDefaults } from "../src/lib/plannedDefaults.js";

test("vertical holes do not pull the default azimuth", () => {
  const collars = [];
  for (let i = 0; i < 12; i++) collars.push({ hole_id: `RC${i}`, azimuth: 74, dip: 60, length: 150 });
  for (let i = 0; i < 4; i++) collars.push({ hole_id: `AC${i}`, azimuth: 0, dip: 90, length: 30 });
  const d = drilledDefaults(collars);
  assert.equal(d.azimuth, 74);
  assert.equal(d.dip, -60);
  const vertical = drilledDefaults([0, 1, 2, 3].map((i) => ({ hole_id: `V${i}`, azimuth: 0, dip: 90, length: 60 })));
  assert.equal(vertical.dip, -90); assert.equal(vertical.azimuth, 0);
});
