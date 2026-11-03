// TASKS.csv #1633 (review #1497, Lawyers) — Layout legends: long groups capped by frequency, categories from the holes in the frame
import test from "node:test";
import assert from "node:assert/strict";
import { categoryLegendGroups, capLegendGroups, legendGroupsToItems } from "../src/lib/legendGroups.js";
import { holesInFrame } from "../src/lib/layoutGeometry.js";

const rows = [];
for (let i = 0; i < 40; i++) rows.push({ hole_id: i < 20 ? "A" : "B", value: `desc ${i}` }); // 40 free-text one-offs
for (let i = 0; i < 30; i++) rows.push({ hole_id: "A", value: "py" }), rows.push({ hole_id: "B", value: "cpy" });
const groups = () => categoryLegendGroups({ keys: ["mnlgy"], layers: { mnlgy: rows }, layerVisible: { mnlgy: true }, labelFor: (k, v) => v, colorFor: () => "#888" });

test("counts ride along in the usual (alphabetical) order", () => {
  const [g] = groups();
  assert.equal(g.items.length, 42);
  assert.equal(g.counts[g.items.findIndex((it) => it[0] === "py")], 30);
});

test("a long group keeps its most frequent entries and a note row says how many were left out", () => {
  const [g] = capLegendGroups(groups(), 12, (n) => `+ ${n} more`);
  assert.equal(g.items.length, 13);
  assert.ok(g.items.some((it) => it[0] === "py") && g.items.some((it) => it[0] === "cpy"), "the common minerals survive");
  assert.deepEqual(g.items[12], ["+ 30 more", null, { note: true }]);
  const items = legendGroupsToItems([g]);
  assert.equal(items.length, 13);
  const short = [{ key: "litho", label: "Lithology", items: [["AND", "#f00"]] }];
  assert.equal(capLegendGroups(short)[0], short[0], "a short group is untouched");
});

test("holesInFrame: a top-down true-scale frame keeps the holes it shows; other frames give null", () => {
  // 1,000 m tall frame centred at (1000, 1000), 600 x 600 page px, image 600 x 600: 1 px = 1.667 m
  const vp = { type: "viewport", src: "x", planView: true, trueScale: true, targetWorld: { x: 1000, y: 1000 }, worldHeightAtTarget: 1000, w: 600, h: 600, imgW: 600, imgH: 600, cameraAzimuthDeg: 0 };
  const collars = [
    { hole_id: "in", x: 1100, y: 900, azimuth: 0, dip: -90, length: 100 },
    { hole_id: "out", x: 3000, y: 3000, azimuth: 0, dip: -90, length: 100 },
    { hole_id: "reaches", x: 1700, y: 1000, azimuth: 270, dip: -45, length: 500 }, // collar 200 m outside, runs back in
  ];
  const s = holesInFrame(vp, collars);
  assert.ok(s && s.has("in") && !s.has("out") && s.has("reaches"), JSON.stringify(s && [...s]));
  assert.equal(holesInFrame({ ...vp, planView: false }, collars), null);
});
