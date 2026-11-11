// TASKS.csv #2299 / #2300 — Layout names no placeholder CRS and computes no true / magnetic north while the project CRS is not set
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");

test("#2300 — {crs} and the grid caption say local grid; the checkbox is not 'UTM'", () => {
  assert.ok(s.includes('function crsText(epsg, crsSet = true) {\n  if (crsSet === false) return tr("Local grid (no coordinate system set)");') || s.includes('function crsText(epsg, crsSet = true) {\r\n  if (crsSet === false) return tr("Local grid (no coordinate system set)");'));
  assert.ok(s.includes("crs: crsText(project?.epsg, project?.crsSet),"));
  assert.ok(s.includes('{tr("Coordinate grid (labelled)")')); // #2484: on every project now, not only without a CRS
  assert.ok(!s.includes('tr("UTM grid (labelled)")'));
  assert.ok(s.includes("<ViewportControls crsUnset={project?.crsSet === false}"));
});

test("#2299 — the north diagram refuses before the placeholder's convergence and declination", () => {
  const i = s.indexOf('if (project?.crsSet === false) { updateSelected({ decl: null, declError: tr("This project has no coordinate system set'), j = s.indexOf('azimuthToGridOffset("magnetic", at.x, at.y, project.epsg, date)');
  assert.ok(i > 0 && i < j);
});
