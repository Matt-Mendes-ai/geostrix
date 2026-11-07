// TASKS.csv #1671 (review #1646, Kodiak) — import work off the UI thread: a workbook's unzip and sheet XML (lib/xlsx.worker.js; 1.7 s
// for Kodiak's 1.6 MB soil workbook), and a block-model CSV's Import (lib/blockModelCsv.worker.js; 2.05 s for its 380,250-row model).
// Both fall back to the same code on the UI thread.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importBlockModelAttrs, blockModelCellsFromRows, coarsenBlockCells, guessBlockModelMapping } from "../src/lib/blockModelCsv.js";
import { wantsLogMean } from "../src/lib/voxel.js";
import { guessVoxelProperty } from "../src/lib/voxelProperty.js";
import { xlsxToCsvFiles, xlsxToCsvFilesAsync } from "../src/lib/xlsx.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("importBlockModelAttrs gives what the inline Import gave", () => {
  const rows = [];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) for (let k = 0; k < 5; k++) rows.push({ x: 500000 + 25 * i, y: 6000000 + 25 * j, z: 1000 - 25 * k, res: 10 ** (1 + ((i + j + k) % 4)), chg: (i * j) % 7 }); // numbers, as the CSV parser gives them
  const headers = ["x", "y", "z", "res", "chg"];
  const { mapping } = guessBlockModelMapping(headers, rows);
  const out = importBlockModelAttrs(rows, "MPD_res", mapping, ["res", "chg", "nope"], 500);
  for (const attr of ["res", "chg"]) {
    const { cells: raw } = blockModelCellsFromRows(rows, mapping, attr);
    const guessed = guessVoxelProperty("MPD_res", attr), logMean = wantsLogMean(raw.map((c) => c.value), guessed);
    const ref = coarsenBlockCells(raw, 500, { log: logMean });
    const got = out.find((o) => o.attr === attr);
    assert.equal(got.raw, raw.length); assert.equal(got.logMean, logMean); assert.equal(got.guessed, guessed);
    assert.deepEqual(got.factors, ref.factors); assert.equal(got.cells.length, ref.cells.length);
    assert.deepEqual(got.cells[0], ref.cells[0]);
  }
  assert.ok(out.find((o) => o.attr === "res").factors, "2,000 blocks over a 500 budget: merged");
  assert.equal(out.find((o) => o.attr === "nope").empty, true);
});

test("a workbook without a worker reads the same as before", async () => {
  // no Worker in Node: xlsxToCsvFilesAsync is xlsxToCsvFiles
  assert.equal(typeof Worker, "undefined");
  const bad = new Uint8Array([1, 2, 3]);
  await assert.rejects(xlsxToCsvFilesAsync(bad, "x.xlsx"));
  await assert.rejects(xlsxToCsvFiles(bad, "x.xlsx"));
});

test("wired: the workers and their fallbacks", () => {
  const g = read("src/modules/GeophysicsModule.jsx");
  assert.ok(g.includes('new Worker(new URL("../lib/blockModelCsv.worker.js", import.meta.url), { type: "module" })') && g.includes("return out || here();"));
  assert.ok(g.includes("setBmPending({ file, fileName: file.name"));
  assert.ok(read("src/lib/blockModelCsv.worker.js").includes("importBlockModelAttrs(parseTableText(text).rows, base, mapping, attrs, maxCells)"));
  const x = read("src/lib/xlsx.js");
  assert.ok(x.includes('new Worker(new URL("./xlsx.worker.js", import.meta.url)') && x.includes("return viaWorker || xlsxToCsvFiles(bytes, workbookName);"));
  assert.ok(x.includes("await xlsxToCsvFilesAsync(new Uint8Array(await file.arrayBuffer()), file.name)"));
  assert.ok(read("src/lib/viewer/importHelpers.js").includes("xlsxToCsvFilesAsync(new Uint8Array(buf), file.name)"));
  assert.ok(read("src/modules/viewer/useImportPipeline.js").includes("await xlsxToCsvFilesAsync(new Uint8Array(await f.arrayBuffer()), f.name)"));
});
