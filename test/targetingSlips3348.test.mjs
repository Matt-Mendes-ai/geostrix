// TASKS.csv #3348 (review #3195, Galore Creek) — small slips in the Targeting panes: unit-suffixed CSV headers, an azimuth of 400 stored as 40,
// a lone positive dip imported as an uphole without a word, the seed's azimuth called a median, the magnetic declination not shown, two
// misleading overlay lines and the open-mesh paragraph beside a closed shell.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { plannedHolesFromRows, plannedColumns } from "../src/lib/plannedImport.js";
import { drilledDefaults } from "../src/lib/plannedDefaults.js";

test("(1) Depth_m, eoh_m and dip_deg are the length / dip columns", () => {
  assert.equal(plannedColumns(["E", "N", "Elev", "Az", "Dip", "Depth_m"]).length, "Depth_m");
  assert.equal(plannedColumns(["x", "y", "z", "azimuth", "dip_deg", "eoh_m"]).length, "eoh_m");
  assert.equal(plannedColumns(["x", "y", "z", "azimuth", "dip_deg", "eoh_m"]).dip, "dip_deg");
  assert.equal(plannedColumns(["length_m"]).length, "length_m", "the old alias still read");
  assert.equal(plannedColumns(["lift_deg_per_100m"]).lift, "lift_deg_per_100m");
});

test("(2) an azimuth outside 0-360 is left out and said; (3) a lone positive dip is listed", () => {
  const headers = ["name", "x", "y", "z", "azimuth", "dip", "length"];
  const rows = [
    { name: "A", x: 1, y: 1, z: 100, azimuth: 400, dip: -60, length: 100 },
    { name: "B", x: 2, y: 2, z: 100, azimuth: 40, dip: -60, length: 100 },
    { name: "C", x: 3, y: 3, z: 100, azimuth: 90, dip: 60, length: 100 },
    { name: "D", x: 4, y: 4, z: 100, azimuth: 360, dip: -70, length: 100 },
    { name: "", x: 5, y: 5, z: 100, azimuth: 10, dip: 45, length: 100 },
  ];
  const r = plannedHolesFromRows(rows, headers);
  assert.deepEqual(r.holes.map((h) => h.name || "?"), ["B", "C", "D", "?"]);
  assert.deepEqual(r.skipped, [{ row: 2, why: "azimuth" }]);
  assert.deepEqual(r.lonePositive, ["C", "line 6"]);
  assert.ok(r.holes.every((h) => !("line" in h)), "the line number does not travel with the hole");
  assert.equal(r.holes.find((h) => h.name === "D").azimuth, 0);
  const allUp = plannedHolesFromRows(rows.filter((x) => x.dip > 0), headers);
  assert.equal(allUp.allDipsPositive, true); assert.deepEqual(allUp.lonePositive, [], "all positive: asked as before");
});

test("(4) the seed's azimuth is a mean direction of the inclined holes, with how well they agree", () => {
  const collars = [0, 10, 20, 350, 5].map((az, i) => ({ hole_id: `H${i}`, azimuth: az, dip: 60, length: 200 })).concat([{ hole_id: "V", azimuth: 0, dip: 90, length: 100 }]);
  const s = drilledDefaults(collars, []);
  assert.equal(s.azN, 5); assert.ok(s.azR > 0.9);
  const spread = drilledDefaults([44, 120, 200, 280, 358].map((az, i) => ({ hole_id: `S${i}`, azimuth: az, dip: 60, length: 200 })), []);
  assert.ok(spread.azR < 0.7, String(spread.azR));
});

test("wiring: (3) the import says the upward holes; (5) the declination; (9) (10) the overlay lines; (13) the open-mesh note; keys", () => {
  const p = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8");
  assert.ok(p.includes("const up = r.lonePositive?.length && !r.allDipsPositive"));
  assert.ok(p.includes('tr(" (declination {d}° {ew}, IGRF, {date})"'));
  const e = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.ok(!e.includes("so the score is empty or nearly so") && !e.includes("All the evidence comes from the {n} drillholes"));
  const u = readFileSync(new URL("../src/components/UndrilledZonesPane.jsx", import.meta.url), "utf8");
  assert.ok(u.includes("{choices.open.length > 0 && !unit && <div style={note}>{tr(OPEN_ROUTE"));
  const keys = ["{n} hole(s) with a positive dip among negative ones were added as upward holes: {list}. Check them.", " (declination {d}° {ew}, IGRF, {date})", "Dip / Length start from the {n} drilled holes (median), Az from the mean direction of the {m} inclined ones{spread}; each hole added is kept for the next.", " (they point many ways: check it)",
    "All the evidence comes from the drillholes the cards read, so the score exists only within {reach} m of their traces: it ranks drilled ground, not untested targets. A surface evidence (a survey, a raster, soil or rock samples, a map layer) is what can score beyond the holes.",
    "Only the {v} cells that have every evidence are scored. Fewest values: {list}. Combine with fuzzy OR or the algebraic sum (they skip a missing evidence) to score the others, or remove those."];
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")); for (const k of keys) assert.ok(d[k], `${l}: ${k}`); }
});
