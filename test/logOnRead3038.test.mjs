// TASKS.csv #3038 (from #2885, review #2876 WA iron) — a big downhole log read into typed columns in the parse worker, so its readings never
// exist as row objects: the log functions take the table wherever they take the rows, with the same answers (no-data codes, the bin menu's
// estimate, binned and raw rows); a drop of a big log is sniffed from its first megabyte; anything other than the log it was read as reads
// the file again.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTableText } from "../src/lib/tabular.js";
import { makeLogReader, logTableFits, logReadSpec } from "../src/lib/logOnRead.js";
import { channelNoData, logBinEstimate, logChannelRows, logReadings, isLogTable } from "../src/lib/downholeLogChannels.js";

// a log with the awkward cases: comma decimals, blanks, a -999 code, a saturated run at the extreme, a row with no hole, one with no depth
function csv() {
  const lines = ["Hole_id,Depth From,Depth To,Density_Best,Gamma_Best,Suscep_Best"];
  let seed = 9; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let h = 0; h < 12; h++) for (let k = 0; k < 400; k++) {
    const d = (k * 0.1 + h * 0.03).toFixed(2);
    let dens = (2 + rnd()).toFixed(3), gam = (40 + 30 * rnd()).toFixed(1), sus = String(Math.round(100 + 400 * rnd()));
    if (k % 97 === 3) dens = "-999";
    if (h === 4 && k >= 100 && k < 112) sus = "-821754.9"; // a saturated tool: 12 readings in a row
    if (k % 53 === 7) gam = "";
    if (k % 71 === 5) dens = `"${dens.replace(".", ",")}"`; // a comma decimal
    lines.push(`${k === 17 && h === 2 ? "" : `H${h}`},${k === 19 && h === 3 ? "" : d},${k === 19 && h === 3 ? "" : d},${dens},${gam},${sus}`);
  }
  return lines.join("\n");
}
const mapping = { hole_id: "Hole_id", from: "Depth From", to: "Depth To" };
const chans = ["Density_Best", "Gamma_Best", "Suscep_Best"];

test("the typed table gives the rows' answers: no-data codes, the bin estimate, binned and raw rows", () => {
  const text = csv();
  const { rows } = parseTableText(text, {});
  const rd = makeLogReader({ hole: "Hole_id", from: "Depth From", to: "Depth To", channels: chans, sampleN: 50 });
  for (const r of rows) rd.add(r);
  const { sample, table } = rd.finish();
  assert.equal(sample.length, 50);
  assert.ok(isLogTable(table) && !isLogTable(rows));
  assert.equal(logReadings(table), rows.length);
  assert.deepEqual(logBinEstimate(table, mapping), logBinEstimate(rows, mapping));
  for (const c of chans) {
    const a = channelNoData(rows, c, ""), b = channelNoData(table, c, "");
    assert.deepEqual(b && { n: b.n, codes: b.codes }, a && { n: a.n, codes: a.codes }, `${c} no-data`);
    for (const bin of [null, 0.5, 2]) assert.deepEqual(logChannelRows(table, mapping, c, bin, b?.values || null), logChannelRows(rows, mapping, c, bin, a?.values || null), `${c} at ${bin}`);
  }
  const sus = channelNoData(table, "Suscep_Best", "");
  assert.ok(sus && sus.values.has(-821754.9), "the saturated run is a code from the table too (#3042)");
});

test("read while the text is parsed: the rows handed back are the first ones, the table holds every reading", () => {
  const text = csv();
  const out = parseTableText(text, { logRead: { hole: "Hole_id", from: "Depth From", to: "Depth To", channels: chans, sampleN: 100 } });
  const full = parseTableText(text, {});
  assert.equal(out.rows.length, 100);
  assert.deepEqual(out.rows.slice(0, 5).map((r) => r.Hole_id), full.rows.slice(0, 5).map((r) => r.Hole_id));
  assert.equal(out.logTable.n, full.rows.length);
  assert.deepEqual(out.headers, full.headers);
  assert.deepEqual(logChannelRows(out.logTable, mapping, "Gamma_Best", 1).rows, logChannelRows(full.rows, mapping, "Gamma_Best", 1).rows);
});

test("the sniff: a log from its first rows and the import's own mapping guess; anything else is not", () => {
  const { rows, headers } = parseTableText(csv().split("\n").slice(0, 300).join("\n"), {});
  const spec = logReadSpec(headers, rows, mapping);
  assert.deepEqual(spec, { hole: "Hole_id", from: "Depth From", to: "Depth To", channels: chans, sampleN: 5000 });
  assert.equal(logReadSpec(["HoleID", "From", "To", "Lith"], [{ HoleID: "A", From: 0, To: 2, Lith: "BAS" }], { hole_id: "HoleID", from: "From", to: "To" }), null, "a lithology table");
  assert.equal(logReadSpec(headers, rows, { from: "Depth From", to: "Depth To" }), null, "no hole column");
  // does a table still stand for the import?
  const table = { mapping: { hole_id: "Hole_id", from: "Depth From", to: "Depth To" }, channels: { Density_Best: 1, Gamma_Best: 1 } };
  assert.equal(logTableFits(table, mapping, ["Density_Best"]), true);
  assert.equal(logTableFits(table, { ...mapping, hole_id: "Other" }, ["Density_Best"]), false);
  assert.equal(logTableFits(table, { hole_id: "Hole_id", depth: "Depth From" }, ["Density_Best"]), false);
  assert.equal(logTableFits(table, mapping, ["Suscep_Best"]), false, "a channel not read");
});

test("wiring: the drop sniffs a big file; the dialog and the commit read the table; anything else reads the file again", () => {
  const h = readFileSync(new URL("../src/lib/viewer/importHelpers.js", import.meta.url), "utf8");
  assert.match(h, /file\.size >= LOG_READ_MIN_BYTES && typeof Worker !== "undefined" \? await sniffLog\(file, m\)/);
  assert.match(h, /return m\.parseTableFile\(file, spec \? \{ logRead: spec \} : undefined\);/);
  const p = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(p, /if \(!\(chans && plain && !rf\?\.col && logTableFits\(modalData\.logTable, modalData\.mapping, chans\)\)\) \{/);
  assert.match(p, /const src = data\.logTable \|\| allRows, readings = logReadings\(src\);/);
  assert.match(p, /const out = logChannelRows\(src, mapping, col, binM, nd\?\.values \|\| null\);/);
  const b = readFileSync(new URL("../src/components/LogChannelsBox.jsx", import.meta.url), "utf8");
  assert.match(b, /const src = modal\.logTable \|\| rows, readings = logReadings\(src\);/);
  const w = readFileSync(new URL("../src/lib/tabular.worker.js", import.meta.url), "utf8");
  assert.match(w, /logTableBuffers\(out\.logTable\)/);
});
