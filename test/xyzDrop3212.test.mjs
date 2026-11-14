// TASKS.csv #3212 (#3195, Galore Creek) — an .xyz dropped on the 3D View was refused with a list of formats that named neither the file nor where
// .xyz goes, as a red notice that stayed on screen. It is handed to the Geophysics tab's drop import, and a refusal names the file as an info.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { notice, noticeLevel } from "../src/lib/notices.js";

const u = fs.readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");

test(".xyz goes to the Geophysics tab's import", () => {
  assert.match(u, /const xyzFiles = grouped\.files\.filter\(\(f\) => \/\\\.xyz\$\/i\.test\(f\.name\)\);/);
  assert.match(u, /goToModule\("geophysics"\); requestModuleAction\("geophysics-drop", \{ files: xyzFiles \}\);/);
  assert.match(u, /- Math\.max\(0, xyzFiles\.length - 1\) \/\* #3212 \*\//, "one notice for all the .xyz files, not counted as skipped");
});

test("the refusal names the file and is an info, not a red notice", () => {
  assert.doesNotMatch(u, /"Only \.csv, \.xlsx, \.zip/);
  const n = notice("Not imported from this drop: {names}. Dropped here, the 3D View reads .csv, .xlsx, .zip (shapefile), .shp, .gpkg, .kml / .kmz, .las logs, GeoTIFF / .gxf / .grd grids and .dxf / .obj files; point surveys (.xyz) open on the Geophysics tab.", { names: "IP.dat" });
  assert.match(n.text, /IP\.dat/);
  assert.equal(noticeLevel(n), "info");
  assert.equal(noticeLevel(notice("{names}: XYZ point files are read on the Geophysics tab, which opens them now.", { names: "IP.xyz" })), "info");
});
