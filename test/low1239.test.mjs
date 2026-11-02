import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fenceLabels } from "../src/lib/sectionDefs.js";
import { attitudeOf, attitudeAttrs, addInterpretationLine, interpretationLayer } from "../src/lib/interpretation.js";

test("#1255 a series labels every nth line, by the short name; other sections are not touched", () => {
  const fences = Array.from({ length: 51 }, (_, i) => ({ name: `Fence ${i + 1}/51 Line ${i * 100} m (az 60°, 100m)` }));
  const own = { name: "My section" };
  const map = fenceLabels([...fences, own]);
  assert.equal(map.has(own), false);
  const shown = fences.map((f) => map.get(f).label).filter(Boolean);
  assert.ok(shown.length <= 9, String(shown.length));
  assert.equal(shown[0], "Line 0 m");
  assert.ok(new Set(shown).size === shown.length);
  const few = [{ name: "Fence 1/3 612000E (az 0°, 100m)" }, { name: "Fence 2/3 612100E (az 0°, 100m)" }, { name: "Fence 3/3 612200E (az 0°, 100m)" }];
  assert.deepEqual(few.map((f) => fenceLabels(few).get(f).label), ["612000E", "612100E", "612200E"]);
});
test("#1239 attitude: by line type, optional, in range, and a field appears with its first value", () => {
  assert.equal(attitudeOf("fold_axis")[0], "plunge");
  assert.equal(attitudeOf("fault")[0], "dip");
  assert.equal(attitudeOf("other"), null);
  assert.deepEqual(attitudeAttrs("fold_axis", "25", "310"), { plunge: 25, plunge_dir: 310 });
  assert.deepEqual(attitudeAttrs("fault", "", "90"), { dip_dir: 90 });
  assert.deepEqual(attitudeAttrs("fault", "", ""), {});
  assert.deepEqual(attitudeAttrs("other", "25", "310"), {});
  assert.deepEqual(attitudeAttrs("fault", "95", ""), { error: true });
  assert.deepEqual(attitudeAttrs("fault", "x", ""), { error: true });
  assert.deepEqual(attitudeAttrs("fault", "", "361"), { error: true });
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
  const a = addInterpretationLine(interpretationLayer("x"), pts, { type: "lineament" });
  assert.ok(!a.fields.includes("plunge"));
  const b = addInterpretationLine(a, pts, { type: "fold_axis", attitude: { plunge: 25, plunge_dir: 310 } });
  assert.ok(b.fields.includes("plunge") && b.fields.includes("plunge_dir"));
  assert.equal(b.features[1].attributes.plunge, 25);
  assert.equal(b.features[0].attributes.plunge, undefined);
  const c = addInterpretationLine(b, pts, { type: "fold_axis", attitude: { plunge: 10 } });
  assert.equal(c.fields.filter((f) => f === "plunge").length, 1);
});
test("#1297 one focus ring; #1293 Export PDF and Report give up their labels first", () => {
  const css = readFileSync("src/styles/app.css", "utf8");
  assert.equal(css.split("outline: 2px solid").length - 1, 1);
  assert.match(css, /button:focus-visible, select:focus-visible, input:focus-visible/);
  assert.match(css, /\.ge-toolbar-snug \.ge-tool-label-first \{ display: none; \}/);
  const app = readFileSync("src/App.jsx", "utf8");
  assert.equal(app.split("ge-tool-label-first").length - 1, 2);
});
