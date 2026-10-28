// TASKS.csv #1064 (review #1016) — the anomaly / catchment / survey-plan CSVs carry their rule and CRS as columns; no
// leading "#" line (QGIS read it as the header).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crsCell, toExportCsv, parseTableText } from "../src/lib/tabular.js";

test("#1064 crsCell names the EPSG, or says it is not set", () => {
  assert.equal(crsCell({ epsg: 26910, crsSet: true }), "EPSG:26910");
  assert.equal(crsCell({ epsg: 3156, crsSet: false }), "not set");
  assert.equal(crsCell(null), "not set");
});

test("#1064 the anomaly CSV starts with its header; a rule with commas stays one cell", () => {
  const src = readFileSync(new URL("../src/components/SurfaceAnomalyControls.jsx", import.meta.url), "utf8");
  assert.ok(!src.includes("content: `# ${result.label}"), "no leading # line");
  assert.match(src, /class_rule: result\.label, crs: crsCell\(project\)/);
  const text = toExportCsv([{ sample_id: "S1", x: 500000, y: 6000000, class: "anomalous", class_rule: "Porphyry Cu (± Au, Mo) index", crs: "EPSG:26910" }]);
  const { rows, headers } = parseTableText(text);
  assert.equal(headers[0], "sample_id");
  assert.equal(rows[0].class_rule, "Porphyry Cu (± Au, Mo) index"); assert.equal(rows[0].x, 500000);
});
