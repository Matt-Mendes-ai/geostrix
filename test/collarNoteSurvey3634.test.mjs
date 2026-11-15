// TASKS.csv #3634 — every tool that shows CollarLevelsNote passes the survey too, so #3551's upward / station check reaches its note (the Estimation modal did since #3589)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { collarLevelsText } from "../src/lib/collarLevelsText.js";

const read = (f) => fs.readFileSync(new URL(`../src/components/${f}.jsx`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the note says a hole that starts upward only in the survey is left out of the ground", () => {
  const surf = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) surf.push({ hole_id: `S${i}-${j}`, x: i * 50, y: j * 50, z: 1000 });
  const all = [...surf, { hole_id: "UP1", x: 105, y: 105, z: 850 }], survey = [{ hole_id: "UP1", depth: 0, azimuth: 0, dip: -20 }];
  assert.match(collarLevelsText(all, survey), /1 collar\(s\) look like underground drilling: 0 by their hole type .*, 1 starting upward/);
  assert.doesNotMatch(String(collarLevelsText(all)), /underground drilling/, "without the survey the note cannot know");
});

test("all ten users pass the survey (source pins)", () => {
  for (const f of ["DesignLinesPane", "DesignStringsPane", "DumpPane", "NestedPitsPane", "PitDesignPane", "PitShellPane", "StopesPane", "UndrilledZonesPane", "PlannedHoleParts", "GradeEstimationModal"])
    assert.match(read(f), /<CollarLevelsNote collars=\{(collars|levelCollars)\} survey=\{survey\}/, f);
  for (const f of ["DesignStringsPane", "DumpPane", "StopesPane"]) assert.match(read(f), /survey = \[\][^\n]*(useStore|#3634)/, f + " reads the survey from the store");
});
