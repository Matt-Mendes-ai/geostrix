// TASKS.csv #2306 — neutral title-block labels (not British Columbia's 'Claims / tenures', 'NTS / map sheet'), and a local grid named
// from the collars' GRIDNAME in {crs} when the project has no coordinate system
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarGridName } from "../src/lib/gridName.js";
import { defaultTitleBlockRows } from "../src/lib/layoutTitleBlock.js";

test("the collars' grid name: the commonest value of a grid-name field, never a projected CRS", () => {
  const c = (v, k = "GRIDNAME") => ({ attrs: { [k]: v } });
  assert.equal(collarGridName([c("WALLABY"), c("WALLABY"), c("MGA94_51"), c("WALLABY")]), "WALLABY");
  assert.equal(collarGridName([c("Mine Grid A", "grid_name"), c("Mine Grid A", "grid_name")]), "Mine Grid A");
  assert.equal(collarGridName([c("MGA94_51"), c("GDA94 / MGA zone 51")]), null);
  assert.equal(collarGridName([c("A"), c("B"), c("C")]), null); // no grid held by most of them
  assert.equal(collarGridName([{ attrs: { hole_type: "DD" } }]), null);
});

test("neutral row labels; the grid row shows {crs}", () => {
  const rows = Object.fromEntries(defaultTitleBlockRows());
  assert.ok(!("Claims / tenures" in rows) && !("NTS / map sheet" in rows) && !("Datum / projection" in rows));
  assert.equal(rows["Tenure / claims"], "");
  assert.equal(rows["Map sheet"], "");
  assert.equal(rows["Grid / coordinate system"], "{crs}");
});

test("wired: {crs} names the collars' local grid when no CRS is set", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /collarGridName\(/);
  assert.match(m, /Local grid \{name\} \(no coordinate system set\)/);
});
