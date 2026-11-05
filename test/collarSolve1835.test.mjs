// TASKS.csv #1835 (review #1646, Kodiak) — keep the dip a rig can drill and solve the COLLAR; a shallow solved dip is said; the
// collar's elevation source and the target reach the rig export
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { solveCollarForTarget, isShallowDip, SHALLOW_DIP_DEG, solveOrientationToTarget } from "../src/lib/holePlanning.js";
import { rigRows } from "../src/lib/rigExport.js";

// Kodiak's chargeability high: 684,105 / 5,511,190 / 1,530; the model top (the "surface" with no terrain) at 1,610
const target = { x: 684105, y: 5511190, z: 1530 };

test("#1835 with no terrain the collar sits at the typed elevation, up-hole from the target along az 270 / dip -60", () => {
  const c = solveCollarForTarget(target, 270, -60, { surfaceZ: 1610 });
  const L = 80 / Math.sin(Math.PI / 3); // 92.38 m of hole for 80 m of drop
  assert.ok(Math.abs(c.length - L) < 1e-6 && Math.abs(c.horizontal - L / 2) < 1e-6, JSON.stringify(c));
  assert.ok(Math.abs(c.x - (684105 + L / 2)) < 1e-6 && Math.abs(c.y - 5511190) < 1e-6 && c.z === 1610, "a hole pointing west collars east of the target");
  assert.equal(c.source, "elevation");
  // the forward solver agrees: from that collar the target is at az 270 / dip -60
  const back = solveOrientationToTarget(c, target);
  assert.ok(Math.abs(back.azimuth - 270) < 1e-6 && Math.abs(back.dip + 60) < 1e-6, JSON.stringify(back));
  assert.equal(solveCollarForTarget(target, 270, -60, { surfaceZ: 1500 }), null, "a target above the surface");
  assert.equal(solveCollarForTarget(target, 270, 0, { surfaceZ: 1610 }), null, "a flat hole never reaches the surface");
  assert.equal(solveCollarForTarget(target, 270, 30, { surfaceZ: 1610 }), null, "an upward dip");
  assert.equal(solveCollarForTarget(target, 270, -60, {}), null, "no terrain and no elevation");
});

test("#1835 on a terrain the collar is iterated onto the ground: a 10 % slope rising east", () => {
  const groundAt = (x, y) => (y > 5511000 ? 1600 + 0.1 * (x - 684105) : NaN);
  const c = solveCollarForTarget(target, 270, -60, { groundAt });
  // collar at h east of the target: 1600 + 0.1 h = 1530 + h tan 60 -> h = 70 / (tan 60 - 0.1)
  const h = 70 / (Math.tan(Math.PI / 3) - 0.1);
  assert.ok(Math.abs(c.horizontal - h) < 0.05 && Math.abs(c.x - (684105 + h)) < 0.05 && Math.abs(c.z - (1600 + 0.1 * h)) < 0.05, JSON.stringify(c));
  assert.ok(c.converged && c.source === "terrain" && c.iterations <= 10, JSON.stringify(c));
  assert.equal(solveCollarForTarget({ ...target, y: 5510000 }, 270, -60, { groundAt }), null, "outside the terrain");
});

test("#1835 a dip flatter than 40 deg is shallow; the pane says so and offers the collar solve; the rig sheet carries z_source and the target", () => {
  assert.equal(SHALLOW_DIP_DEG, 40);
  assert.ok(isShallowDip(-21.8) && !isShallowDip(-60) && !isShallowDip(-40) && !isShallowDip(0) && !isShallowDip(20) && !isShallowDip(NaN));
  const p = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('tr("Solve collar for this dip/azimuth")') && p.includes("Dip {d}° is shallow") && p.includes("zSource, // #1835"));
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes("groundAt={terrain ? (x, y) => terrainGroundAt(terrain, x, y) : null}"));
  const hole = { name: "K-1", x: 684151.2, y: 5511190, z: 1610, azimuth: 270, dip: -60, length: 122.4, zSource: "picked on the view (block model)", target };
  const row = rigRows([hole], 26910, "2026-11-04", () => [{ x: 684151.2, y: 5511190, z: 1610 }, { x: 684090, y: 5511190, z: 1504 }])[0];
  assert.equal(row.z_source, "picked on the view (block model)");
  assert.deepEqual([row.target_x, row.target_y, row.target_z], [684105, 5511190, 1530]);
  const plain = rigRows([{ ...hole, zSource: undefined, target: undefined }], 26910, "2026-11-04", () => [])[0];
  assert.deepEqual([plain.z_source, plain.target_x], ["", ""]);
});
