// TASKS.csv #2921 (review #2876, WA bedded iron) — explicit tops of one pile were each fitted alone: Top of ONAM lay above Top of SONAM
// under 85 of 215 holes, 'Check relationships' said 'Nothing to check', a unit missing from a hole told the fit nothing, and the sheet
// filled a rectangle that was 66-70 % extrapolation. The order now comes from the holes (lib/pileTops.js): zero-thickness picks where a
// unit is missing, the next top up found, held under it or checked against it, the order put on the surface for Check relationships,
// and the sheet may stop at the inputs' outline.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { codedRuns } from "../src/lib/modellingCodes.js";
import { pileFromRuns, pileRelation, absentTops, upperNeighbour, meshHeightLookup, clampUnder, orderAgainst } from "../src/lib/pileTops.js";
import { fitExplicitSurface } from "../src/lib/explicitSurface.js";
import { checkTopology } from "../src/lib/topology.js";
import { inputKey } from "../src/lib/explicitBuild.js";

// Y over X over Z down every hole; X missing from B1-B3 (Y straight onto Z); C starts in Z; D has a gap between Y and Z
const L = (hole_id, from, to, value) => ({ hole_id, from, to, value });
const rows = [];
for (const h of ["A1", "A2", "A3", "A4"]) rows.push(L(h, 0, 10, "Y"), L(h, 10, 20, "X"), L(h, 20, 40, "Z"));
for (const h of ["B1", "B2", "B3"]) rows.push(L(h, 0, 12, "Y"), L(h, 12, 40, "Z"));
rows.push(L("C", 0, 30, "Z"), L("D", 0, 10, "Y"), L("D", 12, 30, "Z"));
const runs = codedRuns(rows, { codes: [], assign: {} }, null);

test("the pile's order from the holes, pair by pair", () => {
  const pile = pileFromRuns(runs);
  assert.deepEqual(pileRelation(pile, "Y", "X"), { order: 1, agree: 4, of: 4 });
  assert.deepEqual(pileRelation(pile, "Z", "X"), { order: -1, agree: 4, of: 4 });
  assert.equal(pileRelation(pile, "Y", "Z").order, 1);
  assert.equal(pileRelation(pile, "Y", "Q").order, 0, "a code not in the pile");
  const few = pileFromRuns(runs.filter((r) => r.hole_id !== "A3" && r.hole_id !== "A4"));
  assert.equal(pileRelation(few, "Y", "X").order, 0, "fewer than three holes logging both: not decided");
  assert.equal(pileFromRuns(runs, (c) => c !== "Z").kOf.has("Z"), false, "a code outside the pile (overburden, intrusion) is left out");
});

test("where a unit is missing, its top is the contact from the unit above it to the one under it", () => {
  const pile = pileFromRuns(runs);
  const { tops } = absentTops(runs, "X", pile);
  assert.deepEqual(tops.map((t) => [t.hole_id, t.md, t.above, t.below, t.absent]), [["B1", 12, "Y", "Z", true], ["B2", 12, "Y", "Z", true], ["B3", 12, "Y", "Z", true]]);
  // the A holes log X (their own tops), C starts in Z (no contact), D has a gap above Z
  assert.equal(absentTops(runs, "Y", pile).tops.length, 0, "nothing lies above the top of the pile");
});

test("the next top up among the other explicit tops", () => {
  const W = [L("W1", 0, 5, "W"), L("W1", 5, 10, "Y"), L("W1", 10, 20, "X"), L("W2", 0, 5, "W"), L("W2", 5, 10, "Y"), L("W2", 10, 20, "X"), L("W3", 0, 5, "W"), L("W3", 5, 10, "Y"), L("W3", 10, 20, "X")];
  const pile = pileFromRuns(codedRuns([...rows, ...W], { codes: [], assign: {} }, null));
  const up = upperNeighbour(pile, "X", [{ unit: "W", id: "w" }, { unit: "Y", id: "y" }, { unit: "Z", id: "z" }]);
  assert.equal(up.id, "y", "Y is closer above X than W");
  assert.equal(up.rel.agree, 7);
  assert.equal(upperNeighbour(pile, "W", [{ unit: "Y" }, { unit: "X" }]), null, "nothing above the top unit");
});

// two planes over 0-100 m: the upper at z 0, the lower rising from -10 to +10 across x
const plane = (zAt) => { const p = [], idx = []; for (let j = 0; j <= 10; j++) for (let i = 0; i <= 10; i++) p.push(i * 10, j * 10, zAt(i * 10, j * 10)); for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) { const a = j * 11 + i; idx.push(a, a + 1, a + 12, a, a + 12, a + 11); } return { positions: Float64Array.from(p), indices: Uint32Array.from(idx) }; };

test("held at or under the next top up, or counted where it is above it", () => {
  const upper = plane(() => 0), lower = plane((x) => -10 + 0.2 * x);
  const at = meshHeightLookup(upper.positions, upper.indices);
  assert.equal(at(55, 45), 0); assert.ok(Number.isNaN(at(150, 50)), "off the mesh");
  const o = orderAgainst(lower.positions, at);
  assert.equal(o.compared, 121); assert.equal(o.above, 55); assert.ok(Math.abs(o.worstM - 10) < 1e-9); assert.equal(o.worstAt.x, 100);
  const pos = Float64Array.from(lower.positions), c = clampUnder(pos, at);
  assert.equal(c.moved, 55); assert.ok(Math.abs(c.maxM - 10) < 1e-9);
  assert.equal(orderAgainst(pos, at).above, 0, "nothing above it after");
  assert.equal(pos[2], -10, "a vertex already under it stays");
});

test("Check relationships: the order from the holes is checked by side; touching tops (zero thickness) are not a crossing", () => {
  const upper = plane(() => 0), lower = plane((x) => Math.min(0, -10 + 0.2 * x));
  const s = [{ id: "u", name: "Top of Y", positions: upper.positions, indices: upper.indices, relationships: [] },
    { id: "l", name: "Top of X", positions: lower.positions, indices: lower.indices, relationships: [{ relation: "below", targetId: "u", derived: "holes", mayTouch: true }] }];
  const res = checkTopology(s, { up: "z" });
  assert.equal(res.checked, 1);
  assert.equal(res.violations.filter((v) => v.kind === "intersection").length, 0);
  const wrong = plane((x) => -10 + 0.4 * x);
  const r2 = checkTopology([s[0], { ...s[1], positions: wrong.positions }], { up: "z" });
  assert.equal(r2.violations.filter((v) => v.kind === "wrong_side").length, 1, "above it over half the map: out of order");
  // between the vertices two touching meshes miss by centimetres (0.1 m live on the WA iron block): a touch under 0.5 m, unless mayTouch is off
  const near = plane((x) => (x > 50 ? 0.1 : -5));
  const touch = [s[0], { ...s[1], positions: near.positions }];
  assert.equal(checkTopology(touch, { up: "z" }).violations.filter((v) => v.kind === "wrong_side").length, 0);
  touch[1] = { ...touch[1], relationships: [{ relation: "below", targetId: "u" }] };
  assert.equal(checkTopology(touch, { up: "z" }).violations.filter((v) => v.kind === "wrong_side").length, 1, "a declared relationship keeps no tolerance");
});

test("the sheet can stop at the inputs' outline plus the margin", () => {
  // picks on a triangle: a box over their extent is about half extrapolation
  const pts = [];
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10 - i; j++) pts.push({ x: i * 50, y: j * 50, z: 100 - 0.05 * i * 50 + 0.02 * j * 50 });
  const box = fitExplicitSurface(pts, { margin: 20, resolution: 40 });
  const hull = fitExplicitSurface(pts, { margin: 20, resolution: 40, extent: "hull" });
  assert.equal(box.extent, "box"); assert.equal(hull.extent, "hull");
  assert.ok(box.quality.beyondPct > 45, `box ${box.quality.beyondPct}`);
  assert.ok(hull.quality.beyondPct < 30 && hull.quality.beyondPct < box.quality.beyondPct - 20, `hull ${hull.quality.beyondPct}`); // the 20 m band past the outline is all that is extrapolated
  assert.ok(hull.positions.length < box.positions.length && hull.hullCut > 0);
  for (let i = 0; i < hull.positions.length; i += 3) { const x = hull.positions[i], y = hull.positions[i + 1]; assert.ok(x + y <= 500 + 20 * Math.SQRT2 + 1, `vertex at ${x}, ${y} is past the outline + margin`); }
  // the build key: unchanged for a surface without the setting (no rebuild of older projects)
  const ep = { points: pts };
  assert.equal(inputKey({}, ep, false), inputKey({ extent: "box" }, ep, false));
  assert.notEqual(inputKey({ extent: "hull" }, ep, false), inputKey({}, ep, false));
});

test("wiring: Add the logged tops offers the zero-thickness picks, the pane keeps or checks the order and declares it", () => {
  const p = readFileSync(new URL("../src/components/ExplicitSurfacePanel.jsx", import.meta.url), "utf8");
  assert.match(p, /return upperNeighbour\(seedInfo\.pile, seedUnit, cands\);/);
  assert.match(p, /const c = clampUnder\(res\.positions, upperAt\);/);
  assert.match(p, /const o = orderAgainst\(res\.positions, upperAt\);/);
  assert.match(p, /\{ relation: "below", targetId: pileTop\.surfaceId, derived: "holes", mayTouch: true \}/);
  assert.match(p, /extent: def\.extent === "hull" \? "hull" : "box"/);
  assert.match(p, /<button onClick=\{seedAbsent\}/);
  const m = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(m, /const absent = pile\.kOf\.has\(unit\) \? absentTops\(runs, unit, pile\)\.tops : \[\];/);
  assert.match(m, /const areaPile = useMemo\(\(\) => \{ let v = null; return \(\) => v \|\| \(v = pileFromRuns\(/, "built on first use only");
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Keep under {upper}", "Add {n} zero-thickness pick(s) where {unit} is missing", "Stop at the inputs' outline (plus the margin)", "Stops {m} m past the inputs' outline."]) assert.ok(d[k], `${l}: ${k}`);
  }
});
