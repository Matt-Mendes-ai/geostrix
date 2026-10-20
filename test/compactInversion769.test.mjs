// TASKS.csv #769 — a compact (sparse-norm) inversion is named and described as compact, never as "smooth".
import test from "node:test";
import assert from "node:assert/strict";
import { resultToVoxelModel } from "../src/lib/inversion.js";

const cells = { value: [0.01], x: [0], y: [0], z: [0], dx: [25], dy: [25], dz: [25], support: [1] };

test("compact result is labelled compact", () => {
  const m = resultToVoxelModel({ method: "mag", style: "compact", cells }, { surveyName: "s" });
  assert.match(m.name, /compact inversion of s/);
  assert.equal(m.style, "compact");
});

test("results without a style (older engines, saved sections) stay smooth", () => {
  const m = resultToVoxelModel({ method: "grav", cells }, { surveyName: "s" });
  assert.match(m.name, /smooth inversion of s/);
  assert.equal(m.style, "smooth");
});
