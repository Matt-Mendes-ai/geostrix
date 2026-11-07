// TASKS.csv #1720 (review #1645, Copley) — the import review's state stays referenced by React's previous render of the panel until it
// renders again, and its rows reach every parsed table: the tables, the rows and the queue are emptied in place once the review is
// answered, on Cancel and after the chosen tables are added.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");

test("the review's tables are released on both answers", () => {
  assert.ok(s.includes("const release = () => { for (const t of tables) { t.layers.length = 0; t.items.length = 0; } rows.length = 0; queued.length = 0; };"));
  assert.ok(s.includes("if (!chosen) { release(); setBusy(false); setMapMsg(null); return; } // Cancel: nothing changes"));
  const i = s.indexOf("for (const t of tables) if (keep.has(t.name)) for (const q of t.items) addNow(q.parsed, q.sourceName, q.opts);");
  assert.ok(i > 0 && s.slice(i, i + 160).includes("release();"), "after the chosen tables are added");
});
