// TASKS.csv #3936 — Model from map on a regional map: the order cut down to GemPy's 16 units (lib/mapOrderCut.js), each choice with its reason:
// units only outside the drilled area left out, neighbours of one group / formation or one age merged, the rest ranked by area and contact.
// A synthetic 27-unit map (made-up names and ages); the role list keeps the user's choice ('Change these').
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cutMapOrder, groupKey } from "../src/lib/mapOrderCut.js";

// 27 units in east-west strips 500 m wide (unit i from y = 500 i), 20 km long; the holes in the middle (x 9-11 km, y 5-15 km): the drilled area
// with its margin (2.5 km) runs y 2.5-17.5 km, so units 0-4 lie only outside it. Units 10-12 are one group, 14-15 one age, 16-18 another.
function map27() {
  const names = Array.from({ length: 27 }, (_, i) => `Unit ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? "2" : ""}`);
  names[10] = "Kappa Gp (lower)"; names[11] = "Kappa Gp (middle)"; names[12] = "Kappa Gp (upper)";
  const ages = names.map(() => "");
  ages[14] = ages[15] = "Devonian"; ages[16] = ages[17] = ages[18] = "Silurian";
  const features = names.map((n, i) => {
    const y0 = 500 * i, y1 = y0 + 500;
    return { attributes: { unit: n, age: ages[i] }, parts: [[[0, y0], [20000, y0], [20000, y1], [0, y1], [0, y0]]] };
  });
  const order = names.slice().reverse(); // youngest (north) first
  // contact length with each neighbour: 20 km, except the youngest unit (2 km: little evidence)
  const pairs = names.slice(1).map((n, i) => ({ a: names[i], b: n, lengthM: i === 25 ? 2000 : 20000 }));
  const collars = [];
  for (let x = 9000; x <= 11000; x += 1000) for (let y = 5000; y <= 15000; y += 2500) collars.push({ x, y });
  return { layer: { features }, field: "unit", ageField: "age", order, pairs, collars, names };
}

test("27 units cut to 16: outside left out, a group and two ages merged, the weakest ranked out", () => {
  const m = map27(), r = cutMapOrder(m);
  assert.equal(r.before, 27);
  assert.equal(r.after, 16);
  assert.equal(r.kept.length, 16);
  const out = r.leftOut.filter((x) => x.why === "outside").map((x) => x.unit).sort();
  assert.deepEqual(out, m.names.slice(0, 5).sort()); // only outside the drilled area
  const g = r.merged.find((x) => x.why === "group");
  assert.deepEqual([g.name, g.members.sort()], ["Kappa Gp", ["Kappa Gp (lower)", "Kappa Gp (middle)", "Kappa Gp (upper)"]]);
  assert.ok(r.merged.some((x) => x.why === "age")); // a run of one age merged while still over the limit
  for (const [member, name] of Object.entries(r.merge)) assert.ok(r.kept.includes(name), `${member} -> ${name}`);
  // still over after the merges: the weakest (little contact, a strip's area) ranked out, with its figures
  const ranked = r.leftOut.filter((x) => x.why === "rank");
  assert.ok(ranked.length >= 1);
  assert.ok(ranked.some((x) => x.unit === m.names[26] && x.contactKm === 2));
  assert.ok(ranked.every((x) => x.areaKm2 > 0));
  // the order keeps its sequence: kept units in the same relative order as before
  const pos = (u) => m.order.indexOf(r.merged.find((x) => x.name === u)?.members[0] ?? u);
  for (let i = 1; i < r.kept.length; i++) assert.ok(pos(r.kept[i - 1]) < pos(r.kept[i]), r.kept.join(" | "));
});

test("within the limit: no cut; only neighbours merge; no collars: nothing is called outside", () => {
  const m = map27();
  assert.equal(cutMapOrder({ ...m, order: m.order.slice(0, 16) }), null);
  // group members apart in the order are not merged
  const apart = m.order.slice(); const k = apart.indexOf("Kappa Gp (middle)"); apart.splice(k, 1); apart.push("Kappa Gp (middle)");
  const r = cutMapOrder({ ...m, order: apart });
  assert.ok(!r.merged.some((x) => x.members.includes("Kappa Gp (middle)") && x.members.length > 1 && x.why === "group" && !x.members.includes("Kappa Gp (lower)")));
  const noHoles = cutMapOrder({ ...m, collars: [] });
  assert.equal(noHoles.leftOut.filter((x) => x.why === "outside").length, 0);
  assert.equal(noHoles.after, 16);
  assert.equal(groupKey("Earn Gp"), "earn group");
  assert.equal(groupKey("Earn Group: Portrait Lake Fm"), "earn group");
  assert.equal(groupKey("Road River Fm (shale; minor chert)"), "road river formation");
  assert.equal(groupKey("Unit A"), null);
});

test("Model from map offers the cut before the run, with the reasons and 'Change these'", () => {
  const p = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /cutMapOrder\(\{/);
  assert.match(p, /tr\("Cut the order down for me"\)/);
  assert.match(p, /tr\("Change these"\)/);
  assert.match(p, /mergeUnits\(layer, unitField, cut\.merge\)/);
});
