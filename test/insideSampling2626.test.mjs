// TASKS.csv #2626 (part 2, follow-up of #2417 / #2542) — Surface query's metres inside a closed grade shell are split into the metres sampled
// for the shell's own element and those with no sample (the review's CLDD005: 117 m inside, 14.4 m sampled).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sampledByHole, sampledMetres } from "../src/lib/insideSampling.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("#2626: sampled metres inside: overlapping samples merged, NaN values and other holes ignored", () => {
  const by = sampledByHole([
    { hole_id: "A", from: 10, to: 12, value: 3 }, { hole_id: "A", from: 11, to: 14, value: 1 }, // overlap: 10-14 once
    { hole_id: "A", from: 30, to: 31, value: NaN }, // no value: not a sample
    { hole_id: "A", from: 40, to: 50, value: 0.2 },
    { hole_id: "B", from: 0, to: 100, value: 1 },
  ]);
  assert.deepEqual(by.get("A"), [{ from: 10, to: 14 }, { from: 40, to: 50 }]);
  // inside 0-20 and 35-45: 4 m + 5 m sampled of 25 m
  assert.equal(sampledMetres([{ from: 0, to: 20 }, { from: 35, to: 45 }], by.get("A")), 9);
  assert.equal(sampledMetres([{ from: 0, to: 20 }], by.get("C") || []), 0);
});

test("#2626: Surface query reads the shell's element from its stored params and adds the column and the line", () => {
  const s = fs.readFileSync(path.join(root, "src", "components", "SurfaceQueryModal.jsx"), "utf8");
  assert.match(s, /generatedSurfaces\.find\(\(g\) => g\.id === surface\?\.id\)\?\.params\?\.element/);
  assert.match(s, /sampledByHole\(resolvedSegments\(excludeQAQC\(assays\), shellEl/);
  assert.ok(s.includes('tr("Sampled for {el} (m)", { el: shellEl })'));
  assert.ok(s.includes("have no {el} sample: there the shell is the estimate's reach, not a measured grade."));
  assert.match(fs.readFileSync(path.join(root, "src", "modules", "viewer", "modellingRuns.js"), "utf8"), /tool: "numeric grade shell",[^\n]*\n?[^\n]*element: symbol/);
});
