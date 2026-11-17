// TASKS.csv #3859 (Scottie Gold review) — a log-scale assay track on a strip log was captioned with its two ends only ('log 0.004–150'): no decade
// tick or grid line, and the two longest bars (150 and 90 g/t) carried no value. Synthetic values only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { logAxisTicks, peakValueLabels, buildStripLogSvgMarkup } from "../src/lib/striplogSvg.js";

test("the decades of a log axis, each at its place, labelled where they do not touch", () => {
  const t = logAxisTicks(0.004, 150, { widthPx: 80, fontPx: 7 });
  assert.deepEqual(t.map((q) => q.v), [0.01, 0.1, 1, 10, 100]);
  const at = (v) => t.find((q) => q.v === v).f;
  assert.ok(Math.abs(at(1) - (Math.log10(1) - Math.log10(0.004)) / (Math.log10(150) - Math.log10(0.004))) < 1e-12);
  assert.equal(t.at(-1).label, "100", "the highest decade is labelled (set inside the track's end)");
  assert.equal(t.at(-1).anchor, "end");
  const labelled = t.filter((q) => q.label);
  assert.ok(labelled.length >= 3);
  // labels never overlap: their boxes in order
  const box = (q) => { const w = q.label.length * 7 * 0.55, px = q.f * 80; return q.anchor === "start" ? [px, px + w] : q.anchor === "end" ? [px - w, px] : [px - w / 2, px + w / 2]; };
  for (let i = 1; i < labelled.length; i++) assert.ok(box(labelled[i])[0] >= box(labelled[i - 1])[1], `${labelled[i - 1].label} / ${labelled[i].label}`);
  assert.deepEqual(logAxisTicks(2, 3000, { widthPx: 82, fontPx: 8 }).map((q) => q.label), ["10", "100", "1,000"]);
  // under two decades (the Log scale box ticked on a narrow range): 2 and 5 between
  assert.deepEqual(logAxisTicks(3, 20).map((q) => q.v), [5, 10, 20]);
  assert.deepEqual(logAxisTicks(0, 5), []);
});

test("the highest values are written at their bars, at most two, apart", () => {
  const items = [{ v: 150, y: 300, f: 1 }, { v: 90, y: 304, f: 0.95 }, { v: 90, y: 330, f: 0.95 }, { v: 2, y: 10, f: 0.5 }];
  assert.deepEqual(peakValueLabels(items).map((q) => [q.v, q.y]), [[150, 300], [90, 330]], "the 90 at 304 m is too close to the 150");
  assert.deepEqual(peakValueLabels([{ v: 2, y: 10, f: 0.5 }]), [], "no bar reaches the edge: none");
});

test("the Atlas strip log draws them; the window (and so 'Add to Layout') too", () => {
  const collar = { hole_id: "SYN-1", x: 0, y: 0, z: 100, azimuth: 0, dip: -60, length: 200 };
  const assays = [[0, 2, 0.004], [2, 4, 0.04], [50, 52, 0.5], [100, 102, 8], [40.5, 41.5, 150], [41.5, 42.5, 90]].map(([from, to, v]) => ({ hole_id: "SYN-1", from, to, values: { Au: v } }));
  const svg = buildStripLogSvgMarkup({ holeId: "SYN-1", collars: [collar], layers: {}, assays, assaySymbols: ["Au"], elementUnits: { Au: "g/t" } });
  const text = svg.svg;
  for (const label of [">0.01<", ">1<", ">100<"]) assert.ok(text.includes(label), `tick ${label}`);
  assert.match(text, />150</, "the highest value written");
  assert.match(text, /log 0\.004–150</, "the ends still said (two figures)");
  const w = readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");
  assert.match(w, /!axisOf\(t\.sym\)\.linear && logAxisTicks\(assayRange\[t\.sym\]\?\.minPos, assayRange\[t\.sym\]\?\.max/);
  assert.match(w, /peakValueLabels\(t\.rows\.map/);
});
