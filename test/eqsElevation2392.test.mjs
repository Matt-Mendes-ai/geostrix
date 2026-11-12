// TASKS.csv #2392 (review #2325, WA uranium) — the equivalent-sources grid is drawn at the elevation it was computed at, with provenance
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const e = readFileSync(new URL("../src/components/EqsGridBox.jsx", import.meta.url), "utf8");

test("drawn at the computed elevation (the collars' median only without one), with a provenance record", () => {
  // #2839: a grid on the readings' surface (no single elevation) is drawn at their median, before the collars' median
  assert.match(e, /const drawAt = Number\.isFinite\(elevM\) \? elevM : draped && Number\.isFinite\(zMedian\) \? zMedian : defaultElevation;/);
  assert.match(e, /dx: d\.dx, dy: d\.dy, elevation: drawAt,/);
  assert.doesNotMatch(e, /elevation: defaultElevation,/);
  assert.match(e, /provenance: \{ tool: "Equivalent sources gridding", survey, readings: d\.readings, cellM, elevationM: elevM/);
});

test("the notice says where it is drawn", () => {
  assert.match(e, /tr\(" Drawn flat at \{z\} m, the elevation the field was computed at\.", \{ z: Math\.round\(drawAt\)\.toLocaleString\(\) \}\)/);
  assert.match(e, /tr\("Drawn flat at \{z\} m, the readings' median elevation; the field was computed on their surface \(\{lo\} to \{hi\} m\)\."/); // #2839
});
