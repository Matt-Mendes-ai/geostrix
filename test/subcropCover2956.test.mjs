// TASKS.csv #2956 (WA iron review) — the subcrop on a field under cover: the codes the holes start in, the unit at a depth down each hole, and
// nearest-hole outlines a model can use
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarSubcrop, holeStartCodes, roleWithCodes } from "../src/lib/collarSubcrop.js";
import { subcropOutlines, outlineLayer, medianSpacing, defaultReach } from "../src/lib/subcropOutlines.js";
import { extractMapContacts } from "../src/lib/mapLayers.js";

const collars = [], litho = [];
for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
  const h = `H${i}${j}`;
  collars.push({ hole_id: h, x: 1000 + i * 40, y: 2000 + j * 40, z: 400, azimuth: 0, dip: 90, length: 60 });
  litho.push({ hole_id: h, from: 0, to: i === 0 ? 8 : 20, value: i === 0 ? "cla" : "ALU" }, { hole_id: h, from: i === 0 ? 8 : 20, to: 40, value: j < 2 ? "HNAM" : "TNAM" }, { hole_id: h, from: 40, to: 60, value: "BNAM" });
}

test("the codes the holes start in, by count, with their role; a role set in Modelling codes is read", () => {
  assert.deepEqual(holeStartCodes({ collars, litho }).map((c) => [c.code, c.holes]), [["ALU", 20], ["cla", 5]]);
  const roleOf = roleWithCodes({ codes: [{ name: "ALU", role: "overburden" }, { name: "CLA", role: "overburden" }] });
  assert.ok(holeStartCodes({ collars, litho, roleOf }).every((c) => c.role === "overburden"));
});

test("cover marked: the first unit under it, with its depth of cover; at a depth: the unit there, holes too short left out", () => {
  const roleOf = roleWithCodes({ codes: [{ name: "ALU", role: "overburden" }, { name: "CLA", role: "overburden" }] });
  const pts = collarSubcrop({ collars, litho, survey: [], roleOf });
  assert.equal(pts.length, 25);
  assert.deepEqual([...new Set(pts.map((p) => p.unit))].sort(), ["HNAM", "TNAM"]);
  assert.equal(pts.find((p) => p.hole_id === "H00").cover, 8); assert.equal(pts.find((p) => p.hole_id === "H10").cover, 20);
  const rep = {};
  const deep = collarSubcrop({ collars, litho, survey: [], roleOf, atDepthM: 50, report: rep });
  assert.ok(deep.every((p) => p.unit === "BNAM" && p.from === 50 && Math.abs(p.z - 350) < 1e-6), JSON.stringify(deep[0]));
  assert.equal(collarSubcrop({ collars, litho, survey: [], roleOf, atDepthM: 70, report: rep }).length, 0);
  assert.equal(rep.notAtDepth, 25);
});

test("outlines: one cell per hole, cut back to the reach; one contact between the two units; a polygon layer with a unit field", () => {
  const pts = collarSubcrop({ collars, litho, survey: [], roleOf: roleWithCodes({ codes: [{ name: "ALU", role: "overburden" }, { name: "CLA", role: "overburden" }] }) });
  assert.equal(medianSpacing(pts), 40); assert.equal(defaultReach(pts), 80);
  const area = (r) => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(s / 2); };
  const cells = subcropOutlines(pts, { reachM: 80 });
  assert.equal(cells.length, 25);
  assert.ok(Math.abs(area(cells.find((c) => c.hole_id === "H22").ring) - 1600) < 1e-6, "an inner cell is the 40 x 40 m square around its hole");
  assert.ok(area(subcropOutlines(pts, { reachM: 10 }).find((c) => c.hole_id === "H22").ring) < 315, "cut back to 10 m");
  const L = outlineLayer(pts, "x", () => "#000", { reachM: 80 });
  assert.equal(L.geomType, "polygon"); assert.equal(L.styleField, "unit");
  const { contacts } = extractMapContacts(L, "unit");
  assert.equal(contacts.length, 1); assert.deepEqual(contacts[0].units, ["HNAM", "TNAM"]);
});

test("the pane: the card, cover ticks writing the role, colour by depth of cover, the outline and the depth", () => {
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /const setCoverRole = \(code, on\) => setModellingCodes/);
  assert.match(p, /changeStyleField\(layer, "cover_m"\)/);
  assert.match(p, /const layer = outlineLayer\(c\.pts, name,/);
  assert.match(p, /atDepthM: depth \}\)/);
  assert.match(p, /<button onClick=\{\(\) => makeSubcrop\(\)\}/);
});
