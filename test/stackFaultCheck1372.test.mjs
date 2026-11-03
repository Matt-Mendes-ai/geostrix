// TASKS.csv #1372 — a fault added to the stack gets the Structures tool's checks, and is not named "Fault Fault"
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fisherStats } from "../src/lib/stereonet.js";

const src = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
const gather = src.slice(src.indexOf("const gatherFaultSpec"), src.indexOf("const runStructuralModel"));

test("gatherFaultSpec runs the #1066 orientation check and the several-holes check, and returns them", () => {
  assert.match(gather, /rows\.length >= 4 \? fisherStats\(rows\) : null/);
  assert.match(gather, /fs\?\.noPreferred\) warnings\.push\(notice\("Warning: the \{n\} \\"\{name\}\\" picks show no preferred orientation/);
  assert.match(gather, /!id && holes > 1\) warnings\.push/);
  assert.match(src, /faultWarnings\.push\(\.\.\.\(f\.warnings \|\| \[\]\)\)/);
  // after the run, or its own messages push them out of the six the sidebar keeps
  assert.match(src, /await runSurfaceStack\(\[\.\.\.faultSpecs, \.\.\.specs\], \{ relation: breakAt\.size[^\n]*\n\s*if \(faultWarnings\.length\) setNotices/);
});

test("the wording is the Structures tool's own (one translation key for both)", () => {
  const key = "Warning: the {n} \\\"{name}\\\" picks show no preferred orientation";
  assert.ok(src.split(key).length - 1 >= 2); // the Structures tool and the stack (the vein tool reuses it too, #1415)
});

test("a fault type that already says fault is not prefixed again; no ID reads '(all picks)'", () => {
  assert.match(gather, /tr\("\{type\} \(all picks\)", \{ type \}\)/);
  assert.match(gather, /meshName: \/fault\|flt\|shear\/i\.test\(type\) \? name : `Fault \$\{name\}`/);
});

test("fisherStats flags scattered planes and passes a tight set", () => {
  const scattered = [{ dip: 80, azimuth: 10 }, { dip: 20, azimuth: 200 }, { dip: 55, azimuth: 290 }, { dip: 35, azimuth: 120 }, { dip: 70, azimuth: 60 }];
  const tight = [{ dip: 60, azimuth: 60 }, { dip: 62, azimuth: 64 }, { dip: 58, azimuth: 57 }, { dip: 61, azimuth: 59 }, { dip: 59, azimuth: 63 }];
  assert.equal(fisherStats(scattered).noPreferred, true);
  assert.ok(!fisherStats(tight).noPreferred);
});
