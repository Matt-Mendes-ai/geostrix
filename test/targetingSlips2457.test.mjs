// TASKS.csv #2457 / #2585 — small Targeting slips: the floor advice, score-map names, units beside Min / Max, the shell tooltip, the steady
// separation of parallel holes
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { planChecks, drilledTraceIndex } from "../src/lib/plannedHoleChecks.js";

test("parallel vertical holes: the separation is the same all the way down", () => {
  const collars = [{ hole_id: "NNA5392", x: 100, y: 0, z: 300, max_depth: 80 }];
  const survey = [{ hole_id: "NNA5392", depth: 0, azimuth: 0, dip: 90 }, { hole_id: "NNA5392", depth: 80, azimuth: 0, dip: 90 }];
  const hole = { id: "p", name: "P", x: 1.5, y: 0, z: 300, azimuth: 0, dip: -90, length: 70 };
  const idx = drilledTraceIndex(collars, survey, "minimum_curvature");
  const [r] = planChecks([hole], idx, []);
  assert.ok(r.nearestReal && Math.abs(r.nearestReal.distance - 98.5) < 0.01, JSON.stringify(r.nearestReal));
  assert.equal(r.nearestReal.steady, true);
  const inclined = { ...hole, dip: -60, azimuth: 90 };
  const [q] = planChecks([inclined], idx, []);
  assert.equal(q.nearestReal.steady, false);
});

test("the strings and wiring", () => {
  const ev = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.match(ev, /tr\(floor > 0 \? "\{p\}% of the scored cells sit at the lowest score/);
  assert.match(ev, /const nameGrid = `\$\{name\}, \$\{grid\.nx\} × \$\{grid\.ny\} × \$\{Math\.round\(grid\.dx\)\} m`;/);
  const vp = fs.readFileSync("src/modules/viewer/ViewerParts.jsx", "utf8");
  assert.equal((vp.match(/\{valueUnit\(model\) && <span/g) || []).length, 2);
  assert.ok(vp.includes("a grade shell, or a geophysical high or low, as a body to section, query and target."));
  assert.match(fs.readFileSync("src/components/PlannedHoleParts.jsx", "utf8"), /nearestReal\.steady \? tr\(", the same all the way down"\)/);
});
