// TASKS.csv #2522 — an interpretation line was deleted at one click with nothing to bring it back, and with no terrain the pane sent the user
// to an Elev. box on a card this tab does not have. Restore puts the last removed line back; the pane has its own Elev. box.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interpretationLayer, addInterpretationLine, removeInterpretationLine, restoreInterpretationLine } from "../src/lib/interpretation.js";

const line = (x0) => [{ x: x0, y: 0, z: 256 }, { x: x0 + 100, y: 50, z: 256 }];

test("a removed line comes back at its place, with its attributes and the bbox", () => {
  let L = interpretationLayer("Interpretation", "");
  L = addInterpretationLine(L, line(0), { name: "A", type: "contact" }, { elevation: 256 });
  L = addInterpretationLine(L, line(500), { name: "B", type: "fault" });
  L = addInterpretationLine(L, line(1000), { name: "C", type: "fault" });
  const f = L.features[1];
  const R = removeInterpretationLine(L, 1);
  assert.deepEqual(R.features.map((x) => x.attributes.name), ["A", "C"]);
  const back = restoreInterpretationLine(R, 1, f);
  assert.deepEqual(back.features.map((x) => x.attributes.name), ["A", "B", "C"]);
  assert.deepEqual(back.features[1], f);
  assert.deepEqual(back.bbox, L.bbox);
  assert.equal(back.elevation, 256);
  assert.equal(restoreInterpretationLine(R, 99, f).features.at(-1).attributes.name, "B", "an index past the end appends");
  assert.equal(restoreInterpretationLine(R, 0, null), R);
});

test("the pane: Restore after a delete, an Elev. box when the lines lie flat", () => {
  const s = readFileSync(new URL("../src/components/InterpretPane.jsx", import.meta.url), "utf8");
  assert.match(s, /setRemoved\(\{ layerId: layer\.id, index: i, feature: layer\.features\[i\] \}\)/);
  assert.match(s, /restoreInterpretationLine\(L, removed\.index, removed\.feature\)/);
  assert.match(s, /tr\("Restore \\"\{name\}\\""/);
  assert.match(s, /updateMapLayer\(layer\.id, \(l\) => \(\{ \.\.\.l, elevation: Number\(v\) \}\)\)/);
  assert.match(s, /plan \? \{ elevation: elevNow \} : \{\}/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["Elev. (m RL)"], l);
});
