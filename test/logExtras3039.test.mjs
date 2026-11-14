// TASKS.csv #3039, #3040, #3041 (from #2885 / #2890, review #2876 WA iron) — the downhole log import's three follow-ups:
// #3041 a valid range typed per channel (readings outside it left out and counted); #3039 'the assay intervals' as a bin (each reading
// averaged over the assay sample it falls in); #3040 the table-size gate's figures for tables held as row objects.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { logChannelRows, logRange, rangeText, assayIntervals, intervalOf, assayBinRows, logHoles } from "../src/lib/downholeLogChannels.js";
import { makeLogReader } from "../src/lib/logOnRead.js";
import { estimateTableMemory, confirmTableSize, ROW_CELL_BYTES, ROW_BASE_BYTES, MAX_ROW_RATIO } from "../src/lib/tabular.js";

const mapping = { hole_id: "Hole", depth: "Depth" };
const rows = [];
for (const h of ["A", "B"]) for (let k = 0; k < 40; k++) rows.push({ Hole: h, Depth: k * 0.25, Dens: k === 5 ? 9.9 : k === 6 ? 0.2 : 2 + (k % 4) * 0.1 });

test("#3041 a typed range: readings outside it left out and counted, binned or not", () => {
  assert.deepEqual(logRange({ min: "1", max: "5" }), { min: 1, max: 5 });
  assert.deepEqual(logRange({ min: "", max: "5" }), { min: -Infinity, max: 5 });
  assert.equal(logRange({ min: "", max: "" }), null, "blank: no limit");
  assert.equal(logRange(undefined), null);
  assert.equal(rangeText({ min: 1, max: 5 }), "outside 1 to 5"); assert.equal(rangeText({ min: -Infinity, max: 5 }), "over 5"); assert.equal(rangeText({ min: 1, max: Infinity }), "under 1");
  const raw = logChannelRows(rows, mapping, "Dens", null, null, logRange({ min: "1", max: "5" }));
  assert.equal(raw.outside, 4, "9.9 and 0.2 in each of two holes");
  assert.equal(raw.rows.length, 76);
  const bin = logChannelRows(rows, mapping, "Dens", 1, null, logRange({ max: "5" }));
  assert.equal(bin.outside, 2);
  assert.ok(bin.rows.every((r) => r.max <= 5));
  assert.equal(logChannelRows(rows, mapping, "Dens", null).outside, 0, "no range: nothing left out");
});

test("#3039 the assay intervals as a bin: each reading over the sample it falls in; readings in no sample counted", () => {
  const assays = [{ hole_id: "A", from: 0, to: 2, Au: 1 }, { hole_id: "A", from: 0, to: 2, Cu: 5 } /* the same sample, another element */, { hole_id: "A", from: 2, to: 4 }, { hole_id: "A", from: 6, to: 8 }, { hole_id: "B", from: 1, to: 3 }];
  const iv = assayIntervals(assays);
  assert.deepEqual([...iv.get("A").from], [0, 2, 6]); assert.deepEqual([...iv.get("A").to], [2, 4, 8]);
  assert.equal(assayIntervals(assays), iv, "kept per assays array");
  assert.equal(intervalOf(iv.get("A"), 1.5), 0); assert.equal(intervalOf(iv.get("A"), 2), 1, "a shared boundary: the sample starting there");
  assert.equal(intervalOf(iv.get("A"), 5), -1, "between samples"); assert.equal(intervalOf(iv.get("A"), 8), 2); assert.equal(intervalOf(iv.get("A"), 9), -1);
  assert.equal(assayBinRows(iv, logHoles(rows, mapping)), 4);
  const out = logChannelRows(rows, mapping, "Dens", "assay", null, null, iv);
  assert.deepEqual(out.rows.map((r) => [r.hole_id, r.from, r.to, r.n]), [["A", 0, 2, 8], ["A", 2, 4, 9], ["A", 6, 8, 9], ["B", 1, 3, 9]]);
  assert.equal(out.unsampled, 80 - 35); // a reading at 2 m goes to the sample starting there; at 4 m and 8 m to the one ending there
  const a0 = rows.filter((r) => r.Hole === "A" && r.Depth < 2).map((r) => r.Dens);
  assert.ok(Math.abs(out.rows[0].value - a0.reduce((s, v) => s + v, 0) / a0.length) < 1e-12 && out.rows[0].max === 9.9);
  // the same from a log read into columns (#3038)
  const rd = makeLogReader({ hole: "Hole", depth: "Depth", channels: ["Dens"] }); for (const r of rows) rd.add(r);
  assert.deepEqual(logChannelRows(rd.finish().table, mapping, "Dens", "assay", null, null, iv), out);
  assert.equal(assayIntervals([]), null);
});

test("#3040 row objects: the estimate at the measured rate, and the gate looks at smaller files", async () => {
  const lines = ["H,D,A,B,C"]; for (let i = 0; i < 20000; i++) lines.push(`H${i % 50},${i},1.5,2.5,3.5`);
  const f = new Blob([lines.join("\n")], { type: "text/csv" });
  const cols = await estimateTableMemory(f), objs = await estimateTableMemory(f, { rowObjects: true });
  assert.ok(Math.abs(cols.rows - 20000) < 300 && cols.cols === 5);
  assert.ok(Math.abs(objs.bytes - (objs.rows * 5 * ROW_CELL_BYTES + objs.rows * ROW_BASE_BYTES + f.size * 3)) < 1);
  assert.ok(objs.bytes > cols.bytes * 1.5, `${objs.bytes} against ${cols.bytes}`); // the text's share (x 3) is the same in both
  // the WA iron log's shape: 2.58 M rows x 9 columns, 121 MB -> about 1.1 GB as row objects (measured 1.05 GB), 0.68 GB by the old rate
  const r = 2584475, c = 9, size = 121420975;
  assert.ok(Math.abs((r * c * ROW_CELL_BYTES + r * ROW_BASE_BYTES + size * 3) / 1e9 - 1.1) < 0.05);
  // a file between budget / 16 and budget / 12 is estimated for row objects (here: asked), skipped for columns
  const budget = Math.floor(objs.bytes * 0.9); // over budget / 16 and under the row estimate; the columnar one stays under it
  let asked = 0;
  await confirmTableSize(f, { budget, confirm: () => { asked++; return true; }, choose: null, rowObjects: false });
  assert.equal(asked, 0);
  await confirmTableSize(f, { budget, confirm: () => { asked++; return true; }, choose: null, rowObjects: true });
  assert.equal(asked, 1, "over the budget as row objects");
  assert.equal(MAX_ROW_RATIO, 16);
});

test("wiring and the keys", () => {
  const b = readFileSync(new URL("../src/components/LogChannelsBox.jsx", import.meta.url), "utf8");
  assert.match(b, /aria-label=\{k === "min" \? tr\("Lowest valid reading of \{c\}"/);
  assert.match(b, /<option value="assay">/);
  const p = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(p, /const rg = logRange\(data\.logRanges\?\.\[col\]\);/);
  assert.match(p, /binM === "assay" \? assayIntervals\(storeAssays\) : null/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Lowest valid reading of {c}", "The assay intervals: at most {n} rows per channel (the samples in these holes), {mb} MB in all", "{n} assay-interval bins, in {u}{v}."]) assert.ok(d[k], `${l}: ${k}`);
  }
});
