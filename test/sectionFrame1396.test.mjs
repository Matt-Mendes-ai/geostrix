// TASKS.csv #1396 — a hole beyond the section frame: its depth ticks, depth numbers, EOH and offset labels are not drawn over the axis
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("every depth tick and float label of a drilled or planned hole is guarded by the plot frame", () => {
  const s = fs.readFileSync("src/components/SectionWindow.jsx", "utf8");
  assert.match(s, /const inPlot = \(\[x, y\]\) => x >= PAD/);
  assert.equal((s.match(/if \(!inPlot\(\[x, y\]\)\) continue;/g) || []).length, 2, "drilled and planned depth ticks");
  for (const key of ["eoh${hi}", "peoh${i}", "off${hi}"]) {
    const at = s.indexOf("key: `" + key + "`");
    assert.ok(at > 0, key);
    assert.match(s.slice(at - 60, at), /inPlot\(/, `${key} is placed only inside the frame`);
  }
});
