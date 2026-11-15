// TASKS.csv #3573 (Fireweed rehearsal) — silver was 'Ag (ppm)' in the 3D legend, the hover, Identify and the strip log, and 'Ag (g/t)' in the Fence diagram's track list: the track now says the
// unit the file has, or the one the project shows the element in ('Show in', #3236), and its values follow it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { numericTrackSources, numericTrackRows } from "../src/lib/fenceTrack.js";

const assays = [{ hole_id: "H", from: 0, to: 1, values: { Ag: 2.5, Pb: 0.4, Au: 1.2 } }, { hole_id: "H", from: 1, to: 2, values: { Ag: 10, Pb: 1.1, Au: 0.2 } }];
const assayElements = [{ symbol: "Ag", unit: "ppm" }, { symbol: "Pb", unit: "%" }, { symbol: "Au", unit: "ppm" }];

test("the track list names the unit the file has: Ag (ppm), Pb (%), Au (ppm), as the legend and the strip log do", () => {
  const t = numericTrackSources({ assays, assayElements });
  assert.deepEqual(t.map((x) => x.label), ["Ag (ppm)", "Pb (%)", "Au (ppm)"]);
  assert.equal(t[0].shown, undefined, "no conversion when none is chosen");
});

test("the unit the project shows the element in (Show in) is used, and the values follow it", () => {
  const t = numericTrackSources({ assays, assayElements, displayUnits: { Ag: "ppb", Pb: "ppm" } });
  assert.deepEqual(t.map((x) => x.label), ["Ag (ppb)", "Pb (ppm)", "Au (ppm)"]);
  const ag = numericTrackRows(t[0], ["H"], assays);
  assert.deepEqual(ag.byHole.H.map((r) => r.v), [2500, 10000], "ppm -> ppb: x1000");
  const pb = numericTrackRows(t[1], ["H"], assays);
  assert.deepEqual(pb.byHole.H.map((r) => r.v), [4000, 11000], "% -> ppm: x10,000");
  assert.deepEqual(numericTrackRows(t[2], ["H"], assays).byHole.H.map((r) => r.v), [1.2, 0.2], "an element with no choice: as stored");
  // a unit the table cannot convert is shown as stored
  assert.equal(numericTrackSources({ assays, assayElements: [{ symbol: "Fe", unit: "% Fe2O3" }], displayUnits: { Fe: "ppm" } })[0].label, "Fe (% Fe2O3)");
});

test("wired: the Fence diagram passes the project's display units", () => {
  const m = fs.readFileSync(new URL("../src/components/FenceDiagramModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /displayUnits: fenceProject\?\.displayUnits/);
});
