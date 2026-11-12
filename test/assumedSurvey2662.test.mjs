// TASKS.csv #2662 — a hole whose survey method is 'assumed' (#2494's collar attribute) is drawn dashed and its collar tip says so
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { addTraceChunks } from "../src/lib/viewer/traceBatch.js";
import { viewerSource } from "./helpers/viewerSource.mjs";

const KEY = "survey method assumed: the direction below the collar was not measured (drawn dashed)";

test("the build sends an 'assumed' survey method to the dashed chunk and says so in the collar tip", () => {
  const v = viewerSource();
  assert.ok(v.includes('const methodAssumed = c.attrs?.["survey method"] === "assumed";'));
  assert.ok(v.includes("dashed: assumedVertical || methodAssumed"));
  assert.ok(v.includes(`methodAssumed ? \`\\n\${tr("${KEY}")}\``));
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(d[KEY], lang);
  }
});

test("a dashed hole with a bent trace keeps its own line distances from the collar", () => {
  const g = new THREE.Group();
  const bent = { holeId: "A", dashed: true, pts: [{ x: 0, y: 0, z: 0 }, { x: 0, y: -30, z: 0 }, { x: 10, y: -60, z: 0 }] };
  const [ch] = addTraceChunks(g, [bent]);
  assert.ok(ch.material.isLineDashedMaterial);
  const d = ch.geometry.attributes.lineDistance.array;
  assert.equal(d[0], 0);
  assert.equal(d[1], 30);
  assert.ok(Math.abs(d[3] - (30 + Math.hypot(10, 30))) < 1e-4);
});
