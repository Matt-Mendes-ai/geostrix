// TASKS.csv #3425 — AppMx / Mx (apparent chargeability) read as the measured value, not a picker
import test from "node:test";
import assert from "node:assert/strict";
import { guessGeophysColumns } from "../src/lib/geophysColumns.js";

test("#3425 AppMx, Mx and friends are the measured value, not a picker", () => {
  for (const [cols, v] of [[["X", "Y", "Z", "AppMx"], "AppMx"], [["Easting", "Northing", "Elev", "Mx"], "Mx"], [["X", "Y", "MVV"], "MVV"], [["x", "y", "z", "appmx"], "appmx"], [["X", "Y", "Z", "RhoA"], "RhoA"], [["X", "Y", "Z", "AppRho"], "AppRho"]]) {
    const g = guessGeophysColumns(cols);
    assert.equal(g.value, v, cols.join(","));
    assert.ok(g.ok, cols.join(","));
  }
  // a column that merely contains the letters stays out
  assert.equal(guessGeophysColumns(["X", "Y", "Z", "Remix"]).value, "");
});

test("#3425 beside a resistivity (a DC / IP file) the resistivity stays the value, Mx is the other measurement", () => {
  const g = guessGeophysColumns(["MX_mVV", "X", "Y", "RHO_ohmm"]);
  assert.equal(g.value, "RHO_ohmm");
  assert.deepEqual(g.valueCandidates, ["MX_mVV", "RHO_ohmm"]);
  assert.equal(guessGeophysColumns(["X", "Y", "AppRho", "AppMx"]).value, "AppRho");
  assert.equal(guessGeophysColumns(["X", "Y", "AppMx"]).value, "AppMx");
});
