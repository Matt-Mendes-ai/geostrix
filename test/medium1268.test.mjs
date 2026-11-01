// TASKS.csv #1268 import checks; #1179 a logged structure's reach; #1234 calculator picks kept; #1192 repeated surface names
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { importCheckSummary } from "../src/lib/dataQC.js";
import { replaceRowsByHole, keepDerivedPicks } from "../src/lib/layers.js";
import { surfaceOptionLabels } from "../src/lib/viewer/surfaceLabels.js";
import { pickDefaultReachM } from "../src/lib/evidenceSources.js";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("#1268 survey stations for a hole with no collar are named", () => {
  const stations = [{ hole_id: "A", depth: 0 }, { hole_id: "QA-999", depth: 10 }].map((r) => ({ hole_id: r.hole_id, from: r.depth, to: r.depth }));
  const msg = importCheckSummary(stations, [{ hole_id: "A", length: 100 }], null, "survey stations from t.csv");
  assert.match(msg, /QA-999/);
  const imp = read("src/modules/viewer/useImportPipeline.js");
  assert.match(imp, /survey stations from \$\{fileName\}/);
});

test("#1268 the assay import runs the same check", () => {
  assert.match(read("src/modules/GeochemModule.jsx"), /importCheckSummary\(rows, collars, store\.survey/);
});

test("#1179 a logged structure's default comes from the drilling, not the size of the grid", () => {
  assert.equal(pickDefaultReachM(8290, 188), 564, "Woodjam: three hole spacings, not 8.3 km");
  assert.equal(pickDefaultReachM(200, 188), 200, "a small grid's median is smaller: kept");
  assert.equal(pickDefaultReachM(8290, null), 8290, "one hole: no spacing to go on");
});

test("#1234 a pick from the calculator survives a structure import for its hole, other old picks do not", () => {
  const calc = { hole_id: "A", depth: 49, _src: "Core orientation calculator" }, old = { hole_id: "A", depth: 60, _src: "old.csv" };
  const incoming = [{ hole_id: "A", depth: 50 }];
  const r = replaceRowsByHole([calc, old], incoming, keepDerivedPicks(new Set()));
  assert.ok(r.rows.includes(calc));
  assert.ok(!r.rows.includes(old));
  assert.ok(r.rows.includes(incoming[0]));
});

test("#1192 repeated surface names carry their run's time; unique names stay as they are", () => {
  const t = (h, m) => new Date(2026, 10, 1, h, m).toISOString();
  const l = surfaceOptionLabels([
    { id: 1, name: "Top of OB", params: { generatedAt: t(9, 0) } },
    { id: 2, name: "Top of IMMOQ", params: { generatedAt: t(9, 5) } },
    { id: 3, name: "Top of IMMOQ", params: { generatedAt: t(14, 32) } },
    { id: 4, name: "Top of IMMOQ", params: { generatedAt: t(14, 32) } },
    { id: 5, name: "Top of VANSS" }, { id: 6, name: "Top of VANSS" },
  ]);
  assert.equal(l.get(1), "Top of OB");
  assert.equal(l.get(2), "Top of IMMOQ (09:05)");
  assert.equal(l.get(3), "Top of IMMOQ (14:32)");
  assert.equal(l.get(4), "Top of IMMOQ (14:32 #2)");
  assert.equal(l.get(5), "Top of VANSS (#1)");
  assert.equal(new Set(l.values()).size, l.size, "no two alike");
});

test("#1192 the dropdowns use the labels", () => {
  const v = read("src/modules/ViewerModule.jsx");
  assert.doesNotMatch(v, /otherSurfaces\.map\(\(o\) => <option key=\{o\.id\} value=\{o\.id\}>\{o\.name\}/);
  assert.match(read("src/components/SurfaceQueryModal.jsx"), /surfaceOptionLabels\(surfaces\)/);
});
