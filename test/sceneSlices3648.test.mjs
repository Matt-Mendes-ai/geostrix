// TASKS.csv #3648 (from #3627 / #3544) — the drillhole scene built in slices in the 3D View: switching back to a project tab and the import queue's
// one held build were single long tasks (0.4-0.5 s at 1x on Macpass; ~2.4 s at 4x CPU). With ctx.slice the per-hole loop yields every ~40 ms; a
// newer build abandons an older one at its next slice; the scene's cache is dropped while a sliced build runs, so the next build is a full one.
// Without ctx.slice it runs straight through as before (an async function runs synchronously up to its first await). Live: the same render, byte
// for byte (Macpass, the same view); the tab switch's longest task 492 -> 311 ms.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the build: async, one hole per call, sliced only when asked, a newer build wins", () => {
  const s = readFileSync(new URL("../src/modules/viewer/drillholeScene.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /export async function buildDrillholeScene\(ctx\) \{/);
  assert.match(s, /const perHole = \(c\) => \{ \/\/ TASKS\.csv #3648/);
  assert.match(s, /if \(!ctx\.slice\) collars\.forEach\(perHole\);/);
  assert.match(s, /const token = \(buildTokens\.get\(groups\) \|\| 0\) \+ 1;\n\s+buildTokens\.set\(groups, token\);\n\s+sceneCaches\.delete\(groups\);/);
  assert.match(s, /if \(performance\.now\(\) - t0 > SLICE_MS && i < collars\.length - 1\) \{\n\s+await new Promise\(\(r\) => setTimeout\(r, 0\)\);\n\s+if \(buildTokens\.get\(groups\) !== token\) return;/);
  assert.equal((s.match(/^\s*await /gm) || []).length, 1, "the only await is the slice's: without ctx.slice nothing waits");
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /buildDrillholeScene\(\{ slice: true \/\* #3648 \*\/, /);
});
