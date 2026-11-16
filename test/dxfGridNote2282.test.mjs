// TASKS.csv #2282 (review #2174, WA lode gold) — Mine Design's DXF exports carried no grid or unit note; they now start with a 999 comment (what it is,
// the coordinates' system, the CRS, the date) and $INSUNITS 6 in the header. SYNTHETIC string.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildDXF, dxfGridNote } from "../src/lib/dxf.js";

import { stringFeatures } from "../src/lib/designStrings.js";
const features = stringFeatures([{ name: "S1", color: "#ff0000", closed: false, vertices: [[0, 0, 10], [5, 5, 10]] }]);

test("the note names the grid, the unit and the CRS honestly", () => {
  assert.match(dxfGridNote({ crsSet: false }, "Mine Design strings"), /^GeoStrix Mine Design strings \| coordinates: project grid, metres \| CRS: not set \(the project's local grid\) \| \d{4}-\d{2}-\d{2}$/);
  assert.match(dxfGridNote({ crsSet: true, epsg: 28351 }), /CRS: EPSG:28351/);
  assert.match(dxfGridNote({}), /CRS: not set \|/);
});
test("a DXF built with a comment starts with it and carries $INSUNITS 6; without one it is as before", () => {
  const withNote = buildDXF({ features, geomType: "line", comment: "GeoStrix test\nsecond line" }).split(/\r?\n/);
  assert.deepEqual(withNote.slice(0, 2), ["999", "GeoStrix test second line"]);
  const i = withNote.indexOf("$INSUNITS");
  assert.deepEqual(withNote.slice(i - 1, i + 3), ["9", "$INSUNITS", "70", "6"]);
  assert.ok(withNote.indexOf("$ACADVER") < i && i < withNote.indexOf("ENDSEC"), "inside the header section");
  const plain = buildDXF({ features, geomType: "line" }).split(/\r?\n/);
  assert.equal(plain[0], "0"); assert.ok(!plain.includes("$INSUNITS") && !plain.includes("999"));
});
test("the three Mine Design writers pass it (the grid note and, since #3717, the data credit: dxfNotes)", () => {
  for (const [f, what] of [["DesignLinesPane", "Mine Design lines"], ["DesignStringsPane", "Mine Design strings"], ["PitDesignPane", "Pit design strings"]]) {
    const s = fs.readFileSync(new URL(`../src/components/${f}.jsx`, import.meta.url), "utf8");
    assert.ok(s.includes(`buildDXF({ comment: dxfNotes(project, "${what}"), `), f);
  }
});
