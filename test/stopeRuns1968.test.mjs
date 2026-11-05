// TASKS.csv #1968 — stopes managed by run in the Stope outlines pane (found by type, not by the pane's memory), one row per run in
// 3D Modelling, and many design strings removed at once
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stopeRuns, stopeRunKey, stopeIdsOnLevel, stopeStringIds, isStopeString } from "../src/lib/stopeRuns.js";

const stope = (id, run, rl, extra = {}) => ({ id, type: "stope", visible: true, params: { runId: run, blockModel: "Au estimate", cutoff: 1, gradeUnit: "ppm", levelRL: rl, tonnes: 1000, generatedAt: `2026-11-0${run === "r2" ? 4 : 3}T10:00:00Z`, ...extra } });
const surfaces = [
  stope("a", "r1", 1385), stope("b", "r1", 1385), stope("c", "r1", 1400.2),
  stope("d", "r2", 1697), { ...stope("e", "r2", 1712), visible: false },
  // two stopes from before runs were tagged: grouped by what made them
  { id: "f", type: "stope", params: { blockModel: "Au estimate", cutoff: 2, minWidthM: 13, skinM: 0, density: 2.7, levelRL: 1500, tonnes: 500 } },
  { id: "g", type: "stope", params: { blockModel: "Au estimate", cutoff: 2, minWidthM: 13, skinM: 0, density: 2.7, levelRL: 1513, tonnes: 500 } },
  { id: "h", type: "pit_shell", params: {} },
];

test("#1968 stopes group by run, newest first; earlier untagged stopes group by what made them", () => {
  const runs = stopeRuns(surfaces);
  assert.equal(runs.length, 3);
  assert.deepEqual(runs[0].ids, ["d", "e"], "r2 is newer");
  assert.deepEqual([runs[0].count, runs[0].visible, runs[0].levels], [2, 1, [1697, 1712]]);
  assert.deepEqual(runs[1].levels, [1385, 1400]);
  assert.equal(runs[1].tonnes, 3000);
  const earlier = runs.find((r) => r.key.startsWith("earlier|"));
  assert.deepEqual(earlier.ids, ["f", "g"]);
  assert.equal(stopeRunKey(surfaces[5]), stopeRunKey(surfaces[6]));
  assert.deepEqual(stopeIdsOnLevel(surfaces, "r1", 1385), ["a", "b"]);
  assert.deepEqual(stopeRuns([]), []);
});

test("#1968 a run's outline strings are found by their tag; every stope outline string by its id prefix, in any language", () => {
  const strings = [
    { id: "string_stope_1_0_0", stopeRun: "r1", name: "Stope 1385 m #1" }, { id: "string_stope_1_0_1", stopeRun: "r1", name: "Caserón 1385 m #2" },
    { id: "string_stope_2_0_0", stopeRun: "r2", name: "Stope 1697 m #1" }, { id: "string_stope_0_0_0", name: "Stope 1500 m #1" },
    { id: "string_123", name: "Pit crest" },
  ];
  assert.deepEqual(stopeStringIds(strings, "r1"), ["string_stope_1_0_0", "string_stope_1_0_1"]);
  assert.deepEqual(stopeStringIds(strings).length, 4, "every stope outline string, tagged or not");
  assert.equal(isStopeString(strings[4]), false);
});

test("#1968 the pane manages them, 3D Modelling shows one row per run, new runs are tagged, Strings removes many at once", () => {
  const p = readFileSync(new URL("../src/components/StopesPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes("runId: `stoperun_${Date.now()}`") && p.includes("runId: res.runId /* #1968 */") && p.includes("stopeRun: res.runId /* #1968 */"));
  assert.ok(p.includes('tr("Remove all stopes ({n})", { n: total })') && p.includes('tr("Remove level")'));
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(v.includes('implicitSurfaces.filter((s) => s.type !== "stope").map((s) => {'), "stopes leave the one-row-per-surface list");
  assert.ok(v.includes("<StopeRunRows stopes={stopeSurfaces}") && v.includes("stopes={stopeSurfaces} onShow={showSurfaces} onRemoveMany={removeSurfaces}"));
  const s = readFileSync(new URL("../src/components/StringManager.jsx", import.meta.url), "utf8");
  assert.ok(s.includes('tr("Remove all strings ({n})", { n: strings.length })') && s.includes('tr("Remove ticked")') && s.includes('tr("Filter by name…")') && s.includes("Solids made from them keep their shape"));
  const d = readFileSync(new URL("../src/components/DesignStringsPane.jsx", import.meta.url), "utf8");
  assert.ok(d.includes("<StringManager strings={designStrings}"));
});
