// TASKS.csv #1717 (review #1645, Copley) — the map import review lists each table of a file as its own row
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#1717 rows are keyed by file and table name, not by file alone", () => {
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.ok(p.includes("const keyOf = (q) => (q.parsed.name ? `${q.sourceName} — ${q.parsed.name}` : q.sourceName);"));
  assert.ok(!p.includes("byTable.get(q.sourceName)"), "the old per-file key is gone");
});
