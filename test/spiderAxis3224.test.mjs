// TASKS.csv #3224 (review #3195, Galore Creek) — the spider: analysed elements without a neighbour were invisible and unanalysed ones kept their
// place on the axis
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/GeochemPlot.jsx", import.meta.url), "utf8");
const body = src.slice(src.indexOf("export function spiderAxis"), src.indexOf("function SpiderPlot("));
const { spiderAxis } = new Function(`${body.replace(/export /g, "")}; return { spiderAxis };`)();

test("the axis holds the elements some sample has; the rest are listed", () => {
  const order = ["Cs", "Rb", "Ba", "Th", "Sr", "Nd", "Ti", "Y"];
  const pr = (vals) => order.map((s) => ({ value: vals[s] ?? null }));
  const { present, dropped } = spiderAxis(order, [pr({ Rb: 10, Ba: 50, Sr: 30, Ti: 2, Y: 5 }), pr({ Rb: 12, Sr: 20 })]);
  assert.deepEqual(present.map((i) => order[i]), ["Rb", "Ba", "Sr", "Ti", "Y"]);
  assert.deepEqual(dropped, ["Cs", "Th", "Nd"]);
  assert.deepEqual(spiderAxis(order, []).present, []);
});

test("wiring: a marker at every value, a dashed bridge over a sample's gaps, the dropped list", () => {
  assert.match(src, /<circle key=\{j\} cx=\{sx\(j\)\} cy=\{sy\(p\.value\)\} r=\{1\.6\}/);
  assert.match(src, /strokeDasharray="3 3" \/>\}\{\/\* #3224 \*\//);
  assert.match(src, /tr\("Not analysed in these samples, left off the axis: \{list\}"/);
  assert.match(src, /order\.map\(\(sym, i\) => posOf\.has\(i\) &&/);
});
