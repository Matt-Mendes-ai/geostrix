// TASKS.csv #4070 — the follow-ups from side 2's consistency pass (2026-11-25): the house run labels (Build + what; Compute for an index or score; Find for a search),
// no typed "+", Fine-tune for settings and Details for a result's notes, one step pane on the Geological Mapping tab at a time, the tab home's Help links.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
test("run labels: a model-making primary says Build + what (Implicit: Build surfaces, Structures: Build structures), no typed '+' on Add hole / New group", () => {
  const i = read("src/modules/viewer/panes/ImplicitPane.jsx"), st = read("src/modules/viewer/panes/StructuralPane.jsx");
  assert.match(i, /label: implicitBusy \? tr\("Building surfaces…"\) : tr\("Build surfaces"\)/);
  assert.match(st, /label: implicitBusy \? tr\("Building structures…"\) : tr\("Build structures"\)/);
  assert.match(read("src/components/PlannedHoleParts.jsx"), /label: tr\("Add hole"\), onClick: submit/);
  assert.match(read("src/modules/viewer/panes/LithoGroupsPane.jsx"), /label: tr\("New group"\)/);
  assert.doesNotMatch(i + st + read("src/components/PlannedHoleParts.jsx") + read("src/modules/viewer/panes/LithoGroupsPane.jsx"), /tr\("\+ (Add hole|New group)"\)|tr\("Run"\)/);
});

test("folds: Details holds a result's notes (Undrilled zones), the step is Coverage; Pit design carries the conceptual line; the map step panes hide under Unit polygons / Interpret and the tab home has its Help links", () => {
  const u = read("src/components/UndrilledZonesPane.jsx"), d = read("src/components/PitDesignPane.jsx"), v = read("src/modules/ViewerModule.jsx"), m = read("src/components/SurfaceMappingPanel.jsx");
  assert.match(u, /<MoreFold summary=\{tr\("Details"\)\} data-fine-tune="undrilled-notes">/);
  assert.match(u, /key: "cover", label: tr\("Coverage"\)/);
  assert.match(d, /tr\("Conceptual: not a mine plan, a Reserve or a Resource\."\)/);
  assert.match(v, /<div hidden=\{!!interpretOpen\}>/);
  assert.match(m, /\{part == null && <HelpLink id="geology-map"/);
  assert.match(m, /\{part == null && <HelpLink id="outcrop-structures"/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const t = JSON.parse(read(`src/locales/${lang}.json`));
    for (const k of ["Build surfaces", "Build structures", "Building surfaces…", "Building structures…", "Add hole", "New group", "Conceptual: not a mine plan, a Reserve or a Resource."]) assert.ok(t[k], `${lang}: ${k}`);
  }
});
