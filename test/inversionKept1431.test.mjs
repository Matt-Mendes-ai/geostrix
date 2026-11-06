// TASKS.csv #1431 — an inversion's or forward model's fit ("Did it fit?") vanished on any pane switch: the result was the
// panel's own useState. It is kept per project now (keptState), written to the run's own project even when the pane closed first.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { keptIn } from "../src/lib/keptState.js";

const src = readFileSync(new URL("../src/components/InversionPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the last result is kept state, not the panel's own", () => {
  assert.match(src, /const \[lastResult, setLastResultState\] = useKeptState\(keptScope, "inversion\.lastResult", null\);/);
  assert.ok(!/const \[lastResult, setLastResult\] = useState\(/.test(src));
  assert.match(src, /const setLastResult = \(v, scope = keptScope\) => \{ keptIn\(scope\)\.set\("inversion\.lastResult", v\); if \(scope === scopeNow\.current\) setLastResultState\(v\); \};/);
});

test("a pane opened again picks up a run that finished while it was closed", () => {
  const i = src.indexOf('const running = job?.status?.state === "running";');
  const eff = src.slice(i, i + 400);
  assert.match(eff, /if \(running\) return;\n\s*const kept = keptIn\(keptScope\)\.get\("inversion\.lastResult"\);\n\s*if \(kept && kept !== lastResult\) setLastResultState\(kept\);\n\s*\}, \[running, keptScope\]\);/);
  // the job runner calls onDone before its last emit, so the kept value is there when `running` turns false
  const jobs = readFileSync(new URL("../src/lib/inversionJobs.js", import.meta.url), "utf8");
  assert.match(jobs, /onDone\?\.\(r\.data, job\);[\s\S]{0,450}emit\(\);/);
});

test("keptIn: one project's result does not show in another's", () => {
  keptIn("t1431:a").set("inversion.lastResult", { id: 1 });
  assert.equal(keptIn("t1431:b").get("inversion.lastResult"), undefined);
  assert.deepEqual(keptIn("t1431:a").get("inversion.lastResult"), { id: 1 });
});
