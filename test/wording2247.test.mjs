// TASKS.csv #2247 — wording slips: 'this model's actual cell values' and '2–98 % of the cells' on a point survey, a Voronoi area with no unit,
// 'covers 100% of the stations; the others would be left out', and DC / IP 'Stations: 2 from … (line )'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("each slip has its own wording now", () => {
  const g = read("src/modules/GeophysicsModule.jsx");
  assert.match(g, /model\.id === "geophys_pts" [^\n]*tr\("Generates \{classCount\} classes from this survey's point values/);
  assert.match(g, /pts \? tr\("2–98 % of the points \(\{lo\} to \{hi\}\)"/);
  assert.match(read("src/components/SpatialAnalysis.jsx"), /\+ \(isMetricProjectedEpsg\(project\?\.epsg\) \? " m²" : ""\)/);
  assert.match(read("src/components/InversionPanel.jsx"), /coverage\.pct >= 99\.95 \? tr\("The terrain covers every station\."\)/);
  assert.match(read("src/components/DcipPanel.jsx"), /line\.stations\.line \? tr\("Stations: \{list\} from \{file\} \(line \{line\}\)\{v\}\."[^\n]*: tr\("Stations: \{list\} from \{file\}\{v\}\."/);
});
