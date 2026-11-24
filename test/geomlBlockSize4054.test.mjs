// TASKS.csv #4054 — the geoML Block size: the Quality's size by default, halved for closed solids, a typed value wins over both, #4019's fix fills the same number,
// the add-on's cap and the budget warning say their numbers, and the panel remembers it. Made-up boxes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanBlockM, resolveBlockM, blockSizePlan, BLOCK_MIN_M, BLOCK_MAX_M, BLOCK_WARN, BLOCK_CAP } from "../src/lib/geomlBlockSize.js";
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the Quality's size is the default, for rock units and for grade", () => {
  for (const [q, m] of [[60, 60], [40, 40], [25, 25]]) assert.deepEqual(resolveBlockM({ qualityM: q }), { m, source: "quality", qualityM: q, defaultM: m });
  for (const [q, m] of [[50, 50], [30, 30], [20, 20]]) assert.equal(resolveBlockM({ qualityM: q }).m, m);
});

test("closed solids (bodies, grade shells) halve it, never under 10 m", () => {
  assert.deepEqual([60, 40, 25].map((q) => resolveBlockM({ qualityM: q, halved: true }).m), [30, 20, 13]);
  assert.deepEqual([50, 30, 20].map((q) => resolveBlockM({ qualityM: q, halved: true }).m), [25, 15, 10]);
  assert.equal(resolveBlockM({ qualityM: 12, halved: true }).m, 10);
  assert.equal(resolveBlockM({ qualityM: 40, halved: true }).source, "halved");
});

test("a value the person typed wins over the Quality and over the halving, and the default stays on offer", () => {
  const a = resolveBlockM({ qualityM: 40, halved: true, user: 35 });
  assert.deepEqual(a, { m: 35, source: "user", qualityM: 40, defaultM: 20 }, "35 is finer-than-nothing here: the user's, not the halved 20");
  assert.equal(resolveBlockM({ qualityM: 60, halved: false, user: 45 }).m, 45);
  assert.equal(resolveBlockM({ qualityM: 40, halved: true, user: 12 }).m, 12, "finer than the halved default is allowed down to the floor");
  // not set: blank, text, zero, negative
  for (const v of [null, undefined, "", "abc", 0, -5, NaN]) assert.equal(resolveBlockM({ qualityM: 40, user: v }).source, "quality", String(v));
});

test("#4019's smaller-blocks fix fills the same number: the unit's, through the panel's setter", () => {
  const p = read("src/components/PredictivePanel.jsx");
  assert.match(p, /else if \(f\.key === "smaller"\) blockSizes\.setUnit\(f\.blockM\);/);
  assert.match(p, /params\.block_size = unitSize\.m;/);
  assert.match(p, /gradeParams\.block_size = gradeSize\.m;/);
  assert.match(p, /const unitSize = resolveBlockM\(\{ qualityM: QUALITY\[quality\]\.domain\.block_size, halved: shape === "bodies", user: blockSizes\.unit \}\);/);
  assert.match(p, /const gradeSize = resolveBlockM\(\{ qualityM: QUALITY\[quality\]\.grade\.block_size, halved: shellsOn, user: blockSizes\.grade \}\);/);
  assert.doesNotMatch(p, /blockOverride/, "one number, not an override beside it");
  // the fix's value, as the panel keeps it
  assert.equal(resolveBlockM({ qualityM: 60, user: 30 }).m, 30);
  assert.equal(resolveBlockM({ qualityM: 60, halved: true, user: 30 }).source, "user");
});

test("typed values are held to 10 .. 500 m and to half metres", () => {
  assert.equal(cleanBlockM("3"), BLOCK_MIN_M); assert.equal(cleanBlockM(9999), BLOCK_MAX_M);
  assert.equal(cleanBlockM("12.26"), 12.5); assert.equal(cleanBlockM(25), 25);
  assert.equal(BLOCK_MIN_M, 10);
});

test("the block count, the Quality's own count, the extra blocks, the budget warning and the add-on's cap", () => {
  const box = [2000, 2000, 1000]; // metres
  const d = blockSizePlan(box, resolveBlockM({ qualityM: 40 }));
  assert.equal(d.cell, 40); assert.deepEqual([d.blocks, d.baseBlocks, d.more, d.over, d.capped], [50 * 50 * 25, 50 * 50 * 25, 0, false, false], "the Quality's own 62,500 blocks is what they already run: no warning");
  // a finer size over the add-on's cap: warned, and the add-on grows the block
  const finer = blockSizePlan(box, resolveBlockM({ qualityM: 40, user: 20 }));
  assert.equal(finer.more, finer.blocks - 62500);
  assert.deepEqual([finer.over, finer.capped], [true, true]);
  assert.ok(finer.cell > 20 && finer.blocks <= BLOCK_CAP, "the add-on grows the block until it holds at most the cap");
  // between the budget and the cap: a warning, no growth
  const w = blockSizePlan([1000, 1000, 500], resolveBlockM({ qualityM: 40, user: 20 })); // 50 x 50 x 25 = 62,500 blocks (the Quality's own: 25 x 25 x 13 = 8,125)
  assert.deepEqual([w.blocks, w.baseBlocks, w.over, w.capped, w.cell], [62500, 8125, true, false, 20]);
  // under the budget: a finer size says its count and no warning
  const ok = blockSizePlan([1000, 1000, 500], resolveBlockM({ qualityM: 40, user: 30 })); // 34 x 34 x 17 = 19,652
  assert.deepEqual([ok.over, ok.capped], [false, false]); assert.ok(ok.more > 0);
  // the halved default makes more blocks than the Quality's own, and says so without a warning (as it did before)
  assert.equal(blockSizePlan([1000, 1000, 500], resolveBlockM({ qualityM: 20, halved: true })).over, false);
  assert.equal(BLOCK_WARN, 40000); assert.equal(BLOCK_CAP, 100000);
  assert.equal(blockSizePlan(null, resolveBlockM({ qualityM: 40 })), null, "no holes, no plan");
  // a coarser value than the Quality's makes fewer blocks and no extra time
  const coarse = blockSizePlan(box, resolveBlockM({ qualityM: 40, user: 80 }));
  assert.ok(coarse.blocks < coarse.baseBlocks && coarse.more === 0);
});

test("the panel: one Block size box for rock units and one for grade, with their sources, count, warning and cap; remembered on this computer", () => {
  const p = read("src/components/PredictivePanel.jsx"), c = read("src/components/GeomlBlockSize.jsx"), h = read("src/lib/useGeomlBlockSize.js");
  assert.equal((p.match(/<GeomlBlockSize /g) || []).length, 2);
  assert.match(p, /<GeomlBlockSize size=\{unitSize\} plan=\{unitBlocks\} typed=\{blockSizes\.unit\} onChange=\{blockSizes\.setUnit\}/);
  assert.match(p, /<GeomlBlockSize size=\{gradeSize\} plan=\{gradeBlocks\} typed=\{blockSizes\.grade\} onChange=\{blockSizes\.setGrade\}/);
  assert.match(p, /const blockSizes = useGeomlBlockSize\(\);/);
  for (const k of ["Block size (m)", "Yours; the default is {m} m.", "Default: {m} m, half the quality's {q} m (closed solids).", "Default: {m} m, from the quality.", "Over {w} blocks: slow on a modest computer.", "The add-on keeps at most {max} blocks, so it grows them to {c} m."]) assert.ok(c.includes(`tr("${k}"`), k);
  assert.match(c, /\{typed != null && <button type="button"[^\n]*onClick=\{\(\) => onChange\(null\)\}>\{tr\("Reset"\)\}<\/button>\}/);
  assert.match(c, /BLOCK_WARN\.toLocaleString\(\)/); assert.match(c, /BLOCK_CAP\.toLocaleString\(\)/);
  assert.match(h, /window\.localStorage\.setItem\(KEY, JSON\.stringify\(out\)\)/);
  assert.doesNotMatch(p, /localStorage/, "the panel itself keeps no storage: the hook does");
  // the training settings stay with the Quality: block_size is the only key the new boxes touch
  assert.match(p, /\.\.\.QUALITY\[quality\]\.domain/); assert.match(p, /\.\.\.QUALITY\[quality\]\.grade/);
  for (const lang of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(read(`src/locales/${lang}.json`)); for (const k of ["Block size (m)", "Yours; the default is {m} m.", "Over {w} blocks: slow on a modest computer."]) assert.ok(d[k], `${lang}: ${k}`); }
});
