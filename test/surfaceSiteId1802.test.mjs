// TASKS.csv #1802 — a surface import keeps the site / station id and the description as sample attributes however many values they have
import test from "node:test";
import assert from "node:assert/strict";
import { surfaceAttrColumns, isIdHeader, SURFACE_ATTR_MAX_DISTINCT } from "../src/lib/geochem.js";

test("Kodiak's soils: Site ID and Description kept, a many-valued code column not", () => {
  const rows = Array.from({ length: SURFACE_ATTR_MAX_DISTINCT + 50 }, (_, i) => ({ "Sample ID": `S${i}`, "Site ID": `NWZ${i}`, Description: `note ${i}`, Horizon: i % 2 ? "B" : "C", LabCode: `L${i}`, Cu_ppm: String(i) }));
  const cols = surfaceAttrColumns(Object.keys(rows[0]), rows, { sample_id: "Sample ID" }, [{ header: "Cu_ppm" }]);
  assert.ok(cols.includes("Site ID"), cols.join());
  assert.ok(cols.includes("Description"));
  assert.ok(cols.includes("Horizon"));
  assert.ok(!cols.includes("LabCode")); // an unrecognized many-valued column is still left out
});

test("which headers read as a site id", () => {
  for (const h of ["Site ID", "site_id", "Station", "STN_NO", "Field ID", "Waypoint", "GPS name", "site"]) assert.ok(isIdHeader(h), h);
  for (const h of ["Horizon", "Grid", "Sampler", "LabCode", "Composite", "Website"]) assert.ok(!isIdHeader(h), h);
});
