// TASKS.csv #4056 — the GSQ sample builds' shared helpers (scripts/samples/gsqUnpack.mjs): the unpacker writes no entry outside its folder, and a
// "name=key" header writes a row's key under another column name (survey.csv's azimuth_grid, which the import must read before the magnetic azimuth).
// Synthetic paths and rows only; the samples themselves are checked by their build scripts and in the app.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { safeTarget, writeCsv } from "../scripts/samples/gsqUnpack.mjs";
import { detectAzimuthRef } from "../src/lib/azimuthRef.js";

test("safeTarget keeps every entry inside the folder", () => {
  const dir = path.resolve(os.tmpdir(), "gsq-test");
  assert.equal(safeTarget(dir, "cr000001/table_1.txt"), path.join(dir, "cr000001", "table_1.txt"));
  assert.equal(safeTarget(dir, "a\\b.txt"), path.join(dir, "a", "b.txt")); // a backslash is a folder separator
  for (const bad of ["../x.txt", "a/../../x.txt", "/etc/x", "C:/x.txt", "c:x.txt", "a//b.txt", "folder/", "", null]) assert.equal(safeTarget(dir, bad), null, String(bad));
});

test("writeCsv: name=key writes the key's values under the name", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "gsq-csv-"));
  try {
    const f = path.join(dir, "survey.csv");
    writeCsv(f, ["hole_id", "depth", "azimuth_grid=azimuth", "dip", "azimuth_magnetic"], [{ hole_id: "DH-23-001", depth: 0, azimuth: 96.2, dip: -60, azimuth_magnetic: 90 }]);
    const [head, row] = readFileSync(f, "utf8").trim().split("\n");
    assert.equal(head, "hole_id,depth,azimuth_grid,dip,azimuth_magnetic");
    assert.equal(row, "DH-23-001,0,96.2,-60,90");
    // the reason: beside a magnetic one, a plain "azimuth" is taken as the raw reading, a named grid one is read first
    const rows = [{ hole_id: "DH-23-001", depth: "0", azimuth_grid: "96.2", azimuth_magnetic: "90", dip: "-60" }];
    assert.equal(detectAzimuthRef(head.split(","), rows)?.ref, "grid");
    assert.equal(detectAzimuthRef(["hole_id", "depth", "azimuth", "dip", "azimuth_magnetic"], [{ ...rows[0], azimuth: "96.2" }])?.ref, "magnetic");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
