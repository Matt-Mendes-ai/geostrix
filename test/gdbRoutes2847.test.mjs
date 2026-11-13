// TASKS.csv #2847 — a Geosoft .gdb (or any binary file) given to Point survey's Import CSV / .xyz buttons, or to the Maps GeoTIFF input, is named
// for what it is instead of reaching the column picker as a garbage table
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { looksBinary, textTableRefusal } from "../src/lib/unreadableFormats.js";

// the first bytes of a Geosoft database: a binary header with NULs ('!CBD { d ' was the 'column' the picker showed)
const gdbHead = Uint8Array.from([0x21, 0x43, 0x42, 0x44, 0x20, 0x7b, 0x20, 0x64, 0x20, 0x00, 0x00, 0x01, 0x00, 0x08, 0x00, 0x00, 0xff, 0x10]);

test("binary bytes are told from text (UTF-16 text with its byte-order mark is text)", () => {
  assert.equal(looksBinary(gdbHead), true);
  assert.equal(looksBinary(new TextEncoder().encode("X,Y,BOUGUER\n617218.32,5330596.31,-65.53\n")), false);
  assert.equal(looksBinary(Uint8Array.from([0xff, 0xfe, 0x58, 0x00, 0x2c, 0x00, 0x59, 0x00])), false); // UTF-16LE "X,Y"
  assert.equal(looksBinary(new Uint8Array(0)), false);
});

test("textTableRefusal: a .gdb by its name, a binary file under any name, a CSV passes", async () => {
  const gdb = await textTableRefusal(new File([gdbHead], "BlakeRiverGravity.gdb"));
  assert.match(gdb, /^BlakeRiverGravity\.gdb is a Geosoft database \(\.gdb, a closed binary format\) that GeoStrix cannot read: export its channels to CSV or XYZ/);
  const renamed = await textTableRefusal(new File([gdbHead], "stations.xyz"));
  assert.match(renamed, /"stations\.xyz" is a binary file, not a text table/);
  assert.equal(await textTableRefusal(new File(["X,Y,BOUGUER\n1,2,3\n"], "stations.csv")), null);
});

test("wiring: both Point survey imports and the raster input ask first", () => {
  const g = fs.readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const importFile = async \(file\) => \{\s*if \(!file\) return;\s*setError\(null\);\s*\{ const refusal = await textTableRefusal\(file\); if \(refusal\) \{ setError\(refusal\); return; \} \}/);
  assert.match(g, /const importXYZFile = async \(file\) => \{\s*if \(!file\) return;\s*setXyzError\(null\);\s*\{ const refusal = await textTableRefusal\(file\);/);
  assert.match(g, /all\.map\(textTableRefusal\)/);
  const r = fs.readFileSync(new URL("../src/lib/raster.js", import.meta.url), "utf8");
  assert.match(r, /const advice = unreadableFormatAdvice\(file\.name\);[^\n]*\n\s*if \(advice\) throw new Error\(advice\);/);
});
