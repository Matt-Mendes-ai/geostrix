// TASKS.csv #1379 / #1380 — classification diagrams say when their fields are not drawn; volcanic classifiers skip logged sediments
import { test } from "node:test";
import assert from "node:assert/strict";
import { DIAGRAMS, GEOCHEM_METHODS, isSedimentaryCode, loggedCodeAt } from "../src/lib/geochemDiagrams.js";

test("#1379: the four diagrams without fields are flagged, and no caption describes fields that are not drawn", () => {
  for (const id of ["jensen", "thnbyb", "tizry", "thhfta"]) assert.equal(DIAGRAMS[id].noFields, true, id);
  assert.ok(!/A=island-arc/.test(DIAGRAMS.tizry.caption));
  for (const d of Object.values(DIAGRAMS)) if (d.fields?.length) assert.ok(!d.noFields, d.id);
});

test("#1380: Jensen and Winchester are volcanic-only; sediment and carbonate codes are recognised, volcanic ones are not", () => {
  assert.ok(GEOCHEM_METHODS.litho_jensen.volcanicOnly && GEOCHEM_METHODS.litho_winchester.volcanicOnly);
  assert.ok(!GEOCHEM_METHODS.alteration_boxplot.volcanicOnly);
  for (const c of ["LMST", "DLST", "SLST", "SNDST", "SHALE", "argillite", " lst "]) assert.ok(isSedimentaryCode(c), c);
  for (const c of ["BAS", "AND", "RHY", "MSULF", "YBR", "VBX", "", null]) assert.ok(!isSedimentaryCode(c), String(c));
  const lith = new Map([["H1", [{ from: 0, to: 10, value: "LMST" }, { from: 10, to: 20, value: "BAS" }]]]);
  assert.equal(loggedCodeAt({ hole_id: "H1", from: 2, to: 4 }, lith), "LMST");
  assert.equal(loggedCodeAt({ hole_id: "H1", from: 9, to: 13 }, lith), "BAS");
  assert.equal(loggedCodeAt({ hole_id: "H2", from: 0, to: 1 }, lith), null);
});
