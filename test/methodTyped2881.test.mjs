// TASKS.csv #2881 (split from #2772) — QAQC: a detection limit typed per joined method column (saved with the element), used for the
// per-method blank judging instead of the one read from that column's '<' results
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { methodBlankLimits } from "../src/lib/qaqc.js";

test("a typed limit replaces the read one in the per-method blank limits; the others stay as read", () => {
  const read = [{ method: "Cu_ICP", n: 50, limit: 0.5, basis: "lt" }, { method: null, n: 30, limit: 2, basis: "lt" }];
  const typed = { Cu_ICP: 1 };
  const eff = read.map((m) => { const t = typed[m.method ?? ""]; return t > 0 ? { ...m, limit: t, typed: true, read: m.limit } : m; });
  const lim = methodBlankLimits(eff, 5);
  assert.equal(lim.get("Cu_ICP"), 5, "5 x the typed 1");
  assert.equal(lim.get(null), 10, "5 x the read 2");
});

test("wiring: the typed limits are stored on the element and laid over the read ones; one box per method column", () => {
  const q = readFileSync(new URL("../src/components/QAQCPanel.jsx", import.meta.url), "utf8");
  assert.match(q, /const typedByMethod = assayElements\.find\(\(e\) => e\.symbol === symbol\)\?\.methodLimits \|\| null;/);
  assert.match(q, /const t = typedByMethod\?\.\[m\.method \?\? ""\]; return t > 0 \? \{ \.\.\.m, limit: t, typed: true, read: m\.limit \} : m;/);
  assert.match(q, /if \(v > 0\) ml\[method \?\? ""\] = v; else delete ml\[method \?\? ""\];/);
  assert.match(q, /aria-label=\{tr\("Detection limit of \{method\}", \{ method: m\.method \?\? tr\("main column"\) \}\)\}/);
});
