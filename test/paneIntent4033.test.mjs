// TASKS.csv #4033 (guided modelling, row 3) — the doors in the panes: an intent is left in one slot, taken once by the pane it names, ignored by any other, and dropped when
// nobody takes it in time. Source pins on each pane's read. Made-up values.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setPaneIntent, takePaneIntent, subscribePaneIntent, settingsIntent, stackIntent, explicitIntent, INTENT_TTL_MS } from "../src/lib/guide/paneIntent.js";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("an intent is taken once, by the pane it names", () => {
  setPaneIntent({ pane: "stack", addAll: { mode: "share", minPct: 1 } });
  const it = takePaneIntent("stack");
  assert.deepEqual(it, { pane: "stack", addAll: { mode: "share", minPct: 1 } }, "the slot's bookkeeping is not handed out");
  assert.equal(takePaneIntent("stack"), null, "taken once");
});

test("another pane ignores it and leaves it for the pane it names", () => {
  setPaneIntent({ pane: "explicit", unit: "DIW" });
  assert.equal(takePaneIntent("settings"), null);
  assert.equal(takePaneIntent("stack"), null);
  assert.deepEqual(takePaneIntent("explicit"), { pane: "explicit", unit: "DIW" }, "still there for its own pane");
});

test("one slot: a new intent replaces the old; one that names no pane that takes one clears it", () => {
  setPaneIntent({ pane: "settings", area: "all" });
  setPaneIntent({ pane: "explicit", unit: "A" });
  assert.equal(takePaneIntent("settings"), null);
  assert.deepEqual(takePaneIntent("explicit"), { pane: "explicit", unit: "A" });
  setPaneIntent({ pane: "stack" });
  setPaneIntent({ pane: "geoml" });
  assert.equal(takePaneIntent("stack"), null, "'geoml' takes no intent; the slot is empty");
  setPaneIntent(null); assert.equal(takePaneIntent("geoml"), null);
});

test("an intent nobody took in time is dropped, so it cannot fill a pane opened by hand later", () => {
  setPaneIntent({ pane: "settings", area: "all" }, 1000);
  assert.equal(takePaneIntent("settings", 1000 + INTENT_TTL_MS + 1), null);
  assert.equal(takePaneIntent("settings", 1000 + INTENT_TTL_MS + 1), null, "and the slot is empty");
  setPaneIntent({ pane: "settings", area: "all" }, 1000);
  assert.deepEqual(takePaneIntent("settings", 1000 + INTENT_TTL_MS), { pane: "settings", area: "all" });
});

test("a pane that is already open is told one arrived", () => {
  let n = 0;
  const off = subscribePaneIntent(() => { n++; });
  setPaneIntent({ pane: "stack" }); setPaneIntent(null);
  off(); setPaneIntent({ pane: "stack" });
  assert.equal(n, 2, "once per setPaneIntent, and not after unsubscribing");
  takePaneIntent("stack");
});

test("Model settings: the area, the holes (which make it 'checked') and the resolution (12 - 64 by 4); a value that does not fit is left out", () => {
  assert.deepEqual(settingsIntent({ pane: "settings", area: "checked", holes: ["H1", 2], resolution: 49 }), { area: "checked", holes: ["H1", "2"], resolution: 48 });
  assert.deepEqual(settingsIntent({ holes: ["H1"] }), { holes: ["H1"], area: "checked" });
  assert.deepEqual(settingsIntent({ area: "everything", holes: [], resolution: "x" }), {});
  assert.equal(settingsIntent({ resolution: 100 }).resolution, 64);
  assert.equal(settingsIntent({ resolution: 3 }).resolution, 12);
  assert.deepEqual(settingsIntent({ area: "all" }), { area: "all" });
  // the Area step's own payload (lib/guide/guideSteps.js): suggest + group { ids, n } + resolution
  assert.deepEqual(settingsIntent({ suggest: "group", group: { ids: ["H1", "H2"], n: 2 }, resolution: 48 }), { holes: ["H1", "H2"], area: "checked", resolution: 48 });
  assert.deepEqual(settingsIntent({ suggest: "whole", group: { ids: ["H1"], n: 1 }, resolution: 48 }), { area: "all", resolution: 48 }, "'whole' wins over the group");
  assert.deepEqual(settingsIntent({ area: "all", holes: ["H1"] }), { area: "all" }, "an explicit 'all' ticks no holes");
});

test("Strat. stack: Add all on a choice ('at least 1 %'), and the faults block (true, or the keys)", () => {
  assert.deepEqual(stackIntent({ addAll: { mode: "share", minPct: 1 } }), { addAll: { mode: "share", minPct: 1 } });
  assert.deepEqual(stackIntent({ addAll: { mode: "share", minPct: "2.5" }, faults: true }), { addAll: { mode: "share", minPct: 2.5 }, faults: [] });
  assert.deepEqual(stackIntent({ addAll: { mode: "modelling" }, faults: ["f1", "f2"] }), { addAll: { mode: "modelling" }, faults: ["f1", "f2"] });
  assert.deepEqual(stackIntent({ addAll: { mode: "everything" } }), {});
  assert.equal(stackIntent({ addAll: { mode: "share", minPct: 500 } }).addAll.minPct, 100);
});

test("Explicit surface: the unit's name", () => {
  assert.deepEqual(explicitIntent({ unit: "  DIW " }), { unit: "DIW" });
  assert.deepEqual(explicitIntent({ unit: "" }), {});
  assert.deepEqual(explicitIntent({}), {});
});

test("source pins: each pane reads its intent", () => {
  const panes = src("../src/modules/viewer/ModellingPanes.jsx");
  assert.match(panes, /usePaneIntent\(\["settings", "stack"\]\.includes\(toolPane\) \? toolPane : null/, "Model settings and Strat. stack, not the explicit pane (its panel takes its own)");
  assert.match(panes, /settingsIntent\(it\)/);
  assert.match(panes, /setModelResolution\(s\.resolution\)/);
  assert.match(panes, /setVisibleHoles\(onlyTheseHoles\(collars, s\.holes\)\)/);
  assert.match(panes, /stackIntent\(it\)/);
  assert.match(panes, /setAddAllStart\(\{ \.\.\.s\.addAll \}\); setAddAllOpen\(true\)/);
  assert.match(panes, /<AddAllUnits start=\{addAllStart\}/);
  assert.match(panes, /data-stack-faults=""/);
  const add = src("../src/modules/viewer/AddAllUnits.jsx");
  assert.match(add, /pBtn, start = null \}\)/);
  assert.match(add, /setMode\(start\.mode === "modelling" && !hasModelling \? "share" : start\.mode\)/);
  assert.match(add, /if \(start\.minPct != null\) setMinPct\(start\.minPct\)/);
  const expl = src("../src/components/ExplicitSurfacePanel.jsx");
  assert.match(expl, /usePaneIntent\("explicit", \(it\) =>/);
  assert.match(expl, /addSurface\(`Top of \$\{unit\}`, \{ unit, contact: "upper" \}, false\)/, "the surface is named in English (project data) and does not arm picking");
  assert.match(expl, /addSurface\(n, guessUnitFromName\(/, "the '+ New' button shares the same creation");
  const hook = src("../src/lib/guide/usePaneIntent.js");
  assert.match(hook, /takePaneIntent\(pane\)/);
  assert.match(hook, /subscribePaneIntent\(/);
});
