// TASKS.csv #2379 (review #2325, WA uranium) — a halo built during a GemPy run no longer removes the run's progress and Cancel
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { taskSlot } from "../src/lib/taskSlot.js";

const slot = () => { let cur = null; const set = (v) => { cur = typeof v === "function" ? v(cur) : v; }; return { set, get: () => cur }; };

test("a halo's progress and its end leave a running stack's Cancel in place", () => {
  const s = slot();
  const cancel = () => {};
  s.set({ label: "Stratigraphic stack (I, H)", pct: 90, onCancel: cancel }); // the GemPy run (modellingRuns runSurfaceStack)
  const halo = taskSlot(s.set, "Envelope: SIL");
  halo.set(20);
  assert.equal(s.get().label, "Stratigraphic stack (I, H)");
  assert.equal(s.get().onCancel, cancel);
  halo.set(80, () => {});
  halo.clear();
  assert.equal(s.get().label, "Stratigraphic stack (I, H)");
  assert.equal(s.get().onCancel, cancel);
});

test("alone, a tool shows its own progress and clears it; a task with no Cancel can be covered", () => {
  const s = slot();
  const halo = taskSlot(s.set, "Envelope: SIL");
  halo.set(20);
  assert.deepEqual(s.get(), { label: "Envelope: SIL", pct: 20 });
  halo.clear();
  assert.equal(s.get(), null);
  s.set({ label: "something done", pct: 100 });
  halo.set(30);
  assert.equal(s.get().label, "Envelope: SIL");
});

test("the short tools use it, and none clears the slot outright", () => {
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.equal((m.match(/ownTask\(label\)\.clear\(\)/g) || []).length, 3);
  assert.equal((m.match(/setTaskProgress\?\.\(\{ label, pct: 20 \}\)/g) || []).length, 0);
});
