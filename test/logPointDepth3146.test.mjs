// TASKS.csv #3146 (follow-up of #3038) — logOnRead3038 runs a From / To log end to end; the point-depth mapping (one depth per reading) of
// makeLogReader, logReadSpec and logTableFits had no end-to-end test. A SYNTHETIC point-depth log with blank holes, blank values, 'n/a' and -999,
// read into the typed table while parsed, gives the same answers as its rows.
import test from "node:test";
import assert from "node:assert/strict";
import { parseTableText } from "../src/lib/tabular.js";
import { makeLogReader, logTableFits, logReadSpec } from "../src/lib/logOnRead.js";
import { channelNoData, logBinEstimate, logChannelRows, logReadings, isLogTable } from "../src/lib/downholeLogChannels.js";

function csv() {
  const lines = ["Hole_id,Depth,Gamma_cps,Density_gcc"];
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let h = 0; h < 10; h++) for (let k = 0; k < 500; k++) {
    const d = (k * 0.05 + h * 0.01).toFixed(2);
    let gam = (40 + 60 * rnd()).toFixed(1), den = (2.2 + 0.8 * rnd()).toFixed(3);
    if (k % 89 === 4) gam = "-999";
    if (k % 61 === 9) den = "n/a";
    if (k % 47 === 2) gam = "";
    const hole = (h === 3 && k % 120 === 7) ? "" : `PD${h}`; // a few rows with no hole
    lines.push(`${hole},${h === 6 && k === 250 ? "" : d},${gam},${den}`); // and one with no depth
  }
  return lines.join("\n");
}
const mapping = { hole_id: "Hole_id", depth: "Depth" };
const chans = ["Gamma_cps", "Density_gcc"];

test("the spec for a point-depth log, and the table that stands for it", () => {
  const { rows, headers } = parseTableText(csv().split("\n").slice(0, 400).join("\n"), {});
  const spec = logReadSpec(headers, rows, mapping);
  assert.deepEqual(spec, { hole: "Hole_id", depth: "Depth", channels: chans, sampleN: 5000 });
  const table = { mapping: { hole_id: "Hole_id", depth: "Depth" }, channels: { Gamma_cps: 1, Density_gcc: 1 } };
  assert.equal(logTableFits(table, mapping, chans), true);
  assert.equal(logTableFits(table, { hole_id: "Hole_id", from: "Depth", to: "Depth" }, chans), false, "read as points, not intervals");
  assert.equal(logTableFits(table, { ...mapping, depth: "Other" }, chans), false);
});

test("read into the typed table while parsed: the same no-data codes, bin estimate, binned and raw rows as the rows", () => {
  const text = csv();
  const full = parseTableText(text, {});
  const spec = logReadSpec(full.headers, full.rows.slice(0, 400), mapping);
  const out = parseTableText(text, { logRead: spec });
  const table = out.logTable;
  assert.ok(isLogTable(table) && !isLogTable(full.rows));
  assert.equal(logReadings(table), full.rows.length);
  assert.deepEqual(logBinEstimate(table, mapping), logBinEstimate(full.rows, mapping));
  for (const c of chans) {
    const a = channelNoData(full.rows, c, ""), b = channelNoData(table, c, "");
    assert.deepEqual(b && { n: b.n, codes: b.codes }, a && { n: a.n, codes: a.codes }, `${c} no-data`);
    for (const bin of [null, 0.25, 1]) assert.deepEqual(logChannelRows(table, mapping, c, bin, b?.values || null), logChannelRows(full.rows, mapping, c, bin, a?.values || null), `${c} at ${bin}`);
  }
  const g = channelNoData(table, "Gamma_cps", "");
  assert.ok(g && g.values.has(-999), "-999 is a no-data code from the table too");
  // the reader by hand, as the worker uses it
  const rd = makeLogReader({ ...spec, sampleN: 20 });
  for (const r of full.rows) rd.add(r);
  const { sample, table: t2 } = rd.finish();
  assert.equal(sample.length, 20);
  assert.deepEqual(logChannelRows(t2, mapping, "Density_gcc", 0.5).rows, logChannelRows(full.rows, mapping, "Density_gcc", 0.5).rows);
});
