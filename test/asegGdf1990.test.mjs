// TASKS.csv #1990 — ASEG-GDF2 (.dfn + .dat): definitions, fixed-width and free-format records, arrays, NULLs, streaming, the file pair
import test from "node:test";
import assert from "node:assert/strict";
import { parseDfn, parseGdfLine, parseGdfText, streamGdfRows, gdfPair } from "../src/lib/asegGdf.js";

const DFN = [
  "DEFN   ST=RECD,RT=COMM;RT:A4;COMMENTS:A76",
  "DEFN 1 ST=RECD,RT=;LINE:I8:NULL=-99999,NAME=Line number",
  "DEFN 2 ST=RECD,RT=;FID:F10.1:UNIT=s",
  "DEFN 3 ST=RECD,RT=;EASTING:F12.2:UNIT=m,NULL=-99999.99",
  "DEFN 4 ST=RECD,RT=;NORTHING:F12.2:UNIT=m",
  "DEFN 5 ST=RECD,RT=;MAG:F10.2:UNIT=nT,NULL=-99999",
  "DEFN 6 ST=RECD,RT=;EM:3F8.3",
  "DEFN 7 ST=RECD,RT=;END DEFN",
].join("\r\n");
const pad = (v, w) => String(v).padStart(w);
const rec = (line, fid, e, n, mag, em) => pad(line, 8) + pad(fid.toFixed(1), 10) + pad(e.toFixed(2), 12) + pad(n.toFixed(2), 12) + pad(mag.toFixed(2), 10) + em.map((x) => pad(x.toFixed(3), 8)).join("");

test("the data record's fields, widths, arrays and NULLs come from the .dfn", () => {
  const L = parseDfn(DFN);
  assert.deepEqual(L.columns, ["LINE", "FID", "EASTING", "NORTHING", "MAG", "EM[1]", "EM[2]", "EM[3]"]);
  assert.equal(L.width, 8 + 10 + 12 + 12 + 10 + 24);
  assert.equal(L.fields.find((f) => f.name === "MAG").unit, "nT");
  assert.equal(L.fields.find((f) => f.name === "LINE").nullValue, -99999);
});

test("fixed-width and free-format records, NULLs and comment lines", () => {
  const L = parseDfn(DFN);
  const a = parseGdfLine(rec(1010, 12.5, 611000.25, 5790000.5, 56012.4, [0.1, 0.2, 0.3]), L);
  assert.deepEqual(a, { LINE: 1010, FID: 12.5, EASTING: 611000.25, NORTHING: 5790000.5, MAG: 56012.4, "EM[1]": 0.1, "EM[2]": 0.2, "EM[3]": 0.3 });
  const nul = parseGdfLine(rec(1010, 13, 611001, 5790001, -99999, [0, 0, 0]), L);
  assert.equal(nul.MAG, null);
  const free = parseGdfLine("1020 14.0 611002.00 5790002.00 56010.00 0.4 0.5 0.6", L);
  assert.equal(free.LINE, 1020); assert.equal(free["EM[3]"], 0.6);
  assert.equal(parseGdfLine("COMM a comment", L), null);
  assert.equal(parseGdfLine("1 2 3", L), null, "a short free-format line with the wrong count is not a record");
  assert.deepEqual(parseGdfLine(rec(1010, 12.5, 611000.25, 5790000.5, 56012.4, [0.1, 0.2, 0.3]), L, ["EASTING", "MAG"]), { EASTING: 611000.25, MAG: 56012.4 });
});

test("a whole .dat, thinned, and the same through the stream", async () => {
  const L = parseDfn(DFN);
  const lines = Array.from({ length: 1000 }, (_, i) => rec(1000 + Math.floor(i / 100), i, 611000 + i, 5790000, 56000 + (i % 7), [i, i, i]));
  const dat = lines.join("\r\n") + "\r\n";
  const whole = parseGdfText(dat, L, { every: 10 });
  assert.equal(whole.seen, 1000); assert.equal(whole.rows.length, 100);
  const s = await streamGdfRows(new Blob([dat]), { layout: L, every: 10, chunkBytes: 4096 });
  assert.equal(s.seen, 1000); assert.deepEqual(s.rows, whole.rows, "pieces cut mid-line give the same records");
});

test("a data record that starts with its record type ('RT:A4')", () => {
  const L = parseDfn("DEFN 1 ST=RECD,RT=;RT:A4;X:F10.1;Y:F10.1\nDEFN 2 ST=RECD,RT=;END DEFN");
  assert.equal(L.rtPrefix, 4);
  assert.deepEqual(parseGdfLine("DATA" + pad("5.0", 10) + pad("6.0", 10), L), { X: 5, Y: 6 });
});

test("the .dfn and .dat of one survey are paired by name", () => {
  const f = (name) => ({ name });
  assert.deepEqual(gdfPair([f("a.dfn"), f("b.dat"), f("a.dat")]).dat.name, "a.dat");
  assert.equal(gdfPair([f("a.dfn")]), null);
  assert.equal(gdfPair([f("x.dfn"), f("y.dat")]).dat.name, "y.dat");
});
