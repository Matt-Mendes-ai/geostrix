// TASKS.csv #1131 — step a section by exactly ± its buffer
import { test } from "node:test";
import assert from "node:assert/strict";
import { stepSection } from "../src/lib/sectionDigitise.js";

const cur = { id: "a", ax: 0, ay: 0, bx: 100, by: 0, azimuth: 90, corridor: 25 }; // east-west; left-hand normal = north
test("#1131 exact step moves the line by the buffer, ignoring a farther saved parallel section", () => {
  const far = { id: "b", ax: 0, ay: 100, bx: 100, by: 100, azimuth: 90 };
  const r = stepSection(cur, [cur, far], 1, { fallback: 25, exact: true });
  assert.deepEqual([r.create.ay, r.create.by, r.offset], [25, 25, 25]);
  const back = stepSection(cur, [cur, far], -1, { fallback: 25, exact: true });
  assert.equal(back.create.ay, -25);
  assert.equal(stepSection(cur, [cur, far], 1, { fallback: 25 }).existing.id, "b"); // the old step still goes to the saved one
});
test("#1131 exact step reuses a saved parallel section that sits at that offset", () => {
  const at = { id: "c", ax: 0, ay: 25.4, bx: 100, by: 25.4, azimuth: 90 };
  assert.equal(stepSection(cur, [cur, at], 1, { fallback: 25, exact: true }).existing.id, "c");
});

test("#1131 stepped sections are named by their total offset", async () => {
  const { steppedSectionName } = await import("../src/lib/sectionDigitise.js");
  assert.deepEqual([steppedSectionName("Section 39°", 50), steppedSectionName("Section 39° +50 m", 100), steppedSectionName("Section 39° +50 m +100 m", -40), steppedSectionName("Section 39° +50 m", -50), steppedSectionName("L2 -25 m", -25)],
    ["Section 39° +50 m", "Section 39° +150 m", "Section 39° +110 m", "Section 39°", "L2 -50 m"]);
});
