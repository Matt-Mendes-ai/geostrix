// TASKS.csv #1498 — the pit shells are listed in Mine Design with show / hide, edit (re-run replaces) and remove
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pane = readFileSync(new URL("../src/components/PitShellPane.jsx", import.meta.url), "utf8");

test("every pit has an eye, Edit and Remove", () => {
  assert.match(pane, /const pits = surfaces\.filter\(\(s\) => s\.type === "pit_shell"\);/);
  assert.match(pane, /onClick=\{\(\) => onToggle\?\.\(s\.id\)\}/);
  assert.match(pane, /onClick=\{\(\) => editPit\(s\)\}/);
  assert.match(pane, /onClick=\{\(\) => removePit\(s\)\}/);
  assert.match(pane, /confirmDestructive\(tr\("Remove the pit/);
});

test("Edit loads the saved inputs; the next run replaces the edited pit", () => {
  assert.match(pane, /const inp = s\.params\?\.inputs \|\| \{\};/);
  assert.match(pane, /if \(editingId\) \{ onRemove\?\.\(editingId\); setEditingId\(null\); \}/);
  assert.match(pane, /editing \? tr\("Run and replace the pit"\) : tr\("Run the pit shell"\)/);
});

test("the 3D View passes removeImplicitSurface", () => {
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /<PitShellPane surfaces=\{implicitSurfaces\} onAdd=\{addUndrilledSolid\} onToggle=\{toggleImplicitSurface\} onRemove=\{removeImplicitSurface\}/);
});
