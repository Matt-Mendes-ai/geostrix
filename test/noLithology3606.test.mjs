// TASKS.csv #3606 (Fireweed rehearsal, Macpass: assays only, no logs) — Litho groups, Modelling codes and Correlation opened with live controls and no
// word that the project has no lithology (Implicit surface and Strat. stack said it); the cluster note said 'logged holes' with nothing logged.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the three panes lead with the no-lithology line; the cluster note says 'holes' with nothing logged", () => {
  const m = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const LINE = '{!litho_units.length && emptyPaneHint(tr("No lithology intervals loaded — import them on the StrixViewer tab (Add layer › Lithology), or load the sample project."))}{/* TASKS.csv #3606';
  for (const title of ["Modelling codes", "Lithology groups", "Section correlation"]) {
    const i = m.indexOf(`{paneHeader("${title}",`);
    assert.ok(i > 0, title);
    assert.ok(m.slice(i, i + 400).includes(LINE), `${title}: the line right under its header`);
  }
  assert.ok(m.includes('{(layers.litho || []).length ? tr("The {n} logged holes in the model area lie in'), "the logged wording only with lithology");
  assert.ok(m.includes(': tr("The {n} holes in the model area lie in {k} clusters'), "'holes' otherwise");
});
