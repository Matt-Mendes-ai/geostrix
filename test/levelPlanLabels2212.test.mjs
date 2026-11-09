// TASKS.csv #2212 (review #2174, WA gold) — level-plan hole ids in underground fans: one label per tight group, none printed over another
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clusterLabelPoints, groupLabelText, resolveLabels } from "../src/lib/sectionLabels.js";

test("points within the radius share a group, the ids kept once and in order", () => {
  const g = clusterLabelPoints([
    { key: "a", id: "WB0705UD", x: 100, y: 100 }, { key: "b", id: "WB0720UD", x: 103, y: 102 }, { key: "c", id: "WB0770UD", x: 99, y: 106 },
    { key: "d", id: "WB0705UD", x: 101, y: 101 }, { key: "e", id: "WB0800D", x: 140, y: 100 },
  ], 8);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].ids, ["WB0705UD", "WB0720UD", "WB0770UD"]);
  assert.equal(groupLabelText(g[0].ids), "WB0705UD +2");
  assert.equal(groupLabelText(g[1].ids), "WB0800D");
});

test("a fan of 60 pierce points in a small patch: grouped, and the optional labels never overlap", () => {
  const pts = [];
  for (let i = 0; i < 60; i++) pts.push({ key: `k${i}`, id: `H${i}`, x: 300 + (i % 10) * 4, y: 200 + Math.floor(i / 10) * 4 });
  const groups = clusterLabelPoints(pts, 8);
  assert.ok(groups.length < 15, `${groups.length} groups for 60 points`);
  const placed = resolveLabels(groups.map((g) => ({ key: g.key, text: groupLabelText(g.ids), size: 10.5, prio: 2, optional: true, cands: [{ x: g.x + 6, y: g.y - 5, anchor: "start" }] })), [], { bounds: [2, 758], yBounds: [20, 558] });
  const box = (l) => { const w = l.text.length * 10.5 * 0.6; return { x0: l.x, x1: l.x + w, y0: l.y - 10.5, y1: l.y + 2 }; };
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const a = box(placed[i]), b = box(placed[j]);
    assert.ok(!(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1), `${placed[i].text} and ${placed[j].text} overlap`);
  }
});

test("the level plan uses the groups, optional labels, a tooltip with the ids, and says what it left out", () => {
  const s = readFileSync(new URL("../src/components/LevelPlanWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /clusterLabelPoints\(data\.holes\.flatMap/);
  assert.match(s, /prio: 2, optional: true/);
  assert.match(s, /<title>\{l\.ids\.join\(", "\)\}<\/title>/);
  assert.match(s, /\{hidden\} label\(s\) had no free spot and are left out/);
});
