// TASKS.csv #3625 (Main's review of the first version) — numbers shown to the user follow the interface language through fmtNum(); nothing a FILE writer produces may: a bare toLocaleString() is not
// wrapped (a global wrap would have written '1.234,5' into CSV / KMZ / DXF / SQL). Rendered with each language selected, the collar tables, the intercepts CSV, the report CSV and a KMZ placemark are the
// same text as in English; fmtNum itself follows the language.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { useDictionary, fmtNum, NUMBER_LOCALES } from "../src/lib/i18n.js";
import { drillholeTableFiles } from "../src/lib/drillholeTables.js";
import { interceptRows } from "../src/lib/drillReportExport.js";
import { toExportCsv } from "../src/lib/tabular.js";
import { projectReportRows } from "../src/lib/analysisExports.js";
import { buildProjectKml } from "../src/lib/projectKmz.js";

const nativeToLocale = Number.prototype.toLocaleString;
const collars = [{ hole_id: "H1", x: 500123.45, y: 6200000.5, z: 1234.5, azimuth: 90.5, dip: 60.25, length: 1234.5, attrs: { year: 2024, prospect: "North 1,200 m" } }];
const survey = [{ hole_id: "H1", depth: 0, azimuth: 90.5, dip: 60.25 }, { hole_id: "H1", depth: 1234.5, azimuth: 95, dip: 55 }];
const row = { hole_id: "H1", from: 1020.5, to: 1234.5, length: 214, avgGrade: 12345.6789, intervals: 7, overRange: false, unsampledM: 0, overlapM: 0 };
const kmlOf = () => buildProjectKml({ projectName: "P", epsg: 32609, collars, survey, desurveyMethod: "minimum_curvature", layers: {}, customLayers: [], assays: [], assayElements: [], surfaceSamples: [], surfaceStructures: [], mapLayers: [], boundaries: [], plannedHoles: [], sections: [], rasters: [], layerGroups: [] },
  { toLonLat: (x, y) => [-130 + (x - 500000) / 1e5, 56 + (y - 6200000) / 1e5], legendPng: () => ({ bytes: new Uint8Array([1]), width: 1, height: 1 }), rasterImage: () => null }).kml;
const render = () => ({
  tables: drillholeTableFiles({ collars, survey, epsg: 32609, version: "x" }).filter((f) => f.name !== "provenance.txt").map((f) => [f.name, f.text]),
  intercepts: toExportCsv(interceptRows([row], { symbol: "Au", unit: "g/t" })),
  report: toExportCsv(projectReportRows({ project: { name: "P", epsg: 32609 }, collars, survey, surfaceSampleCount: 0, report: { totalMetres: 1234.5, layerCounts: [], assayStats: [], surfaceStats: [], mediumCounts: {}, qaqcExcluded: 0 }, generated: "x" })),
  kml: kmlOf(),
});

test("under es / pt / fr / ar the files are the English text, and a bare toLocaleString is the engine's", async () => {
  useDictionary("en", null);
  const base = render();
  assert.match(base.tables[0][1], /1234\.5/); assert.match(base.intercepts, /12345\.7/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    useDictionary(lang, {});
    assert.equal(Number.prototype.toLocaleString, nativeToLocale, `${lang}: Number.prototype.toLocaleString is not wrapped`);
    const got = render();
    assert.deepEqual(got.tables, base.tables, `${lang}: collar / survey tables`);
    assert.equal(got.intercepts, base.intercepts, `${lang}: intercepts CSV`);
    assert.equal(got.report, base.report, `${lang}: report CSV`);
    assert.equal(got.kml, base.kml, `${lang}: KMZ placemarks`);
  }
  useDictionary("en", null);
});

test("fmtNum follows the interface language, with Western digits in Arabic", async () => {
  useDictionary("es", {}); assert.equal(fmtNum(32426), "32.426"); assert.equal(fmtNum(12345.5, { maximumFractionDigits: 1 }), "12.345,5");
  useDictionary("pt", {}); assert.equal(fmtNum(32426), "32.426");
  useDictionary("fr", {}); assert.match(fmtNum(32426), /^32[\s\u202f\u00a0]426$/);
  useDictionary("ar", {}); assert.equal(fmtNum(32426), "32,426");
  useDictionary("en", null); assert.equal(fmtNum(32426, undefined), (32426).toLocaleString());
  assert.deepEqual(Object.keys(NUMBER_LOCALES), ["es", "pt", "fr", "ar"]);
});

test("the UI call sites use it, and no file writer was changed to", () => {
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  for (const f of ["../src/App.jsx", "../src/components/GradeTonnageModal.jsx", "../src/components/GradeStatistics.jsx", "../src/components/DownholeLogsPane.jsx", "../src/modules/viewer/ViewerParts.jsx"]) { const s = read(f); assert.match(s, /\bfmtNum\b.*from "(\.\.\/)*(\.\/)?(lib\/)?i18n\.js"|import \{[^}]*\bfmtNum\b[^}]*\} from/, f); assert.doesNotMatch(s, /fmtNum\([^)]*undefined,\s*\{/, `${f}: no stale locale argument`); }
  for (const f of ["../src/lib/drillholeTables.js", "../src/lib/projectKmz.js", "../src/lib/drillReportExport.js", "../src/lib/analysisExports.js", "../src/lib/tabular.js", "../src/lib/meshExport.js"]) assert.doesNotMatch(read(f), /fmtNum/, `${f} is a file writer`);
});
