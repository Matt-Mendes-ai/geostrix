// TASKS.csv #2162 (WA drillhole review) — weathering / oxidation / regolith logs as their own interval layer
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessTarget, guessTargetFor, guessMapping, LAYER_META, TARGET_SCHEMAS, colorForWeathering } from "../src/lib/layers.js";
import { viewerSource } from "./helpers/viewerSource.mjs"; // #2176 — the drillhole build moved out of ViewerModule
const H = (s) => s.split(",");

test("#2162 a weathering, oxidation or regolith log is recognized by its columns or its file name", () => {
  for (const h of ["Weathering", "Weath_Code", "Oxidation", "Ox_State", "Regolith", "Regolith_Code", "Redox"]) {
    const hs = ["HoleID", "From", "To", h];
    assert.equal(guessTarget(hs), "weath", h);
    assert.equal(guessMapping("weath", hs).value, h, h);
  }
  assert.equal(guessTargetFor(H("HoleID,From,To,Code,Description"), "weathering_log.csv"), "weath");
  assert.equal(guessTargetFor(H("HoleID,From,To,Code"), "oxidation.csv"), "weath");
  assert.equal(guessTargetFor(H("HoleID,From,To,Mineral"), "Iron oxides.csv"), "mnlgy"); // still a mineral log
  // a geology log with a lithology column stays lithology (its Weathering column is one of many)
  assert.equal(guessTarget(H("HOLEID,GEOLFROM,GEOLTO,Weathering,Lithology1,Colour1")), "litho");
});

test("#2162 the layer, its schema and its colours: a ramp from fresh to oxidised / cover", () => {
  assert.equal(LAYER_META.weath.kind, "interval"); assert.equal(TARGET_SCHEMAS.weath.label, "Weathering");
  assert.equal(colorForWeathering("FR"), "#5b6770"); assert.equal(colorForWeathering("ox"), "#a23b1f"); assert.equal(colorForWeathering("SAP RK"), "#9c8c66");
  assert.notEqual(colorForWeathering("SW"), colorForWeathering("HW"));
  assert.ok(/^#|^hsl/.test(colorForWeathering("ZZQ"))); // an unknown code still gets a colour
});

test("#2162 wired into the viewer, strip logs, QC, legends and the domain lists", () => {
  const v = viewerSource();
  assert.match(v, /buildIntervalTube\("weath"\)/); assert.match(v, /weath: byHoleIf\("weath", layers\.weath\)/);
  for (const f of ["src/lib/dataQC.js", "src/lib/domainLayers.js", "src/lib/legendGroups.js", "src/lib/striplogSvg.js", "src/components/StripLog.jsx", "src/components/CompositingModal.jsx", "src/components/GradeStatistics.jsx", "src/components/EvidenceOverlayPane.jsx", "src/components/SectionEditModal.jsx", "src/components/BestIntercepts.jsx"]) {
    assert.match(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), /"weath"|layers\.weath/, f);
  }
});
