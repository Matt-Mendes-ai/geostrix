// TASKS.csv #3926 — the comma-friendly NumberInput rollout, groups G5 (mine design and economics) and G6 (layout, page and appearance): every number box
// in these files reads '0,05' as 0.05 (components/NumberInput.jsx, lib/parseDecimal.js). Source checks per file, plus the adapter's round trip.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDecimal } from "../src/lib/parseDecimal.js";

const rd = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const FILES = {
  // G5
  "components/PitShellPane.jsx": 11, "components/DesignLinesPane.jsx": 7, "components/DesignStringsPane.jsx": 4, "components/PitDesignPane.jsx": 3,
  "components/StopesPane.jsx": 3, "components/NestedPitsPane.jsx": 2, "components/DumpPane.jsx": 1,
  // G6
  "modules/LayoutModule.jsx": 31, "components/DatabaseConnectModal.jsx": 1, "components/DrillPlanColourControls.jsx": 1,
  "modules/viewer/CollarSizeControl.jsx": 1, "modules/viewer/TubeSizeControl.jsx": 1,
};
const tags = (s) => [...s.matchAll(/<NumberInput\b[\s\S]*?\/>/g)].map((m) => m[0]);

test("no browser number box is left in G5 and G6; each file imports NumberInput and has its boxes", () => {
  let total = 0;
  for (const [f, n] of Object.entries(FILES)) {
    const s = rd(f);
    assert.doesNotMatch(s, /type="number"/, f);
    assert.match(s, /^import NumberInput from "(\.\/|\.\.\/components\/|\.\.\/\.\.\/components\/)NumberInput\.jsx"; \/\/ TASKS\.csv #3926$/m, f);
    assert.equal(tags(s).length, n, f);
    total += n;
  }
  assert.equal(total, 66); // 31 + 35, as the rollout plan counted
});

test("each box hands its number to the pane: through asEvent (the pane reads e.target.value) or a (v) => handler; no step 'any' for the arrow keys", () => {
  for (const f of Object.keys(FILES)) {
    for (const t of tags(rd(f))) {
      assert.match(t, /onChange=\{(asEvent\(|\(v\) => )/, `${f}: ${t.slice(0, 90)}`);
      assert.doesNotMatch(t, /step="any"|defaultValue|onBlur=/, `${f}: ${t.slice(0, 90)}`);
    }
  }
});

test("the adapter: '0,05' and '0.05' reach the pane as the same text; an emptied box as ''", () => {
  const src = rd("components/PitShellPane.jsx");
  const line = src.match(/^const asEvent = .*$/m)[0];
  const asEvent = new Function(`${line.replace("const asEvent =", "return")}`)();
  const got = [];
  const set = (e) => got.push(e.target.value);
  for (const typed of ["0,05", "0.05", "1,5", ""]) { const r = parseDecimal(typed); asEvent(set)(r.empty ? null : r.value); }
  assert.deepEqual(got, ["0.05", "0.05", "1.5", ""]);
  assert.equal(parseDecimal("1.234,5").ok, false); // refused, never guessed
});

test("blank keeps its meaning only where a pane gives it one; elsewhere an emptied box goes back to its value", () => {
  const L = rd("modules/LayoutModule.jsx");
  const allow = tags(L).filter((t) => /allowEmpty/.test(t));
  assert.equal(allow.length, 5); // threshold, legend W and H (auto), grid spacing (none), fixed plot scale (free)
  for (const t of allow) assert.match(t, /e\.target\.value === ""|const n = v \|\| 0/);
  assert.doesNotMatch(rd("modules/viewer/CollarSizeControl.jsx"), /allowEmpty/);
  assert.doesNotMatch(rd("modules/viewer/TubeSizeControl.jsx"), /allowEmpty/);
  // the design cells still commit on leaving, and a refused number puts the stored one back (#1363)
  for (const f of ["components/DesignLinesPane.jsx", "components/DesignStringsPane.jsx"]) assert.match(rd(f), /onChange=\{\(v\) => \{ if \(v !== \(value \?\? null\) && onCommit\(v\) === false\) setReset\(\(k\) => k \+ 1\); \}\}/);
  // a typed fixed plot scale still rescales the viewport when it is committed (#1007)
  assert.match(L, /onChange=\{\(v\) => \{ const n = v \|\| 0; if \(n > 0 && sel\.capturedFixedScale !== n\) onRescale\(n\);/);
});
