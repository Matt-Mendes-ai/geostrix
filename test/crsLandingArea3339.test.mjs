// TASKS.csv #3339 (Galore Creek review) — choosing BC Albers for a sound UTM 9N project said '14 of the 70 collars land more than 50 km from the
// others: they are not all in one coordinate frame', above the button that reprojects them correctly: the note read the UTM numbers as Albers
// numbers (true only for 'Only change the label'), and ran the #2181 frame test from a landing outside BC Albers' own area. The note now says
// what each button does, and the frame test runs only on a landing inside the CRS's area.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarCentreLonLat, collarSpread } from "../src/lib/projectCrs.js";
import { getProj4DefSync } from "../src/lib/reproject.js";
import { crsMapArea, inCrsArea, crsAreaFromDef } from "../src/lib/crsMapArea.js";

const BC_ALBERS = [-139.1, 48.2, -114.0, 60.1]; // the registry's area of use for EPSG:3005
const cols = [];
for (let i = 0; i < 56; i++) cols.push({ hole_id: `C${i}`, x: 350000 + (i % 8) * 150, y: 6333000 + Math.floor(i / 8) * 150 });
for (let i = 0; i < 14; i++) cols.push({ hole_id: `F${i}`, x: 355000 + i * 300, y: 6336000 + i * 200 });

test("UTM 9N numbers read as BC Albers land outside its area; the same collars in UTM 9N are inside theirs", () => {
  const asAlbers = collarCentreLonLat(cols, 3005), asUtm = collarCentreLonLat(cols, 26909);
  assert.ok(Math.abs(asAlbers.lat) < 0.5, `${asAlbers.lat}`); // the review's '0.000 N, 64.2 E'
  assert.equal(inCrsArea(BC_ALBERS, asAlbers), false);
  assert.ok(Math.abs(asUtm.lat - 57.12) < 0.05 && Math.abs(asUtm.lon + 131.46) < 0.05);
  assert.equal(inCrsArea(BC_ALBERS, asUtm), true);
  assert.ok(collarSpread(cols, 3005).far > 0, "the frame test fires from that landing, which is why it must not run there");
  assert.equal(collarSpread(cols, 26909).far, 0);
});

test("an area across 180 degrees, the margin, and an unknown area", () => {
  assert.equal(inCrsArea([170, -50, -170, -30], { lon: 178, lat: -40 }), true);
  assert.equal(inCrsArea([170, -50, -170, -30], { lon: 0, lat: -40 }), false);
  assert.equal(inCrsArea(BC_ALBERS, { lon: -139.8, lat: 55 }), true); // within a degree of the edge
  assert.equal(inCrsArea(null, { lon: 0, lat: 0 }), true); // unknown: say nothing
});

test("before the registry loads, a projected CRS's area comes coarsely from its definition", () => {
  const a = crsMapArea(null, "NAD83 / BC Albers", getProj4DefSync(3005));
  assert.deepEqual(a, [-171, 24.25, -81, 84.25]); // lon_0 -126, the standard parallels' mean 54.25
  assert.equal(inCrsArea(a, collarCentreLonLat(cols, 3005)), false);
  assert.equal(inCrsArea(a, collarCentreLonLat(cols, 26909)), true);
  assert.equal(crsAreaFromDef("+proj=longlat +datum=WGS84"), null);
  assert.deepEqual(crsMapArea(null, "NAD83 / UTM zone 9N", getProj4DefSync(26909)), [-132, 0, -126, 84]); // the UTM rule first
});

test("the Project CRS pane says what each button does, and gates the frame test on the area; the status-bar dialog too", () => {
  const c = readFileSync(new URL("../src/modules/CartographyModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(c, /const spread = inside \? collarSpread\(cols, newCrs\) : null;/);
  assert.match(c, /tr\("Reproject keeps your \{n\} collars where they are \(\{where\}\) and gives them \{v\} numbers\."/);
  assert.match(c, /tr\("Only changing the label would put them at \{where\}\."/);
  assert.match(c, /tr\("Read as \{v\}, these numbers fall outside the area it is used in \(\{area\}\): they are not in it\."/);
  const m = readFileSync(new URL("../src/components/ProjectCrsModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /const spread = landing && !outside \? collarSpread\(collars, choice\) : null;/);
});

// TASKS.csv #2999 — 'Only change the label' says how far and which way the collars would move from where the project puts them now
import { offsetFrom } from "../src/lib/projectCrs.js";
test("the label-only landing is placed against the present position", () => {
  const now = collarCentreLonLat([{ x: 600000, y: 7500000 }], 28350), as51 = collarCentreLonLat([{ x: 600000, y: 7500000 }], 28351);
  const o = offsetFrom(now, as51);
  assert.equal(o.dir, "E");
  assert.ok(o.km > 600 && o.km < 650, `${o.km}`); // the review's 'about 617 km east'
  assert.equal(offsetFrom(now, now).km, 0);
  assert.match(readFileSync(new URL("../src/modules/CartographyModule.jsx", import.meta.url), "utf8"), /That is about \{km\} km \{dir\} of where the project says they are now\./);
});
