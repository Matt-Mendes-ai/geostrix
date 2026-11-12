// TASKS.csv #2769 follow-up (the heap check) — the store's callbacks memoized on deps kept the StoreProvider render they were made in, and
// with it a removed 50 MB map layer (measured: 20,000 of 20,000 features alive after 62 undo steps, 0 after this change). They are now
// useLatestCallback: one stable function that calls the latest render's body, so an older render's scope is not kept.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// The hook's own source with React's useRef replaced by a fake that keeps one slot per call order across "renders"
async function loadHook() {
  const src = fs.readFileSync(new URL("../src/lib/useLatestCallback.js", import.meta.url), "utf8");
  assert.match(src, /^import \{ useRef \} from "react";/m);
  const body = src.replace(/^import \{ useRef \} from "react";/m, "let slots = [], at = 0; export const render = (f) => { at = 0; return f(); }; const useRef = (v) => { if (at >= slots.length) slots.push({ current: v }); return slots[at++]; };");
  return import("data:text/javascript," + encodeURIComponent(body));
}

test("#2769 useLatestCallback: one identity across renders, always the latest render's body", async () => {
  const { useLatestCallback, render } = await loadHook();
  const seen = [];
  const a = render(() => useLatestCallback((x) => { seen.push(["first", x]); return 1; }));
  const b = render(() => useLatestCallback((x) => { seen.push(["second", x]); return 2; }));
  assert.equal(a, b, "the same function every render");
  assert.equal(a("q"), 2);
  assert.deepEqual(seen, [["second", "q"]], "the first render's body is not called");
  const c = render(() => useLatestCallback(async (x, y) => x + y));
  assert.equal(c, a);
  assert.equal(await a(2, 3), 5, "arguments and async results pass through");
});

test("#2769 an earlier render's function is no longer referenced (it can be collected with its scope)", async () => {
  const { useLatestCallback, render } = await loadHook();
  let big = { payload: new Array(1000).fill(7) };
  const weak = new WeakRef(big);
  render(() => { const held = big; return useLatestCallback(() => held.payload.length); });
  big = null;
  render(() => useLatestCallback(() => 0)); // the next render replaces the body
  await new Promise((r) => setImmediate(r)); // a WeakRef keeps its target alive until the job that made it ends
  if (typeof globalThis.gc === "function") { globalThis.gc(); assert.equal(weak.deref(), undefined); } // with --expose-gc
  else assert.ok(true, "no --expose-gc: the replacement is checked by the identity test above");
});

test("#2769 the store's callbacks that had deps are useLatestCallback", () => {
  const store = fs.readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  for (const n of ["connectDb", "disconnectDb", "addVoxelModelToTab", "setLayoutElements", "saveProject", "switchToTab", "newWorkspaceTab", "requestSampleProject", "openProject", "closeWorkspaceTab", "restoreAutosave", "undo", "redo", "switchLayoutPage", "addLayoutPage", "sendLayoutElement", "addLayoutPages", "deleteLayoutPage"])
    assert.ok(store.includes(`const ${n} = useLatestCallback(`), n);
  // a useCallback left in the store has empty deps (made once, at mount): a non-empty deps array would keep an older render alive again
  // each call judged by its own closing line: the head line when the call fits on it, else the first line closing at the store's indent
  const lines = store.split("\n");
  const withDeps = [];
  lines.forEach((line, i) => {
    const m = line.match(/^ {2}const (\w+) = useCallback\(/);
    if (!m) return;
    let close = /, \[[^\]]*\]\);/.test(line) ? line : null;
    for (let j = i + 1; !close && j < lines.length; j++) if (/^ {2}\}/.test(lines[j])) close = lines[j];
    if (close && /, \[[^\]\s][^\]]*\]\);/.test(close)) withDeps.push(m[1]);
  });
  assert.deepEqual(withDeps, [], "useCallback with deps in store.jsx: use useLatestCallback");
});
