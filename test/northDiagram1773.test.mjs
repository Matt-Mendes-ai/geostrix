// TASKS.csv #1773 / #2137 / #2310 / #2478 / #2613 — the grid / true / magnetic north diagram: on the sheet, dated by the drilling on the
// local calendar, schematic angles with each label on its ray's side, level captions, and the yearly change computed for the place
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localDate, collarDrillDate, parseDrillDate, schematicAngles, rayTip, yearLater, keepOnSheet, DIAGRAM_W, DIAGRAM_H } from "../src/lib/northDiagram.js";
import { elementBox } from "../src/lib/layoutPlace.js";

test("#2310 — the local calendar date, not UTC", () => {
  const evening = new Date(2026, 10, 8, 21, 50); // 21:50 local on 8 November
  assert.equal(localDate(evening), "2026-11-08");
});

test("#1773 — the latest drilling date from the collars, in the usual spellings", () => {
  assert.equal(parseDrillDate("2023-07-14"), "2023-07-14");
  assert.equal(parseDrillDate("14/07/2023"), "2023-07-14");
  assert.equal(parseDrillDate("07/14/2023"), "2023-07-14"); // a month over 12 is swapped
  assert.equal(parseDrillDate("2009"), "2009-07-01");
  assert.equal(parseDrillDate("2009.0"), "2009-07-01");
  assert.equal(parseDrillDate("COP-23"), null);
  const collars = [{ attrs: { STARTDATE: "2023-06-02", ENDDATE: "2024-01-01" } }, { attrs: { STARTDATE: "2023-08-30" } }, { attrs: { comment: "2025-01-01" } }];
  assert.deepEqual(collarDrillDate(collars), { date: "2023-08-30", field: "STARTDATE" }); // the end date and a comment are not drilling dates
  assert.equal(collarDrillDate([{ attrs: { hole_type: "DD" } }]), null);
});

test("#2478 — small angles are drawn at 12 degrees on their side, the further ray further out, and flagged 'not to scale'", () => {
  const wa = schematicAngles(0.3991, 0.3991 + 1.812); // WA uranium: TN 0.4 E, MN 2.2 E of grid north
  assert.equal(wa.tn, 12); assert.equal(wa.mn, 24); assert.equal(wa.schematic, true);
  const bc = schematicAngles(-1.28, -1.28 + 15.7); // Woodjam: TN 1.3 W, MN 14.4 E
  assert.equal(bc.tn, -12); assert.ok(Math.abs(bc.mn - 14.42) < 1e-9);
  const big = schematicAngles(15, 30);
  assert.deepEqual(big, { tn: 15, mn: 30, schematic: false });
  assert.equal(schematicAngles(0, 0).schematic, false);
});

test("#2613 — a label sits on the side its ray points to", () => {
  const west = schematicAngles(-0.5217, -0.5217 - 2.1151); // WA lithium: both west of grid north
  assert.ok(west.mn < west.tn && west.tn < 0);
  const m = rayTip(west.mn, 52);
  assert.equal(m.anchor, "end");
  assert.ok(m.labelX < 60 && m.x < 60);
  assert.equal(rayTip(10, 52).anchor, "start");
});

test("#2478 — the rate is IGRF a year later; #1773 / #2137 — the box stays on the sheet and is the diagram's own size", () => {
  assert.equal(yearLater("2026-11-08"), "2027-11-08");
  assert.equal(yearLater("2024-02-29"), "2025-02-28");
  assert.deepEqual(keepOnSheet(1000, 40, 1123, 794), { x: 1123 - DIAGRAM_W - 10, y: 40 });
  assert.deepEqual(keepOnSheet(300, 700, 1123, 794), { x: 300, y: 794 - DIAGRAM_H - 10 });
  assert.deepEqual(elementBox({ type: "north", x: 5, y: 6, decl: { convergence: 1 } }), { x: 5, y: 6, w: DIAGRAM_W, h: DIAGRAM_H });
  assert.deepEqual(elementBox({ type: "north", x: 5, y: 6 }), { x: 5, y: 6, w: 60, h: 80 });
});

test("wired: the captions stay level (only the rays rotate), the date default, the rate and the move onto the sheet", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(m, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(m, /const date = sel\.declDate \|\| drill\?\.date \|\| localDate\(\);/);
  assert.match(m, /<g transform=\{el\.rotation \? `rotate\(\$\{el\.rotation\} \$\{ORIGIN\.x\} \$\{ORIGIN\.y\}\)` : undefined\}>/);
  assert.match(m, /yearLater\(date\)/);
  assert.match(m, /\.\.\.keepOnSheet\(sel\.x, sel\.y, A4\.w, A4\.h\)/);
  assert.doesNotMatch(m, /IGRF-14; changes about 0\.1-0\.2°\/yr/);
});
