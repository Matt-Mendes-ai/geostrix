// TASKS.csv #1094 — a geophysics survey's points as CSV rows
import { test } from "node:test";
import assert from "node:assert/strict";
import { surveyExportRows } from "../src/lib/geophysSurveys.js";

test("#1094 value named by method and unit; line / fiducial kept; absent columns left out", () => {
  const pts = [{ x: 1, y: 2, z: 900, value: 57012.4, line: "L10", fid: 1, _src: "mag.xyz" }, { x: 3, y: 4, z: null, value: 57020.1, line: "L10", fid: 2, _src: "mag.xyz" }];
  const { rows, valueName } = surveyExportRows(pts, { method: "mag", units: "nT" });
  assert.equal(valueName, "mag_nT");
  assert.deepEqual(rows[0], { x: 1, y: 2, z: 900, mag_nT: 57012.4, line: "L10", fiducial: 1 });
  assert.equal(rows[1].z, "");
  assert.ok(!("label" in rows[0]) && !("height_agl" in rows[0]));
});

test("#1094 an unlabelled survey exports its value as \"value\"; AGL heights are kept", () => {
  const { rows, valueName } = surveyExportRows([{ x: 0, y: 0, z: 1100, zAgl: 35, value: 1.2 }], {});
  assert.equal(valueName, "value");
  assert.equal(rows[0].height_agl, 35);
});
