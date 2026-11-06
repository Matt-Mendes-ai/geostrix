// TASKS.csv #1422 — readable legend stops (every classify method, and the stops shown in both legend editors); #1433 — the Geophysics
// legend editor and the inversion steps fit the sidebar
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readableValues, classifyBreaks } from "../src/lib/layers.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("readableValues: three significant figures, more only where neighbours would merge", () => {
  assert.deepEqual(readableValues([-0.0016246751309963797, 0.12831663191540246, 2.077436237611385]), [-0.00162, 0.128, 2.08]);
  assert.deepEqual(readableValues([0.4141875074174799, 0.8299996899659562]), [0.414, 0.83]);
  assert.deepEqual(readableValues([1.2341, 1.2349, 1.24]), [1.234, 1.235, 1.24]); // 3 s.f. would merge the first two: 4
  assert.deepEqual(readableValues([0, 5, 5, 10]), [0, 5, 5, 10]); // equal values stay equal; zero stays zero
  assert.deepEqual(readableValues([1, NaN, 3]), [1, NaN, 3]);
});

test("classifyBreaks: every method gives readable breaks; the first (the minimum) stays exact", () => {
  const vals = Array.from({ length: 500 }, (_, i) => -0.0016246751309963797 + (i / 499) * 2.0790609126);
  for (const m of ["equal", "quantile", "normal", "jenks"]) {
    const b = classifyBreaks(vals, 5, m);
    assert.equal(b[0], vals[0], m);
    assert.ok(b.slice(1).every((v) => String(v).length <= 8), `${m}: ${JSON.stringify(b)}`);
    assert.deepEqual([...b].sort((x, y) => x - y), b, `${m} in order`);
  }
  const lg = classifyBreaks(Array.from({ length: 200 }, (_, i) => 0.01 * 1.05 ** i), 6, "log");
  assert.ok(lg.slice(1).every((v) => String(v).length <= 8), JSON.stringify(lg));
});

test("both legend editors show the stops rounded and keep what is typed (StopValueInput)", () => {
  const c = read("../src/components/StopValueInput.jsx");
  assert.match(c, /setText\(\(t\) => \(t !== "" && Number\(t\) === value \? t : String\(shown \?\? value\)\)\)/);
  assert.match(c, /if \(t\.trim\(\) !== "" && Number\.isFinite\(v\)\) onCommit\(v\);/);
  const g = read("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /const shown = useMemo\(\(\) => readableValues\(\[\.\.\.stops\.map\(\(s\) => s\.value\), model\.max\]\), \[stops, model\.max\]\);/);
  assert.match(g, /<StopValueInput value=\{s\.value\} shown=\{shown\[i\]\} onCommit=\{\(v\) => updateStop\(i, \{ value: v \}\)\}/);
  assert.match(g, /tr\("to \{v\}", \{ v: shown\[i \+ 1\] \}\) : tr\("to \{max\} \(max\)", \{ max: shown\[stops\.length\] \}\)/);
  assert.ok(g.includes('{tr("Recolour")}') && !g.includes('tr("Recolor")'));
  const n = read("../src/components/NumericSymbologyEditor.jsx");
  assert.match(n, /<StopValueInput value=\{s\.value\} shown=\{shown\[i\]\}/);
});

test("#1433 the palette list shows short names, inputs may shrink, inversion steps fit", () => {
  const g = read("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /<option key=\{key\} value=\{key\} title=\{p\.label\}>\{p\.label\.split\(" — "\)\[0\]\}<\/option>/);
  assert.match(g, /const numInput = \{ flex: 1, minWidth: 0 \/\* #1433 \*\//);
  assert.match(read("../src/components/InversionPanel.jsx"), /margin: "8px 0 0", minWidth: 0 \/\* #1433/);
});
