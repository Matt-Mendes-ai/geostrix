// TASKS.csv #2170 — the drillhole scene rebuild after a commit: no per-hole scan of the trace list (O(holes²): 11.8 s at 20,544 holes),
// and old materials disposed after the new scene has drawn, only when unused (disposing first recompiled every shader: about 5 s)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { viewerSource } from "./helpers/viewerSource.mjs"; // #2176 — the drillhole build moved out of ViewerModule

const src = viewerSource().replace(/\r\n/g, "\n");

test("the trace list is indexed once per rebuild, not filtered per hole", () => {
  assert.ok(!src.includes("tracesRef.current = tracesRef.current.filter((t) => t.hole_id !== c.hole_id);"));
  assert.ok(src.includes("const traceById = new Map(tracesRef.current.map((t) => [t.hole_id, t]));"));
  assert.ok(src.includes("traceById.delete(c.hole_id);\n    traceById.set(c.hole_id, e.trace);"), /* #2176: the hole's kept trace entry */"delete + set keeps the old order (a rebuilt hole moves to the end)");
  assert.ok(src.includes("tracesRef.current = [...traceById.values()];"));
});

test("old materials are disposed later, and only those no new object uses", () => {
  const i = src.indexOf("const oldMats = [];");
  assert.ok(i > 0);
  const block = src.slice(i, i + 900);
  assert.ok(block.includes("if (c.material) oldMats.push(c.material);"));
  assert.ok(!block.includes("c.material?.dispose?.();"), "no immediate material dispose");
  assert.ok(block.includes("c.material?.map?.dispose?.();"), "textures are still freed at once (#131)");
  assert.match(block, /setTimeout\(\(\) => \{ const live = new Set\(\);[^]*?if \(!live\.has\(m\)\) m\.dispose\?\.\(\);[^]*?\}, 1500\);/);
});
