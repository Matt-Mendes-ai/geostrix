// TASKS.csv #640 — merging inverted DC/IP lines into one 3D block model
import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionModelsByMethod, sectionSamples, suggestMergeRadius, mergeRequest, unstretchCells, betweenLines } from "../src/lib/sectionMerge.js";
import { estimateBlockModel } from "../src/lib/estimation.js";

// three E-W lines 300 m apart, 25 m x 12.5 m cells; the value is the depth below 1000 m (so a merge that mixes
// depths shows up at once), and line y=300 carries a +50 body at 975-1000 m between x 400 and 600
const line = (id, y, method = "ip") => {
  const cells = [];
  for (let x = 12.5; x < 1000; x += 25) for (let z = 993.75; z > 800; z -= 12.5) {
    let v = 1000 - z;
    if (y === 300 && x > 400 && x < 600 && z > 975) v += 50;
    cells.push({ x, y, z, dx: 25, dy: 25, dz: 12.5, value: method === "dc" ? 10 ** (1 + v / 100) : v, support: z > 880 ? 0.5 : 0.001 });
  }
  return { id, method, supportCutoff: 0.02, cells };
};

test("finds the line models and keeps only the cells the data see", () => {
  const models = [line("a", 0), line("b", 300), { id: "z", method: "mag", cells: [{}] }, line("r", 0, "dc")];
  const by = sectionModelsByMethod(models);
  assert.deepEqual(by.ip.map((m) => m.id), ["a", "b"]);
  assert.deepEqual(by.dc.map((m) => m.id), ["r"]);
  const { points, dz } = sectionSamples(by.ip);
  assert.equal(dz, 12.5);
  assert.ok(points.every((p) => p.z > 880));
  assert.equal(points.length, 2 * 40 * 10);
});

test("suggested radius reaches the next line", () => {
  const { points } = sectionSamples([line("a", 0), line("b", 300), line("c", 600)]);
  const r = suggestMergeRadius(points);
  assert.ok(r >= 300 && r <= 340, String(r));
  assert.equal(suggestMergeRadius(sectionSamples([line("a", 0)]).points), null);
});

test("interpolates between lines at the same depth, never outside them", () => {
  const { points, dz } = sectionSamples([line("a", 0), line("b", 300), line("c", 600)]);
  const req = mergeRequest(points, { radius: 330, cell: 25, dz });
  const res = estimateBlockModel(req.points, req.opts);
  const cells = betweenLines(unstretchCells(res.cells, req.stretch, "ip"), points, 330);
  // every plan column between the outer lines is filled (none emptied beside a line)
  assert.equal(new Set(cells.map((c) => c.y)).size, 24);
  assert.ok(cells.length > 1000);
  const ys = cells.map((c) => c.y), zs = cells.map((c) => c.z);
  assert.ok(Math.min(...ys) >= -12.5 && Math.max(...ys) <= 612.5, "no blocks beyond the outer lines");
  assert.ok(Math.min(...zs) > 880 - 12.5, "no blocks below where the lines see");
  // away from the body, a block's value is (close to) its own depth: the search stayed flat
  const far = cells.filter((c) => c.x < 300);
  const worst = Math.max(...far.map((c) => Math.abs(c.value - (1000 - c.z))));
  assert.ok(worst < 8, `depth mixing ${worst.toFixed(1)}`);
  // the body on the middle line shows between the lines, fading away from it
  const at = (y) => cells.filter((c) => c.x > 450 && c.x < 550 && c.z > 980 && Math.abs(c.y - y) < 13).map((c) => c.value - (1000 - c.z));
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(mean(at(300)) > 30 && mean(at(150)) > 5 && mean(at(150)) < mean(at(300)), `${mean(at(300))} ${mean(at(150))}`);
});

test("resistivity is interpolated in log space and returned in ohm.m", () => {
  const { points, dz } = sectionSamples([line("a", 0, "dc"), line("b", 300, "dc")]);
  assert.ok(points.every((p) => p.value < 3)); // log10
  const req = mergeRequest(points, { radius: 330, cell: 50, dz });
  const cells = unstretchCells(estimateBlockModel(req.points, req.opts).cells, req.stretch, "dc");
  const c = cells.find((k) => k.x < 300 && Math.abs(k.z - 943.75) < 7);
  assert.ok(Math.abs(Math.log10(c.value) - (1 + (1000 - c.z) / 100)) < 0.1, String(c.value));
});

test("a grid over the block limit grows its cell instead of failing", () => {
  const { points, dz } = sectionSamples([line("a", 0), line("b", 300)]);
  const req = mergeRequest(points, { radius: 330, cell: 1, dz, maxBlocks: 20000 });
  assert.ok(req.cell > 1);
  assert.doesNotThrow(() => estimateBlockModel(req.points, req.opts));
});

// TASKS.csv #664 — between two lines the merge is a blend, not a copy of the nearest line with a step halfway
test("between two lines the value blends from one to the other (no nearest-line step)", () => {
  const flat = (id, y, v) => ({ id, method: "ip", supportCutoff: 0.02, cells: Array.from({ length: 40 }, (_, i) => ({ x: 12.5 + 25 * i, y, z: 993.75, dx: 25, dy: 25, dz: 12.5, value: v, support: 0.5 })) });
  const { points, dz } = sectionSamples([flat("a", 0, 0), flat("b", 300, 100)]);
  const req = mergeRequest(points, { radius: 330, cell: 25, dz });
  assert.equal(req.opts.minHoles, 2);
  const cells = betweenLines(unstretchCells(estimateBlockModel(req.points, req.opts).cells, req.stretch, "ip"), points, 330);
  const byY = new Map();
  cells.filter((c) => c.x > 300 && c.x < 700).forEach((c) => { const k = Math.round(c.y); if (!byY.has(k)) byY.set(k, []); byY.get(k).push(c.value); });
  const prof = [...byY.entries()].sort((a, b) => a[0] - b[0]).map(([y, v]) => [y, v.reduce((s, x) => s + x, 0) / v.length]);
  for (let i = 1; i < prof.length; i++) assert.ok(prof[i][1] >= prof[i - 1][1] - 1e-9, "rises from one line to the other");
  const mid = prof.filter(([y]) => y > 60 && y < 240);
  assert.ok(mid.length >= 6 && mid.every(([, v]) => v > 2 && v < 98), JSON.stringify(prof.map(([y, v]) => [y, Math.round(v)])));
  const steps = prof.slice(1).map(([, v], i) => v - prof[i][1]);
  assert.ok(Math.max(...steps) < 25, `largest step between neighbouring blocks ${Math.max(...steps).toFixed(1)}`);
});
