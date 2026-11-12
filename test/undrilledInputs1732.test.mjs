// TASKS.csv #1732 — Undrilled zones reopened with its last result also brings back the unit and the settings that result was made with
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the result keeps its inputs and the pane starts from them when the unit still exists", () => {
  const p = fs.readFileSync("src/components/UndrilledZonesPane.jsx", "utf8");
  assert.match(p, /const inputs = \{ unitId, coverM, cellText, insideOnly, withPlanned, minText \}/); // kept in the result (#2258: set when the worker answers)
  assert.match(p, /underground: ug\?\.underground \? ug : null, inputs \/\* #1732 \*\//);
  assert.match(p, /const was = lastResult\?\.inputs && solids\.some\(\(s\) => s\.id === lastResult\.inputs\.unitId\) \? lastResult\.inputs : null;/);
  for (const [state, init] of [["unitId", 'was?.unitId ?? ""'], ["coverM", "was?.coverM ?? defaultCoverM(siteSpacing)"], ["cellText", 'was?.cellText ?? ""'], ["insideOnly", "was?.insideOnly ?? false"], ["withPlanned", "was?.withPlanned ?? false"], ["minText", 'was?.minText ?? ""']]) {
    assert.ok(p.includes(`const [${state}, set${state[0].toUpperCase()}${state.slice(1)}] = useState(() => ${init});`), state);
  }
});
