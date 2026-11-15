// TASKS.csv #3539 (Fireweed rehearsal) — after an import or a sample's files are committed, the 3D View's builds ran for seconds with no
// sign on the status bar (the import queue cleared its label at once; the sample's extras had none). lib/busyUntilQuiet.js keeps an
// open-ended label up until no long task has run for a moment, never over a cancellable task's label, and clears only its own.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { whenQuiet, showBusy, busyUntilQuiet } from "../src/lib/busyUntilQuiet.js";

// a status-bar slot as the store keeps it: a value and a setter taking a value or a function of it
function slot(initial = null) {
  const s = { cur: initial, set: (u) => { s.cur = typeof u === "function" ? u(s.cur) : u; } };
  return s;
}

test("showBusy: an open-ended label; not over a cancellable task's label; over a plain one", () => {
  const a = slot();
  showBusy(a.set, "Drawing");
  assert.deepEqual(a.cur, { label: "Drawing", indeterminate: true });
  const run = { label: "Stack model", pct: 40, onCancel: () => {} };
  const b = slot(run);
  showBusy(b.set, "Drawing");
  assert.equal(b.cur, run, "a modelling run's Cancel stays");
  const c = slot({ label: "Importing files (2/3): survey.csv", pct: 67 });
  showBusy(c.set, "Loading the sample's assays");
  assert.equal(c.cur.label, "Loading the sample's assays");
  showBusy(undefined, "x"); // no setter: nothing to do
});

test("busyUntilQuiet: the label until quiet, then cleared; a later task's label is left", async () => {
  const a = slot();
  const t0 = Date.now();
  const p = busyUntilQuiet(a.set, "Drawing", { quietMs: 60, maxMs: 2000 });
  assert.equal(a.cur.label, "Drawing");
  await p;
  assert.equal(a.cur, null, "cleared");
  assert.ok(Date.now() - t0 >= 55, "after the quiet wait");
  const b = slot();
  const q = busyUntilQuiet(b.set, "Drawing", { quietMs: 60 });
  b.set({ label: "Importing files (1/1): a.csv", pct: 100 });
  await q;
  assert.equal(b.cur.label, "Importing files (1/1): a.csv", "not ours: left as it is");
  await busyUntilQuiet(undefined, "x"); // no setter
});

test("whenQuiet resolves after the quiet time, and by maxMs at the latest", async () => {
  const t0 = Date.now();
  await whenQuiet(50, 5000);
  const dt = Date.now() - t0;
  assert.ok(dt >= 45 && dt < 2000, `${dt} ms`);
});

test("wiring: the import queue's end and the sample extras keep a label until quiet", () => {
  const imp = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(imp, /if \(!file\) \{ importActiveRef\.current = false; batchRowsRef\.current = null; busyUntilQuiet\(setTaskProgress, tr\("Drawing the imported data…"\)\)/);
  const wa = readFileSync(new URL("../src/lib/sampleWa.js", import.meta.url), "utf8");
  assert.match(wa, /const label = tr\("Loading the \{name\} sample's assays and extras…", \{ name: S\.label \}\);/);
  assert.match(wa, /await whenQuiet\(\); \/\/ then it goes/);
  assert.match(wa, /store\.setTaskProgress\?\.\(\(cur\) => \(cur && cur\.label === label \? null : cur\)\);/);
  assert.equal((wa.match(/await nextTask\(\); \/\/ #3539/g) || []).length, 2, "the assays step: parse | align | commit");
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /setProjectDataCredit: store\.setProjectDataCredit \/\* #3496 \*\/, setTaskProgress \/\* #3539 \*\/ \}/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Drawing the imported data…", "Loading the {name} sample's assays and extras…"]) assert.ok(d[k], `${l}: ${k}`);
  }
});
