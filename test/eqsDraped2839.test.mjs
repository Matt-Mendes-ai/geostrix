// TASKS.csv #2839 (GSC geophysics review) — the equivalent-source grid of a ground survey did not honour the stations (0.5–0.7 mGal off)
// while the message reported a 0.003 mGal fit to block means. Two defaults: the grid level was the HIGHEST station (an upward continuation
// of ~100 m on Matagami) and the source depth followed the cell (120 m under stations 400 m apart). Blank elevation now grids on the readings'
// own surface ("draped", in the Python engine), the depth follows the station spacing, and the message says how far the GRID is from the
// readings. The numbers are checked in python-sidecar/tests/test_pfields.py check_eqs_draped (SYNTHETIC hills, 400 m stations).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const box = readFileSync(new URL("../src/components/EqsGridBox.jsx", import.meta.url), "utf8");
const py = readFileSync(new URL("../python-sidecar/app/geophys/pfields.py", import.meta.url), "utf8");

test("blank elevation grids on the readings' surface; a typed one is a level; no elevations: the entered height", () => {
  assert.match(box, /const draped = elev === "" && !noZ;/);
  assert.match(box, /const elevM = elev !== "" \? Number\(elev\) : noZ && flatZ !== "" \? Number\(flatZ\) : NaN;/);
  assert.match(box, /elevation: draped \? "draped" : elevM,/);
  assert.match(box, /if \(!draped && !Number\.isFinite\(elevM\)\)/);
  assert.doesNotMatch(box, /Math\.ceil\(zMax\) : NaN/); // the highest reading is no longer the default level
});

test("the source depth follows the station spacing (or the cell, if larger)", () => {
  assert.match(box, /const depthDefault = \+\(1\.2 \* Math\.max\(cellM, sug\?\.spacingM \|\| 0\)\)\.toFixed\(1\);/);
  assert.match(box, /const depthM = Number\(depth\) > 0 \? Number\(depth\) : depthDefault;/);
  assert.doesNotMatch(box, /1\.2 \* cellM\)\.toFixed/);
});

test("the message says how far the grid is from the readings themselves", () => {
  assert.match(box, /tr\("The grid is within \{rms\} \{units\} RMS of the readings themselves \(worst \{max\}\), its nodes interpolated to their positions\."/);
  assert.match(py, /draped = req\.get\("elevation"\) == "draped"/);
  assert.match(py, /RegularGridInterpolator\(\(n\[:, 0\], e\[0, :\]\), pred, bounds_error=False, fill_value=np\.nan\)/);
  assert.match(py, /"grid_rms": grid_rms, "grid_max": grid_max, "grid_n": grid_n,/);
});
