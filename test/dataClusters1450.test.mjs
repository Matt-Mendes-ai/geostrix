// TASKS.csv #1449 / #1450 / #1451 — Silvertip: far outliers do not size the evidence grid or a reach; a pad counts once
// TASKS.csv #3134 — Silvertip is no longer in the repository (BC's terms): each check runs on a synthetic layout like it (a soil grid at
// 100 m, stream sediments kilometres apart, rocks near the holes and five 45 km south, collars three to a pad), and on the real files where
// they are found (test/helpers/bcSample.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mainClusters } from "../src/lib/dataClusters.js";
import { reachFromSpacing, medianSiteSpacing, pickDefaultReachM } from "../src/lib/evidenceSources.js";
import { fetchAreaBox } from "../src/lib/dataExtent.js";
import { silvertipSurface } from "../src/lib/sampleSilvertip.js";
import { bcSkip, bcText } from "./helpers/bcSample.mjs";

const X0 = 425000, Y0 = 6640000;
const synthetic = () => {
  const soils = [], streams = [], rocks = [], collars = [];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 14; j++) soils.push({ x: X0 + i * 100, y: Y0 + j * 100, medium: "soil" });
  for (let k = 0; k < 30; k++) streams.push({ x: X0 - 12000 + (k % 6) * 4000 + ((k * 37) % 500), y: Y0 - 10000 + Math.floor(k / 6) * 4000 + ((k * 53) % 600), medium: "stream sediment" });
  for (let k = 0; k < 40; k++) rocks.push({ x: X0 + 300 + (k % 8) * 180, y: Y0 + 200 + Math.floor(k / 8) * 170, medium: "rock chip" });
  for (let k = 0; k < 5; k++) rocks.push({ x: X0 + 1000 + k * 60, y: Y0 - 45000 + k * 40, medium: "rock chip" }); // 45 km south
  [[0, 0], [400, 0], [0, 450], [420, 430]].forEach(([dx, dy]) => { for (let h = 0; h < 3; h++) collars.push({ x: X0 + 500 + dx + h * 1.5, y: Y0 + 500 + dy + h }); }); // three holes a pad
  return { samples: [...rocks, ...soils, ...streams], collars };
};
const real = () => ({
  samples: ["rocks", "soils", "streams"].flatMap((f) => silvertipSurface(bcText("silvertip", `${f}.csv`), f).samples),
  collars: bcText("silvertip", "collars.csv").trim().split(/\r?\n/).slice(1).map((l) => { const [, x, y] = l.split(","); return { x: +x, y: +y }; }),
});
const CASES = [["synthetic", synthetic, false], ["Silvertip", real, bcSkip("silvertip")]];

for (const [label, data, skip] of CASES) {
  test(`#1450 (${label}): the 5 rocks 45 km south are left out; everything else stays`, { skip }, () => {
    const { samples } = data();
    const { keep, dropped } = mainClusters(samples);
    assert.equal(dropped, 5);
    const ys = samples.filter((_, i) => keep[i]).map((s) => s.y);
    assert.ok(Math.max(...ys) - Math.min(...ys) < 35000, "the kept extent no longer reaches 45 km south");
  });

  test(`#1449 (${label}): each medium gets its own reach — soils a few hundred metres, streams kilometres`, { skip }, () => {
    const { samples } = data();
    const { keep } = mainClusters(samples), core = samples.filter((_, i) => keep[i]);
    const soil = reachFromSpacing(core.filter((s) => s.medium === "soil")), stream = reachFromSpacing(core.filter((s) => s.medium === "stream sediment"));
    assert.ok(soil < 500, `soil ${soil}`);
    assert.ok(stream > 1500, `stream ${stream}`);
    assert.ok(reachFromSpacing(samples) > 2000, "pooled with the far rocks it was 2.5 km");
  });

  test(`#1451 (${label}): collars on a pad are one site; the structure reach is no longer 4 m`, { skip }, () => {
    const s = medianSiteSpacing(data().collars);
    assert.ok(s > 100, `site spacing ${s}`);
    assert.ok(pickDefaultReachM(500, s) >= 300);
  });

  test(`#1461 (${label}): the default fetch area covers the collars and the soil grid near them, not the far rocks`, { skip }, () => {
    const { samples, collars } = data();
    const [x0, y0, x1, y1] = fetchAreaBox(collars, samples);
    const soils = samples.filter((s) => s.medium === "soil");
    assert.ok(soils.every((s) => s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1), "every soil inside");
    assert.ok(y0 > 6600000, "the rocks 45 km south are not");
  });
}

test("#1450: a lone point, empty input, and a small group of many still behave", () => {
  assert.deepEqual(mainClusters([]), { keep: [], dropped: 0 });
  assert.equal(mainClusters([{ x: 0, y: 0 }]).dropped, 0);
  const grid = Array.from({ length: 400 }, (_, i) => ({ x: (i % 20) * 50, y: Math.floor(i / 20) * 50 }));
  const r = mainClusters([...grid, { x: 1e5, y: 0 }, { x: NaN, y: 0 }]);
  assert.equal(r.dropped, 1); assert.equal(r.keep.at(-1), false); assert.equal(r.keep.at(-2), false);
  const two = mainClusters([...grid, ...grid.map((p) => ({ x: p.x + 50000, y: p.y }))]);
  assert.equal(two.dropped, 0, "two big camps both stay");
});

test("#1451 / #1461: one pad has no spacing; with no collars there is no fetch area", () => {
  assert.equal(medianSiteSpacing([{ x: 0, y: 0 }, { x: 2, y: 1 }]), null, "one pad: no spacing");
  assert.equal(fetchAreaBox([], synthetic().samples), null);
});
