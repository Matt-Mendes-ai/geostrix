// TASKS.csv #3031 (split from #2902) — an app-wide guard for #371's rule: no Math.min / Math.max spread over a per-sample array. A spread of
// 150,000 values throws 'Maximum call stack size exceeded' (Thresholds on 147,659 Fe assays, #2902). Every spread in src/ as of 2026-11-13 is
// counted below per file (the bounding boxes, corners, eigenvalues and chart ticks of a handful of numbers); a file with MORE fails: use
// arrMin / arrMax (lib/arrayStats.js), or, for a spread that can never see a population, add one to the count with the reason in the code.
// #3031 also moved three population spreads to arrMin / arrMax: every CSV point (crsFromColumns), every sheet row (tabular), every collar
// (drapeElevation).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SPREAD = /Math\.(min|max)\(\s*\.\.\./g;
const codeOf = (text) => text.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "")).join("\n");
const ROOT = new URL("../src/", import.meta.url);
function counts() {
  const out = {}, root = fileURLToPath(ROOT);
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx|mjs)$/.test(e.name)) { const n = (codeOf(fs.readFileSync(p, "utf8")).match(SPREAD) || []).length; if (n) out[path.relative(root, p).split(path.sep).join("/")] = n; }
    }
  };
  walk(root);
  return out;
}
const REVIEWED = {
  "components/DcipMergePanel.jsx": 1,
  "components/DesignLinesPane.jsx": 2,
  "components/DomainsPanel.jsx": 4,
  "components/EstimateCheck.jsx": 1,
  "components/FdemPane.jsx": 4,
  "components/FenceDiagramModal.jsx": 1,
  "components/GenerateAtlasModal.jsx": 1,
  "components/GradeEstimationModal.jsx": 5,
  "components/GradeTonnageModal.jsx": 4,
  "components/HyperspectralTab.jsx": 2,
  "components/InversionPanel.jsx": 2,
  "components/MtSoundingsPane.jsx": 8,
  "components/PitDesignPane.jsx": 4,
  "components/PredictivePanel.jsx": 1,
  "components/PublicGeochemModal.jsx": 4,
  "components/StopesPane.jsx": 2,
  "components/SurfaceMappingPanel.jsx": 14,
  "components/SurfacePlanMap.jsx": 1,
  "components/SurfaceQaqcPanel.jsx": 4,
  "components/SurfaceSolidsPanel.jsx": 6,
  "components/SurveyPlannerPanel.jsx": 4,
  "lib/blockModelCsv.js": 2,
  "lib/dcip3d.js": 5,
  "lib/dcipArray.js": 4,
  "lib/dcipStations.js": 2,
  "lib/designStrings.js": 6,
  "lib/drillPlan.js": 3,
  "lib/dumpDesign.js": 4,
  "lib/estimation.js": 1,
  "lib/explicitSurface.js": 6,
  "lib/geochemDomains.js": 1,
  "lib/gocadSgrid.js": 3,
  "lib/gocadVoxet.js": 2,
  "lib/imageryFetch.js": 4,
  "lib/intrusionBody.js": 14,
  "lib/labCertificate.js": 1,
  "lib/layerCake.js": 1,
  "lib/layoutPlace.js": 4,
  "lib/longSection.js": 3,
  "lib/mapImportReview.js": 4,
  "lib/mapLayerBuild.js": 4,
  "lib/naipFetch.js": 5,
  "lib/oxideTotals.js": 1,
  "lib/pileOrder.js": 2,
  "lib/pitDesign.js": 1,
  "lib/pitShell.js": 2,
  "lib/plannedGrid.js": 4,
  "lib/raster.js": 1,
  "lib/res2dinv.js": 2,
  "lib/sectionGeoref.js": 3,
  "lib/srtmFetch.js": 8,
  "lib/stopeOutlines.js": 4,
  "lib/streamTable.js": 1,
  "lib/surfacePlan.js": 1,
  "lib/surveyPlan.js": 4,
  "lib/terrainTie.js": 4,
  "lib/veinCoreAngle.js": 2,
  "lib/viewer/contactFit.js": 1,
  "lib/viewer/gridGroup.js": 1,
  "lib/viewer/surfacePlacement.js": 1,
  "lib/wireframe.js": 2,
  "modules/GeophysicsModule.jsx": 4,
  "modules/LayoutModule.jsx": 8,
  "modules/RasterModule.jsx": 5,
  "modules/ViewerModule.jsx": 9,
  "modules/viewer/drillLines.js": 2,
  "modules/viewer/estimationShells.js": 1,
  "modules/viewer/intrusionRun.js": 12,
  "modules/viewer/modellingRuns.js": 5
};

test("no new Math.min / Math.max spread anywhere in src/", () => {
  const now = counts(), over = Object.entries(now).filter(([f, n]) => n > (REVIEWED[f] || 0)).map(([f, n]) => `${f}: ${n} (reviewed ${REVIEWED[f] || 0})`);
  assert.deepEqual(over, [], "a new spread: use arrMin / arrMax (lib/arrayStats.js, #371), or review it and raise the count here");
});

test("the population spreads #3031 moved stay moved", () => {
  const read = (p) => codeOf(fs.readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8"));
  assert.ok(!/Math\.(min|max)\(\.\.\.(xs|ys)\)/.test(read("lib/crsFromColumns.js")));
  assert.ok(!/Math\.max\(\.\.\.rows\.map/.test(read("lib/tabular.js")));
  assert.ok(!/Math\.max\(\.\.\.zs\)/.test(read("lib/drapeElevation.js")));
});
