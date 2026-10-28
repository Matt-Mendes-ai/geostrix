// TASKS.csv #1047 (review #1016) — best-intercept rows carry the collar and the intercept's midpoint.
import test from "node:test";
import assert from "node:assert/strict";
import { interceptLocations } from "../src/lib/interceptLocation.js";

test("#1047 collar E / N / RL, grid azimuth, dip negative = down, EOH and the midpoint on the trace", () => {
  const collars = [{ hole_id: "DH1", x: 500000, y: 6000000, z: 1000, azimuth: 90, dip: 90, length: 300 }]; // stored positive-down: vertical
  const loc = interceptLocations([{ hole_id: "DH1", from: 100, to: 120 }], collars, [], "minimum_curvature", null);
  const r = loc({ hole_id: "DH1", from: 100, to: 120 });
  assert.deepEqual([r.collar_x, r.collar_y, r.collar_z, r.azimuth_grid, r.dip, r.eoh_m], [500000, 6000000, 1000, 90, -90, 300]);
  assert.ok(Math.abs(r.mid_x - 500000) < 0.01 && Math.abs(r.mid_y - 6000000) < 0.01 && Math.abs(r.mid_z - 890) < 0.01, JSON.stringify(r));
  const none = loc({ hole_id: "NOPE", from: 1, to: 2 });
  assert.equal(none.collar_x, ""); assert.equal(none.mid_z, "");
});
