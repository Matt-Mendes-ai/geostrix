// TASKS.csv #1779 (review #1646, Kodiak) — window.prompt throws in Electron: no component calls it; the in-app prompt hook is used
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(jsx?|mjs)$/.test(f) ? [p] : []; });

test("no window.prompt( call left in src (comments aside)", () => {
  const hits = walk("src").filter((f) => readFileSync(f, "utf8").split("\n").some((l) => /window\.prompt\(/.test(l) && !/^\s*\/\//.test(l) && !/\/\/.*window\.prompt\(/.test(l)));
  assert.deepEqual(hits, []);
});

test("the three former callers use usePrompt and render its modal", () => {
  for (const f of ["src/modules/GeophysicsModule.jsx", "src/components/LevelPlanWindow.jsx", "src/components/BoundaryInterceptsModal.jsx"]) {
    const s = readFileSync(f, "utf8");
    assert.ok(s.includes("const [askPrompt, promptEl] = usePrompt();") && s.includes("{promptEl}"), f);
  }
});
