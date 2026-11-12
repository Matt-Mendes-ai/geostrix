// TASKS.csv #2885 (review #2876, WA bedded iron) — the 2.58 M-reading log on the app's own offer (0.5 m bins) froze 23.8 s, took 2.4 GB of
// heap and left 1.44 M rows in three layers (seven times the budget): nothing coarser was offered and no choice said what it leaves. The
// menu now has 0.5 / 1 / 2 / 5 m with the rows and memory of each, the smallest bin that fits the budget is pre-selected, and binning no
// longer makes an object and a string key per reading.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { logBinEstimate, fittingLogBin, defaultLogBin, effectiveLogBin, logChannelRows, LOG_BINS, LOG_RAW_BUDGET } from "../src/lib/downholeLogChannels.js";

// h holes of 0..len m at 0.1 m steps
const logOf = (h, len) => { const rows = []; for (let k = 0; k < h; k++) for (let d = 0; d <= len * 10; d++) rows.push({ H: `RC${String(k).padStart(4, "0")}`, D: (d / 10).toFixed(1), G: String(40 + ((k * 7 + d) % 30)) }); return rows; };
const m = { hole_id: "H", depth: "D" };

test("the rows each bin leaves, from the holes' depth spans", () => {
  const rows = logOf(3, 10); // 0 .. 10 m: 0.5 m -> bins 0..20 = 21 a hole
  const e = logBinEstimate(rows, m);
  assert.equal(e.readings, 3 * 101); assert.equal(e.holes, 3);
  assert.deepEqual(e.bins.map((b) => [b.binM, b.rows]), [[0.5, 63], [1, 33], [2, 18], [5, 9]]);
  // the estimate is what the binning gives on a log with no gaps
  for (const b of LOG_BINS) assert.equal(logChannelRows(rows, m, "G", b).rows.length, e.bins.find((x) => x.binM === b).rows);
  // read once per table and mapping (the dialog re-renders, then the commit asks again)
  assert.equal(logBinEstimate(rows, { ...m }), e, "same table, same mapping: the kept estimate");
  assert.notEqual(logBinEstimate(rows, { hole_id: "H", from: "D", to: "D" }), e, "another mapping: read again");
});

test("the WA iron shape: 6,292 holes of about 52 m in 3 channels -> the smallest bin that fits", () => {
  // the estimate's shape, not 2.58 M rows: per bin size, holes x (52 / b + 1)
  const est = { bins: LOG_BINS.map((b) => ({ binM: b, rows: 6292 * (Math.floor(52 / b) + 1) })) };
  assert.ok(est.bins[0].rows * 3 > LOG_RAW_BUDGET && est.bins[2].rows * 3 > LOG_RAW_BUDGET);
  assert.equal(fittingLogBin(est, 3), 5); // 6,292 x 11 x 3 = 207,636: just over; the coarsest is kept
  assert.equal(fittingLogBin(est, 1), 2); // 6,292 x 27 = 169,884
  assert.equal(defaultLogBin(2_584_475, 3, est), 5);
  assert.equal(defaultLogBin(2_584_475, 3), 0.5, "no estimate: as before");
  assert.equal(defaultLogBin(50_000, 3, est), null, "under the budget: every reading");
  assert.equal(effectiveLogBin({ logBinM: 1 }, 2_584_475, 3, est), 1, "the user's pick stays");
  assert.equal(effectiveLogBin({}, 2_584_475, 1, est), 2);
});

test("binning gives the same rows as before (per hole, by bin, mean / min / max / n)", () => {
  const rows = [
    { H: "B", D: "0.2", G: "10" }, { H: "A", D: "1.4", G: "4" }, { H: "A", D: "0.1", G: "2" }, { H: "A", D: "0.3", G: "6" },
    { H: "A", D: "x", G: "1" }, { H: "B", D: "0.4", G: "-999" }, { H: "B", D: "0.9", G: "" },
  ];
  const out = logChannelRows(rows, m, "G", 1, new Set([-999]));
  assert.deepEqual(out.rows, [
    { hole_id: "A", from: 0, to: 1, value: 4, min: 2, max: 6, n: 2 },
    { hole_id: "A", from: 1, to: 2, value: 4, min: 4, max: 4, n: 1 },
    { hole_id: "B", from: 0, to: 1, value: 10, min: 10, max: 10, n: 1 },
  ]);
  assert.equal(out.skipped, 2); assert.equal(out.dropped, 1); assert.equal(out.readings, 4); assert.equal(out.binned, true);
  const raw = logChannelRows(rows, m, "G", null);
  assert.equal(raw.binned, false); assert.equal(raw.rows.length, 5);
});

test("the menu shows each bin's rows and memory; the commit picks the same bin as the dialog", () => {
  const box = readFileSync(new URL("../src/components/LogChannelsBox.jsx", import.meta.url), "utf8");
  assert.match(box, /const est = useMemo\(\(\) => \(shown \? logBinEstimate\(rows, modal\.mapping\) : null\), \[shown, rows, modal\.mapping\]\);/);
  assert.match(box, /effectiveLogBin\(modal, rows\.length, ticked\.length, est\)/);
  assert.match(box, /LOG_BINS\.map\(\(b\) =>/);
  const u = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(u, /defaultLogBin\(allRows\.length, chans\.length, needsBinning\(allRows\.length, chans\.length\) \? logBinEstimate\(allRows, mapping\) : null\)/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["{b} m bins: about {n} rows per channel, {mb} MB in all", "Every reading (no bins): {n} rows per channel, about {mb} MB in all"]) assert.ok(d[k], `${l}: ${k}`);
  }
});
