// TASKS.csv #2963's blank-Elev part (done after #3004 / #2962) — Planned holes > Import CSV skipped a row whose elevation was blank ('lines 2
// (z)'), though 'Line / grid of holes' and the form offer the ground there. A blank elevation (or no elevation column) now takes the ground
// the pane gives (the terrain, else the ground between the trusted collars); with none it is skipped as before.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { plannedHolesFromRows } from "../src/lib/plannedImport.js";

const sheet = (header, lines) => { const h = header.split(","); return [lines.map((l) => Object.fromEntries(h.map((k, i) => [k, l.split(",")[i] ?? ""]))), h]; };
const ground = (x, y) => 430 + (x - 805000) / 100 + (y - 7508000) / 1000;

test("#2963 a blank Elev takes the ground; a typed one is kept; with no ground the row is skipped as before", () => {
  const s = sheet("Hole,Easting,Northing,RL,Azimuth,Dip,Depth", ["A,805010,7508000,,0,-90,52", "B,805020,7508000,441.5,0,-90,52"]);
  const r = plannedHolesFromRows(...s, { groundAt: ground });
  assert.deepEqual(r.holes.map((h) => [h.name, h.z, !!h.zFromGround]), [["A", 430.1, true], ["B", 441.5, false]]);
  assert.equal(r.zFromGround, 1);
  assert.deepEqual(plannedHolesFromRows(...s).skipped, [{ row: 2, why: "z" }], "no ground: skipped");
  assert.deepEqual(plannedHolesFromRows(...s, { groundAt: () => NaN }).skipped, [{ row: 2, why: "z" }], "no ground there: skipped");
});

test("#2963 a sheet with no elevation column at all (Hole / E / N / Depth of a vertical program) takes the ground for every row", () => {
  const s = sheet("Hole,Easting,Northing,Dip,Depth", ["A,805100,7508000,-90,40", "B,805200,7508000,-90,40"]);
  assert.deepEqual(plannedHolesFromRows(...s).missing, ["z", "azimuth"].filter((k) => k === "z"), "without a ground: z is missing");
  const r = plannedHolesFromRows(...s, { groundAt: ground });
  assert.deepEqual(r.holes.map((h) => [h.name, h.z, h.azimuth]), [["A", 431, 0], ["B", 432, 0]]);
});

test("#2963 the pane: the form's ground (not from underground collars), its words on each hole and in the notice", () => {
  const p = fs.readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8");
  assert.ok(p.includes("const groundForZ = ground && !underground ? groundFill : null;")); // #3335 — the collar ground as judged by the site spacing
  assert.ok(p.includes("plannedHolesFromRows(rows, headers, { groundAt: groundForZ })"));
  assert.ok(p.includes("{n} row(s) with a blank Elev took the terrain under the hole.") && p.includes("{n} row(s) with a blank Elev took the ground interpolated between the nearest collars (no terrain)."));
  assert.ok(p.includes("zSource: zFromGround ? `${groundAt ? groundWords : collarFillSource(fillAt(h.x, h.y))} (Elev blank in ${file.name})`")); // #3335 — the collar ground's distance and range
});
