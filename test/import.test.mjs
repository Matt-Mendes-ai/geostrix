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
