// TASKS.csv #1024 (review #1016) — a soil grid's line bearing is given as grid, true and magnetic.
import test from "node:test";
import assert from "node:assert/strict";
import { gridBearingAsTrueMagnetic, bearingPhrase, loadIgrf } from "../src/lib/azimuthRef.js";

test("#1024 Harry (EPSG 3156): a grid-north line is ~342° magnetic on 2026-10-27; true and magnetic follow the offsets", async () => {
  await loadIgrf();
  const b = gridBearingAsTrueMagnetic(0, 463375, 6177691, 3156, "2026-10-27");
  assert.ok(b);
  assert.equal(b.grid, 0);
  assert.ok(Math.abs(b.magnetic - 342.2) < 0.3, String(b.magnetic)); // the review's measurement: D 17.35°, c 0.49°
  assert.ok(Math.abs(b.declination - 17.35) < 0.2, String(b.declination));
  assert.ok(Math.abs(((b.true - (360 - b.convergence)) + 540) % 360 - 180) < 0.11, `${b.true} ${b.convergence}`);
  const p = bearingPhrase(b, 0);
  assert.match(p, /^0° grid \(\d+(\.\d)?° true, 342\.\d° magnetic on 2026-10-27, IGRF-14\)$/);
  // a 90° grid line turns by the same amounts
  const e = gridBearingAsTrueMagnetic(90, 463375, 6177691, 3156, "2026-10-27");
  assert.ok(Math.abs(((e.magnetic - b.magnetic - 90) % 360 + 540) % 360 - 180) < 0.11, String(e.magnetic));
  // no date: no magnetic bearing, true still given; no location / CRS: null and the phrase says grid
  const nd = gridBearingAsTrueMagnetic(0, 463375, 6177691, 3156, "");
  assert.equal(nd.magnetic, null); assert.ok(Number.isFinite(nd.true));
  assert.equal(gridBearingAsTrueMagnetic(0, NaN, 1, 3156, "2026-10-27"), null);
  assert.equal(bearingPhrase(null, 45), "45° grid");
});
