// TASKS.csv #1613 (review #1497, Lawyers) — the pit pane's figures go when their pit is removed; a stale message goes on edit
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pane = readFileSync(new URL("../src/components/PitShellPane.jsx", import.meta.url), "utf8");
const viewer = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("the result keeps the id of the pit it describes and clears once that pit is gone", () => {
  assert.ok(pane.includes("const pitId = onAdd({"));
  assert.ok(pane.includes("if (pitId) { kept = { ...kept, pitId }; setRes(kept); }"));
  assert.ok(pane.includes("const resGone = !!res?.pitId && !surfaces.some((s) => s.id === res.pitId);"));
  assert.ok(pane.includes("if (resGone) { setRes(null);"));
  assert.match(viewer, /setImplicitSurfaces\(\(p\) => \[\.\.\.p, \{ id, name, visible: true, vertexCount[^\n]*\n\s*return id; \/\/ #1613/);
});

test("changing an input clears the previous run's message", () => {
  assert.ok(pane.includes("const set = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setMsg(null); };"));
});
