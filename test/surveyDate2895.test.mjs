// TASKS.csv #2895 (review #2876, WA bedded iron) — bores.csv's Azimuth_mag pre-selected magnetic north with no survey date: Import was
// enabled, the dialog closed and the notice said nothing was imported, so the mapping had to be redone. Import now waits for the date,
// and says why; a magnetic choice left over from another kind does not block a log.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const d = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
const u = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
const DATE_TEST = String.raw`!/^\d{4}-\d{2}-\d{2}$/.test(`;

test("the dialog keeps Import disabled until the date is typed, and says why", () => {
  assert.ok(d.includes(`const needsDate = ["collars", "survey", "structure"].includes(modal.target) && modal.azimuthRef === "magnetic" && ${DATE_TEST}modal.azimuthDate || "");`));
  assert.ok(d.includes("const blocked = missingRequired.length > 0 || needsDate || importCount(modal) === 0;"));
  assert.ok(d.includes("disabled={blocked}"));
  assert.ok(d.includes(`{tr("Type the survey date above: magnetic azimuths need it to work out the declination.")}`));
});

test("the commit refuses it only for tables with an azimuth", () => {
  assert.ok(u.includes(`if (AZ_TARGETS.has(target) && azimuthRef === "magnetic" && ${DATE_TEST}azimuthDate || "")) {`));
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["Type the survey date above: magnetic azimuths need it to work out the declination."], l);
});
