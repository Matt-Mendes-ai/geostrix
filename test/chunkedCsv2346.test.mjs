// TASKS.csv #2346 — a CSV over 512 MB read in parts: the same rows as the one-piece reader, whatever the cut points
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTableText, parseTableChunks } from "../src/lib/tabular.js";

// the bytes in pieces of `size` (a piece boundary may fall inside a line, a quoted cell or a UTF-8 character)
function* pieces(bytes, size) { for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, Math.min(bytes.length, i + size)); }
const enc = (s) => new TextEncoder().encode(s);
const plain = (rows) => rows.map((r) => ({ ...r }));

const CSV = [
  "# exported by GeoStrix",
  "HoleID,From,To,Au_ppm,Lith,Note",
  'DDH-001,0,1.5,0.12,BAS,"a note, with a comma"',
  'DDH-001,1.5,3,0.4,AND,"line one',
  'line two"',
  "0045,0,2,1.1,BAS,ok",
  "DDH-002,0,2,,BAS,blank grade",
  'DDH-002,2,4,3.75,ANDÉ,"quote ""in"" it"',
  "#short note",
  "DDH-003,0,1,2e-3,BAS,x",
].join("\r\n") + "\r\n";

test("every cut size gives the one-piece rows, headers and typing (ids kept as text, a multi-line quoted cell, é across a cut)", async () => {
  const one = parseTableText(CSV);
  for (const size of [1, 2, 3, 7, 16, 64, 1 << 20]) {
    const out = await parseTableChunks(pieces(enc(CSV), size));
    assert.deepEqual(out.headers, one.headers, `size ${size}`);
    assert.deepEqual(plain(out.rows), plain(one.rows), `size ${size}`);
    assert.equal(out.encoding, "utf-8");
  }
  assert.equal(one.rows.length, 6);
  assert.equal(one.rows[2].HoleID, "0045"); // the id column kept as text
});

test("a file of many parts (past the 256 kB first part): quoted line breaks, é and CRLF across the cuts", async () => {
  const lines = ["HoleID,From,To,Au_ppm,Lith,Note"];
  for (let i = 0; i < 40000; i++) lines.push(`H${String(i % 97).padStart(4, "0")},${i},${i + 1},${(i % 13) / 10},${i % 3 ? "BAS" : "ANDÉ"},${i % 50 ? "n" + i : `"two\r\nlines, ${i} ""q"""`}`);
  const text = lines.join("\r\n") + "\r\n";
  const one = parseTableText(text);
  for (const size of [7777, 65536]) {
    const out = await parseTableChunks(pieces(enc(text), size));
    assert.ok(out.parts > 2, `parts ${out.parts}`);
    assert.equal(out.rows.length, 40000);
    assert.deepEqual(plain(out.rows), plain(one.rows), `size ${size}`);
  }
});

test("the kept columns, the holes subset and the composite behave as in parseTableText", async () => {
  const opts = { keep: ["HoleID", "Au_ppm"], holes: { col: "HoleID", ids: ["DDH-001", "DDH-002"] } };
  const one = parseTableText(CSV, opts), parts = await parseTableChunks(pieces(enc(CSV), 5), opts);
  assert.deepEqual(plain(parts.rows), plain(one.rows));
  assert.equal(parts.droppedByHole, one.droppedByHole);
  const c = { keep: ["HoleID", "Au_ppm"], composite: { hole: "HoleID", from: "From", to: "To", lengthM: 2 } };
  const c1 = parseTableText(CSV, c), c2 = await parseTableChunks(pieces(enc(CSV), 9), c);
  assert.deepEqual(plain(c2.rows), plain(c1.rows));
  assert.deepEqual(c2.composited, c1.composited);
});

test("Windows-1252, decided on the first part, said; a preamble and a space-separated table", async () => {
  const w = Uint8Array.from([...enc("Hole,Lith\nA,"), 0xc9, ...enc("p\nB,x\n")]); // É in Windows-1252
  const out = await parseTableChunks(pieces(w, 4));
  assert.equal(out.encoding, "windows-1252");
  assert.equal(out.rows[0].Lith, "Ép");
  assert.match(out.note, /were not UTF-8, so the whole file was read as Windows-1252/);
  const pre = "Client: X\nDatum: GDA94\nLine,Station,Easting,Northing\n1,100,400000,6250000\n1,125,400025,6250000\n1,150,400050,6250000\n";
  assert.deepEqual(plain((await parseTableChunks(pieces(enc(pre), 6))).rows), plain(parseTableText(pre).rows));
  const sp = "LINE STN GRID_X GRID_Y\n1 100 400000 6250000\n1 125 400025 6250000\n1 150 400050 6250000\n";
  const s2 = await parseTableChunks(pieces(enc(sp), 5));
  assert.deepEqual(plain(s2.rows), plain(parseTableText(sp).rows));
  assert.match(s2.note, /space-separated/);
});

test("comma decimals are found in any part (#600)", async () => {
  const t = "a;b\n" + Array.from({ length: 50 }, (_, i) => `${i};"1,${i}"`).join("\n") + "\n";
  assert.deepEqual(plain((await parseTableChunks(pieces(enc(t), 13))).rows), plain(parseTableText(t).rows));
});

test("a file over 512 MB goes to the worker in parts, with the file itself, after the chooser", () => {
  const t = readFileSync(new URL("../src/lib/tabular.js", import.meta.url), "utf8");
  assert.match(t, /if \(inParts\) \{ \/\/ #2346/);
  assert.match(t, /worker\.postMessage\(\{ file, opts: \{ \.\.\.opts, chunked: true \} \}\);/);
  const w = readFileSync(new URL("../src/lib/tabular.worker.js", import.meta.url), "utf8");
  assert.match(w, /if \(file && opts\.chunked\) \{\s*parseTableChunks\(fileChunks\(file\), opts\)/);
});
