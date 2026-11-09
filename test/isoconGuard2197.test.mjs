// TASKS.csv #2197 (review #2174, WA gold) — Isocon on a one-element project says at once that it cannot run
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("#2197 the guard, the no-immobile warning and the ribbon's reason", () => {
  const t = readFileSync(new URL("../src/components/IsoconTool.jsx", import.meta.url), "utf8");
  assert.match(t, /if \(concSymbols\.length < 2\) \{/);
  assert.match(t, /there is nothing to calculate/);
  assert.match(t, /None of Al, Ti, Zr, Nb or Y is in this project's assays/);
  // the early return comes after every hook (the rules of hooks)
  const ret = t.indexOf("if (concSymbols.length < 2) {"), lastHook = Math.max(t.lastIndexOf("useMemo("), t.lastIndexOf("useState("), t.lastIndexOf("useEffect("));
  assert.ok(lastHook < ret, "no hook after the early return");
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /label="Isocon"[^\n]*disabled=\{assayElements\.filter\(\(e\) => !e\.calculated\)\.length < 2\}/);
});
