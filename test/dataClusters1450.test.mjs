// TASKS.csv #1449 / #1450 / #1451 — Silvertip: far outliers do not size the evidence grid or a reach; a pad counts once
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mainClusters } from "../src/lib/dataClusters.js";
import { reachFromSpacing, medianSiteSpacing, pickDefaultReachM } from "../src/lib/evidenceSources.js";
import { silvertipSurface } from "../src/lib/sampleSilvertip.js";

const samples = ["rocks", "soils", "streams"].flatMap((f) => silvertipSurface(readFileSync(`sample_data/silvertip/${f}.csv`, "utf8"), f).samples);
const collars = readFileSync("sample_data/silvertip/collars.csv", "utf8").trim().split(/\r?\n/).slice(1).map((l) => { const [, x, y] = l.split(","); return { x: +x, y: +y }; });

test("#1450: the 5 rocks 45 km south are left out; everything else stays", () => {
  const { keep, dropped } = mainClusters(samples);
  assert.equal(dropped, 5);
  const ys = samples.filter((_, i) => keep[i]).map((s) => s.y);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 35000, "the kept extent no longer reaches 45 km south");
});

test("#1450: a lone point, empty input, and a small group of many still behave", () => {
  assert.deepEqual(mainClusters([]), { keep: [], dropped: 0 });
  assert.equal(mainClusters([{ x: 0, y: 0 }]).dropped, 0);
  const grid = Array.from({ length: 400 }, (_, i) => ({ x: (i % 20) * 50, y: Math.floor(i / 20) * 50 }));
  const r = mainClusters([...grid, { x: 1e5, y: 0 }, { x: NaN, y: 0 }]);
  assert.equal(r.dropped, 1); assert.equal(r.keep.at(-1), false); assert.equal(r.keep.at(-2), false);
  const two = mainClusters([...grid, ...grid.map((p) => ({ x: p.x + 50000, y: p.y }))]);
  assert.equal(two.dropped, 0, "two big camps both stay");
});

test("#1449: each medium gets its own reach — soils a few hundred metres, streams kilometres", () => {
  const { keep } = mainClusters(samples), core = samples.filter((_, i) => keep[i]);
  const soil = reachFromSpacing(core.filter((s) => s.medium === "soil")), stream = reachFromSpacing(core.filter((s) => s.medium === "stream sediment"));
  assert.ok(soil < 500, `soil ${soil}`);
  assert.ok(stream > 1500, `stream ${stream}`);
  assert.ok(reachFromSpacing(samples) > 2000, "pooled with the far rocks it was 2.5 km");
});

test("#1451: collars on a pad are one site; the structure reach is no longer 4 m on Silvertip", () => {
  const s = medianSiteSpacing(collars);
  assert.ok(s > 100, `site spacing ${s}`);
  assert.ok(pickDefaultReachM(500, s) >= 300);
  assert.equal(medianSiteSpacing([{ x: 0, y: 0 }, { x: 2, y: 1 }]), null, "one pad: no spacing");
});

test("#1461: the default fetch area covers the collars and the soil grid near them, not the far rocks", async () => {
  const { fetchAreaBox } = await import("../src/lib/dataExtent.js");
  const allCollars = readFileSync("sample_data/silvertip/collars.csv", "utf8").trim().split(/\r?\n/).slice(1).map((l) => { const [, x, y] = l.split(","); return { x: +x, y: +y }; });
  const [x0, y0, x1, y1] = fetchAreaBox(allCollars, samples);
  const soils = samples.filter((s) => s.medium === "soil");
  assert.ok(soils.every((s) => s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1), "every soil inside");
  assert.ok(y0 > 6600000, "the rocks 45 km south are not");
  assert.equal(fetchAreaBox([], samples), null);
});
