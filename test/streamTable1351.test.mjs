// TASKS.csv #1351 — a survey CSV too big to read whole, streamed: header and sample first, then every n-th row, picked columns only
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { splitLine, sniffTable, estimateRows, streamTableRows } from "../src/lib/streamTable.js";
import { suggestKeepEvery } from "../src/lib/xyzBatch.js";

const HEAD = "Line,X_WGS84,Y_WGS84,DATE,Galt,TMI,RMI\n";
const rowsText = (n) => Array.from({ length: n }, (_, i) => `L${10 + Math.floor(i / 100)},${616000 + i * 1.5},${5985000 + i},2024/07/06,${1100 + (i % 7)},${54690 + (i % 50) / 10},${-100 - (i % 9)}`).join("\n") + "\n";

test("splitLine and sniffTable: delimiter, comment lines before the header, a sample, the data offset", () => {
  assert.deepEqual(splitLine('a,"b, c",d', ","), ["a", "b, c", "d"]);
  assert.deepEqual(splitLine('"say ""hi""",2', ","), ['say "hi"', "2"]);
  const text = "/ CSV EXPORT\n/ DATABASE [x.gdb]\n" + HEAD + rowsText(5) + "L10,6162";
  const s = sniffTable(text);
  assert.deepEqual(s.headers, ["Line", "X_WGS84", "Y_WGS84", "DATE", "Galt", "TMI", "RMI"]);
  assert.equal(s.delimiter, ","); assert.equal(s.headerLine, 2); assert.equal(s.sample.length, 5); // the cut last line left out
  assert.deepEqual(s.sample[1], { Line: "L10", X_WGS84: "616001.5", Y_WGS84: "5985001", DATE: "2024/07/06", Galt: "1101", TMI: "54690.1", RMI: "-101" });
  assert.equal(text.slice(s.dataStart, s.dataStart + 4), "L10,");
  assert.equal(sniffTable("x;y;z\n1;2;3\n").delimiter, ";");
  assert.equal(sniffTable("only one column\n1\n"), null);
});

test("estimate and the suggested thinning", () => {
  const s = { dataStart: 1000, avgRowChars: 500 };
  assert.equal(estimateRows(1_311_000_000 + 1000, s), 2_622_000);
  assert.equal(suggestKeepEvery(2_622_000), 50); // the batch import's own rule: about 100,000 points per import
  assert.equal(suggestKeepEvery(90_000), 1);
  assert.equal(suggestKeepEvery(1_500_000), 20);
});

test("streaming: every n-th data row, only the kept columns, across chunk boundaries, CRLF and comments, with progress", async () => {
  const text = "/ export\n" + HEAD.replace(/\n/, "\r\n") + rowsText(1000).replace(/\n/g, "\r\n") + "/ end of line 19\n";
  const blob = new Blob([text]);
  const s = sniffTable(text.slice(0, 300));
  const prog = [];
  const out = await streamTableRows(blob, { delimiter: s.delimiter, headers: s.headers, keep: ["X_WGS84", "Y_WGS84", "TMI", "Line"], every: 10, skipLines: s.headerLine + 1, chunkBytes: 1000, onProgress: (f) => prog.push(f) });
  assert.equal(out.seen, 1000); assert.equal(out.kept, 100);
  assert.deepEqual(out.rows[0], { X_WGS84: 616000, Y_WGS84: 5985000, TMI: 54690, Line: "L10" }); // numbers as numbers, text copied
  assert.deepEqual(out.rows[1], { X_WGS84: 616015, Y_WGS84: 5985010, TMI: 54691, Line: "L10" });
  assert.deepEqual(Object.keys(out.rows[99]), ["X_WGS84", "Y_WGS84", "TMI", "Line"]); // header order, not the order asked
  assert.equal(out.rows[99].X_WGS84, 616000 + 990 * 1.5);
  assert.ok(prog.length > 10 && prog[prog.length - 1] === 1);
  const all = await streamTableRows(new Blob([HEAD + rowsText(7)]), { delimiter: ",", headers: s.headers, keep: ["RMI"], every: 1, skipLines: 1, chunkBytes: 37 });
  assert.deepEqual(all.rows.map((r) => r.RMI), [-100, -101, -102, -103, -104, -105, -106]); // the last column, no trailing newline issue
  const ac = new AbortController(); ac.abort();
  await assert.rejects(streamTableRows(blob, { delimiter: ",", headers: s.headers, signal: ac.signal }), /Abort/);
});

test("the point-survey import streams a big CSV instead of refusing it", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /if \(file\.size > STREAM_FROM_BYTES\) \{ await openStreamedCsv\(file, head\); return; \}/);
  assert.match(g, /streamTableRows\(st\.file, \{ delimiter: st\.delimiter, headers: st\.headers, keep, every: st\.keepEvery, skipLines: st\.skipLines/);
  assert.match(g, /confirmImportXYZ\(rows, st\.keepEvery > 1 \?/);
  assert.match(g, /if \(xyzPending\.stream && !Array\.isArray\(streamedRows\)\) \{ confirmStreamed\(\); return; \}/);
  assert.ok(!g.includes("if (false)"));
});

test("the column guess on Poplar's 38 columns: no fluxgate step as the elevation", async () => {
  const { guessGeophysColumns } = await import("../src/lib/geophysColumns.js");
  const h = "Line,X_WGS84,Y_WGS84,Lat_deg,Lon_deg,DATE,FLT,LineNo,Stl,GPSFix,Heading,GPStime,Geos_m,XTE_m,Galt,Lalt,DTM,Sample_Density,Speed_km_hr,Basemag,IGRF,Declin,Inclin,XFg_Step,YFg_Step,ZFg_Step,Mag1_head,Mag2_head,Mag3_head,TMI,RMI,ILG,XLG,HG,CVG,AS,TMIge,RMIge".split(",");
  const g = guessGeophysColumns(h);
  assert.deepEqual([g.x, g.y, g.value, g.line], ["X_WGS84", "Y_WGS84", "TMI", "Line"]);
  assert.equal(g.z, ""); // not the fluxgate step; and, as #484 decided, no altitude column (Galt may be an ellipsoid height - Geos_m is the
  // geoid separation, -12 m here - and Lalt is the laser height above ground): the user picks the elevation
  assert.equal(guessGeophysColumns(["X", "Y", "Z", "TMI"]).z, "Z");
  assert.equal(guessGeophysColumns(["Easting", "Northing", "Elevation_Z", "Mag"]).z, "Elevation_Z");
});

test("a Geosoft .xyz streamed by parseXYZ's rules: the same rows as parseXYZ, every n-th, the picked columns and the line", async () => {
  const { streamXyzRows, headText } = await import("../src/lib/streamTable.js");
  const { parseXYZ } = await import("../src/lib/geosoft.js");
  const head = "/ ----\n/ XYZ EXPORT [09/29/2006]\n/\n/        Line     Flight         utctime          x             y       ralt       galtf     MagP\n/============ ========== =============== ========== ============= ========== =========== ==========\n//Flight 2\n";
  let body = "";
  for (const line of ["10010", "10020"]) { body += `Line  ${line}\n`; for (let i = 0; i < 30; i++) body += `       ${line}          2     16:51:${String(10 + i).padStart(2, "0")}.20  ${343024 - i}.35    6211083.70      ${70 + i / 10}       1357.9   ${i === 3 ? "*" : (57028.2 + i).toFixed(1)}\n`; }
  const text = head + body;
  const ref = parseXYZ(text);
  const all = await streamXyzRows(new Blob([text]), { columns: ref.columns, chunkBytes: 97 });
  assert.equal(all.seen, 60);
  assert.deepEqual(all.rows, ref.rows); // identical to the whole-file parser, across 97-byte chunks
  const thin = await streamXyzRows(new Blob([text]), { columns: ref.columns, keep: ["x", "y", "MagP"], every: 7, chunkBytes: 200 });
  assert.equal(thin.kept, 9);
  assert.deepEqual(thin.rows[0], { _line: "10010", x: 343024.35, y: 6211083.7, MagP: 57028.2 });
  assert.deepEqual(thin.rows[5], { _line: "10020", x: 343019.35, y: 6211083.7, MagP: 57033.2 }); // row 35 = line 10020, i = 5
  const h = await headText(new Blob([text]), 300);
  assert.ok(h.endsWith("\n") && h.length <= 300);
});

test("the XYZ channel guess skips the base-station magnetometer", async () => {
  const { guessXyzChannels } = await import("../src/lib/geosoft.js");
  const cols = ["Line", "Flight", "utctime", "x", "y", "ralt", "galtf", "bheight", "dtm", "basemagf", "MagN", "MagU", "MagP", "MagS"];
  const rows = Array.from({ length: 20 }, (_, i) => Object.fromEntries(cols.map((c, j) => [c, 1000 + i * (j + 1)])));
  const g = guessXyzChannels(cols, rows);
  assert.notEqual(g.value, "basemagf");
  assert.equal(g.value, "MagN");
  assert.equal(guessXyzChannels(["x", "y", "base_mag", "tmi"], rows.map((r) => ({ x: r.x, y: r.y, base_mag: r.MagN, tmi: r.MagP }))).value, "tmi");
});
