// TASKS.csv #3878 (Matt's decision, 2026-11-17: option A of #3868 (7)) — a hole's dip prints with one sign and one rounding wherever it is printed: negative for a hole pointing down, a plus for an
// up-hole, one decimal (-55.9). The collar table said -56, the strip-log header 55.9, the Atlas token -46. Synthetic collars (made-up ids); stored values and CSV columns are not touched.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dipPrinted } from "../src/lib/dipText.js";
import { stripLogFurniture } from "../src/lib/figureFurniture.js";
import { collarTableCells } from "../src/lib/collarTable.js";
import { holeAtlasValues } from "../src/lib/atlas.js";
import { rigRows, rigKML, rigGPX } from "../src/lib/rigExport.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// a collar as the records store it: the dip positive down (#1033)
const collar = { hole_id: "DH-23-001", x: 500000, y: 6100000, z: 1200, azimuth: 106.93, dip: 55.86, length: 212.3 };
const up = { ...collar, hole_id: "DH-23-002", dip: -12.34 };

test("one sign, one decimal: negative down, plus up, zero as 0.0, nothing for no value", () => {
  assert.equal(dipPrinted(55.86, { downPositive: true }), "-55.9");
  assert.equal(dipPrinted(-12.34, { downPositive: true }), "+12.3");
  assert.equal(dipPrinted(-55.86), "-55.9", "a planned hole already stores negative down");
  assert.equal(dipPrinted(12.34), "+12.3");
  assert.equal(dipPrinted(90, { downPositive: true }), "-90.0"); assert.equal(dipPrinted(0), "0.0"); assert.equal(dipPrinted(-0.02), "0.0");
  assert.equal(dipPrinted(""), ""); assert.equal(dipPrinted(null), ""); assert.equal(dipPrinted("x"), "");
});

test("the same hole reads -55.9 in the strip-log header, the collar table and the Atlas token", () => {
  const furn = stripLogFurniture({ holeId: collar.hole_id, collar, maxDepth: 200, pxPerMeter: 3, tracks: [], date: "2026-11-17" });
  const header = furn.caption.join(" ");
  assert.match(header, /dip -55\.9° \(at the collar\)/);
  const row = collarTableCells([collar, up])[0], rowUp = collarTableCells([collar, up])[1];
  assert.equal(row[5], "-55.9*"); assert.equal(rowUp[5], "+12.3*");
  assert.equal(holeAtlasValues(collar.hole_id, [collar], {}).dip, "-55.9");
  assert.equal(holeAtlasValues(up.hole_id, [up], {}).dip, "+12.3");
  assert.equal(holeAtlasValues("DH-XX", [collar], {}).dip, "?");
});

test("a planned hole prints the same way in the rig sheet's text; its CSV column keeps the stored value", () => {
  const hole = { id: "p1", name: "PLAN-1", x: 500000, y: 6100000, z: 1200, azimuth: 107, dip: -55.86, length: 200 };
  const rows = rigRows([hole], 26910, "2026-11-17", () => []);
  assert.equal(rows[0].dip, -55.86, "the column is the stored value");
  assert.match(rigKML(rows, "t"), /Dip -55\.9°/);
  assert.match(rigGPX(rows), /dip -55\.9,/);
});

test("wiring: the planned holes' list and tooltip, the nearest-collar list and the Layout collar table use it; the stored columns do not", () => {
  const p = read("../src/components/PlannedHoleParts.jsx"), l = read("../src/modules/LayoutModule.jsx"), v = read("../src/modules/ViewerModule.jsx");
  assert.match(p, /v2: dipPrinted\(hole\.dip\)/); assert.match(p, /dip: dipPrinted\(n\.dip\)/);
  assert.match(l, /star\(Number\.isFinite\(c\.dip\) \? dipPrinted\(c\.dip, \{ downPositive: true \}\)/);
  assert.match(v, /Dip \$\{dipPrinted\(hole\.dip\)\}°/);
});
