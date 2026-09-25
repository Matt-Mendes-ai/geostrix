// TASKS.csv #443 — import detection / normalisation / desurvey regression tests (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import { guessTarget, guessMapping, num, replaceRowsByHole } from "../src/lib/layers.js";
import { desurveyHole } from "../src/lib/desurvey.js";

test("#335 collar files with a depth column are collars, not survey", () => {
  assert.equal(guessTarget(["hole_id", "x", "y", "z", "azimuth", "dip", "total_depth"]), "collars");
  assert.equal(guessTarget(["hole_id", "easting", "northing", "elevation", "azimuth", "dip", "depth"]), "collars");
  assert.equal(guessTarget(["HoleID", "UTM_E", "UTM_N", "RL", "Azi", "Dip", "EOH"]), "collars");
  assert.equal(guessMapping("collars", ["hole_id", "x", "y", "z", "azimuth", "dip", "total_depth"]).length, "total_depth");
  assert.equal(guessTarget(["hole_id", "depth", "azimuth", "dip"]), "survey");
  assert.equal(guessTarget(["hole_id", "from", "to", "type"]), "vein");
});

test("#426 structure headers: dip direction is never taken as the dip", () => {
  const cases = [
    [["HoleID", "Depth", "Type", "DipDirection", "Dip_deg"], "Dip_deg", "DipDirection"],
    [["hole_id", "depth", "structure_type", "dip_dir", "dip"], "dip", "dip_dir"],
    [["hole_id", "depth", "type", "dd", "dip"], "dip", "dd"],
    [["hole_id", "depth_m", "structure_type", "inferred_dip_deg", "assumed_dip_azimuth"], "inferred_dip_deg", "assumed_dip_azimuth"],
  ];
  for (const [h, dip, az] of cases) {
    assert.equal(guessTarget(h), "structure", h.join(","));
    const m = guessMapping("structure", h);
    assert.equal(m.dip, dip, h.join(","));
    assert.equal(m.azimuth, az, h.join(","));
  }
  assert.equal(guessMapping("structure", ["hole_id", "depth_m", "structure_type", "strike", "dip"]).strike, "strike");
});

test("#337 num(): blank and no-data spellings are missing, never 0", () => {
  for (const v of [null, undefined, "", " ", "NA", "n/a", "-", "--", "null"]) assert.ok(Number.isNaN(num(v)), JSON.stringify(v));
  assert.equal(num(" 12 "), 12);
  assert.equal(num(0), 0);
});

test("#336 replaceRowsByHole replaces only the re-imported holes", () => {
  const r = replaceRowsByHole([{ hole_id: "A", d: 0 }, { hole_id: "B", d: 0 }], [{ hole_id: "B", d: 1 }]);
  assert.deepEqual(r.replacedHoles, ["B"]);
  assert.deepEqual(r.rows, [{ hole_id: "A", d: 0 }, { hole_id: "B", d: 1 }]);
});

test("#338 traces run to end of hole, not the last survey station", () => {
  const c = { hole_id: "H", x: 0, y: 0, z: 0, azimuth: 90, dip: 60, length: 300 };
  const sv = [{ hole_id: "H", depth: 0, azimuth: 90, dip: 60 }, { hole_id: "H", depth: 150, azimuth: 100, dip: 55 }];
  const t = desurveyHole(c, sv);
  assert.equal(t[t.length - 1].md, 300);
  const t2 = desurveyHole({ ...c, length: undefined }, sv);
  assert.equal(t2[t2.length - 1].md, 150);
});

import { runDataQC } from "../src/lib/dataQC.js";
test("#339 QC flags untraceable, assumed-length, upward and over-deep-survey holes; EOH = max(length, survey)", () => {
  const collars = [
    { hole_id: "A", x: 0, y: 0, z: 0 },                                  // no survey, no az/dip -> untraceable
    { hole_id: "B", x: 10, y: 0, z: 0, azimuth: 90, dip: 60 },           // no survey, no length -> assumed 300 m
    { hole_id: "C", x: 20, y: 0, z: 0, length: 100 },                    // survey to 120 > length 100
    { hole_id: "D", x: 30, y: 0, z: 0, length: 200 },                    // upward survey; interval at 150-160 is within EOH
  ];
  const survey = [
    { hole_id: "C", depth: 0, azimuth: 0, dip: 60 }, { hole_id: "C", depth: 120, azimuth: 0, dip: 60 },
    { hole_id: "D", depth: 0, azimuth: 0, dip: -30 }, { hole_id: "D", depth: 100, azimuth: 0, dip: -30 },
  ];
  const layers = { litho: [{ hole_id: "D", from: 150, to: 160, value: "AND" }] };
  const { issues } = runDataQC({ project: { epsg: 3156, name: "t" }, collars, survey, layers, boundaries: [], assays: [] });
  const has = (sev, id, re) => issues.some((i) => i.severity === sev && i.holeId === id && re.test(i.message));
  assert.ok(has("error", "A", /cannot be traced/));
  assert.ok(has("warning", "B", /ASSUMED 300 m/));
  assert.ok(has("warning", "C", /Survey goes to 120 m/));
  assert.ok(has("warning", "D", /Points upward/));
  assert.ok(!issues.some((i) => i.holeId === "D" && /extends past/.test(i.message)), "interval below the last survey shot but within EOH must not be flagged");
});
