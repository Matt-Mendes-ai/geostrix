// TASKS.csv #2285 (review #2174, WA gold) — Dump / stockpile lists its dumps with show / hide, Edit (the next run replaces it) and remove.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("#2285 ViewerModule passes show / hide and remove to the dump pane, as to the pit panes", () => {
  assert.match(read("src/modules/ViewerModule.jsx"), /<DumpPane surfaces=\{implicitSurfaces\} onAdd=\{addUndrilledSolid\} onToggle=\{toggleImplicitSurface\} onRemove=\{removeImplicitSurface\}/);
});

test("#2285 the pane lists its dumps; Edit puts the run's inputs back and the next run replaces that dump; remove asks", () => {
  const p = read("src/components/DumpPane.jsx");
  assert.match(p, /const dumps = useMemo\(\(\) => surfaces\.filter\(\(s\) => s\.type === "dump"\), \[surfaces\]\);/);
  assert.match(p, /crestZ: val\(p\.crestZ\), repose: val\(p\.reposeDeg\), density: val\(p\.density\), swell: val\(p\.swell\)/);
  assert.match(p, /if \(editingId\) \{ onRemove\?\.\(editingId\); setEditingId\(null\); \}/);
  assert.match(p, /confirmDestructive\(tr\("Remove the dump/);
  assert.match(p, /<DumpRunList dumps=\{dumps\} editingId=\{editingId\} onToggle=\{onToggle\} onEdit=\{editDump\} onRemove=\{onRemove \? removeDump : null\} \/>/);
  // the params the Edit reads are the ones a run writes
  assert.match(p, /params: \{ tool: "dump \/ stockpile from a footprint[^}]*footprint: footprint\.name, crestZ: v\("crestZ"\), reposeDeg: v\("repose"\), density: v\("density"\), swell: v\("swell"\)/);
});
