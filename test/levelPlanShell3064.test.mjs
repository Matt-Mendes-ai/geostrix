// TASKS.csv #3064 (#2900, WA iron) — opening the Level plan showed nothing for 2-3 s: the RL pick and the first plan are full
// builds, and they now run after a frame, behind a shell that says it is building (the empty plan has no frame, so the
// window used to render nothing until the build landed).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const s = fs.readFileSync(new URL("../src/components/LevelPlanWindow.jsx", import.meta.url), "utf8");

test("the first build runs after a frame, and the shell paints before it", () => {
  assert.match(s, /const f = requestAnimationFrame\(\(\) => \{\r?\n\s+const r0 = Math\.round\(defaultRl\);/); // #3137: then a sliced holes-only pass
  assert.match(s, /const data = plan \|\| empty;/, "no full build in the first render: the plan comes from the sliced build");
  const shell = s.indexOf("if (!ready || !plan) return (");
  assert.ok(shell > 0 && shell < s.indexOf("if (!frame) return null;"), "the building shell comes before the no-frame guard");
  assert.match(s.slice(shell, shell + 1200), /role="status"[^>]*>\{tr\("Building the plan at the RL most holes cross…"\)\} <span ref=\{statusRef\} \/>/);
});

test("the same RL is not built twice on open", () => {
  assert.match(s, /setApplied\(\(p\) => \(p\.rl === rl && p\.half === half \? p : \{ rl, half \}\)\)/);
});
