// TASKS.csv #4070 — the 3D Modelling panes as steps (Matt's layout C, "steps, like the Guide", 2026-11-24). The numbers each step shows
// (lib/paneSteps.js), the compact pane message, and the reachable set: every setting and tool the Grade shell and the Strat. stack offered before
// the steps is still in its pane (a step, the Result step or Fine-tune), so nothing was lost in the move.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { elementCounts, quickCutoffs, shareAbove, shapeOf, shapeSettings, SHELL_SHAPES, shellResult, stackResult } from "../src/lib/paneSteps.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const panes = read("../src/modules/viewer/ModellingPanes.jsx");
const block = (id) => { const a = panes.indexOf(`{toolPane === "${id}" && (<>`); const b = panes.indexOf("{toolPane === ", a + 10); return panes.slice(a, b > a ? b : undefined); };

test("Element: the elements most sampled first, with their counts; ties keep the list's order", () => {
  const rows = [{ values: { Au: 1, Cu: 5 } }, { values: { Au: 2 } }, { values: { Cu: NaN, Zn: 3 } }, { values: {} }];
  assert.deepEqual(elementCounts(rows, ["Cu", "Zn", "Au"]), [{ symbol: "Au", n: 2 }, { symbol: "Cu", n: 1 }, { symbol: "Zn", n: 1 }]);
  assert.deepEqual(elementCounts([], ["Au"]), [{ symbol: "Au", n: 0 }]);
});

test("Cut-off: P75 / P90 / P95 at 3 significant figures (P90 the pane's own proposal rank), and the share at or above", () => {
  const v = Array.from({ length: 101 }, (_, i) => i / 10); // 0 .. 10
  assert.deepEqual(quickCutoffs(v), { p75: 7.5, p90: 9, p95: 9.5 }); // positives only: 0.1 .. 10 (100 values); rank floor(q * 99)
  assert.equal(quickCutoffs([0, -1, NaN]), null);
  assert.equal(shareAbove([1, 2, 3, 4], 3), 0.5);
  assert.equal(shareAbove([], 1), null);
  assert.equal(shareAbove([1, 2], NaN), null);
});

test("Shape: the three choices round-trip through the two settings the run reads; Automatic stays reachable and reads back as such", () => {
  for (const k of SHELL_SHAPES) { const s = shapeSettings(k); assert.equal(shapeOf(s.shellMode, s.planeSearch), k, k); }
  assert.equal(shapeOf("tight", true), "trend", "the default (tight along the composites' plane, #3655) is 'Along a trend'");
  assert.equal(shapeOf("auto", true), "auto");
  assert.deepEqual(shapeSettings("auto"), { shellMode: "auto" });
});

test("Result: the shell's record in numbers, red where the run itself warns (half the composites outside, half its volume beyond the drilling)", () => {
  const s = { params: { compositesInShell: { above: 100, inside: 40 }, beyondDrilling: { share: 0.55 } }, surfaceSupportCounts: { interpolated: 30, extrapolated: 50, unsupported: 20 } };
  const r = shellResult(s, { volumeM3: 1e6, watertight: false });
  assert.equal(r.insideLow, true); assert.equal(r.beyondLevel, "high"); assert.equal(r.interpolated, 0.3);
  assert.equal(r.volumeM3, null, "an open shell has no volume"); assert.equal(r.open, true);
  const ok = shellResult({ params: { compositesInShell: { above: 10, inside: 9 }, beyondDrilling: { share: 0.02 } } }, { volumeM3: 5000, watertight: true });
  assert.deepEqual([ok.insideLow, ok.beyondLevel, ok.volumeM3, ok.interpolated], [false, "low", 5000, null]);
  assert.equal(shellResult({ params: { beyondDrilling: { share: 0.2 } } }, null).beyondLevel, "some");
});

test("Result: the stack's newest run (its surfaces share runId), the median typical miss, the worst, the contacts left out", () => {
  const mk = (run, name, typ, worst, left = 0, of = 10) => ({ name, type: "stratigraphic_contact", params: { runId: run, contactFit: { points: of, typicalMissM: typ, worstMissM: worst }, ...(left ? { contactsWithoutSurface: { left, of } } : {}) } });
  const r = stackResult([mk("a", "Top of A", 9, 99), mk("b", "Top of B", 1, 4), mk("b", "Top of C", 3, 12, 2, 20), mk("b", "Top of D", 2, 6), { name: "shell", params: { tool: "numeric grade shell" } }]);
  assert.deepEqual([r.runId, r.n, r.typicalMissM, r.worstMissM, r.left, r.of], ["b", 3, 2, 12, 2, 40]);
  assert.equal(stackResult([{ name: "shell", params: {} }]), null);
});

test("the shared StepPane: one gold primary (the pane's action), a step bar, Back / Next, a Result step, every step mounted (only the shown one visible)", () => {
  const s = read("../src/components/StepPane.jsx");
  assert.equal((s.match(/gs-btn--primary/g) || []).length, 1);
  assert.match(s, /role="tablist"/);
  assert.match(s, /tr\("Back"\)/); assert.match(s, /tr\("Next"\)/); assert.match(s, /tr\("Result"\)/);
  assert.match(s, /hidden=\{i !== at\}/, "a step's parts that set a value when they mount (ShellCapNote's automatic cap) run whichever step is open");
  assert.match(s, /export function requestStep\(id, key\)/, "the Guide's doors open a step (#4033)");
});

test("the compact pane message: the first sentence, the whole text one click away", async () => {
  const r = read("../src/components/Ribbon.jsx");
  assert.match(r, /const short = compact && !open && !all;/);
  const firstSentence = new Function(`return ${r.match(/export const firstSentence = (\([\s\S]*?\n\};)/)[1].replace(/;$/, "")}`)();
  assert.equal(firstSentence("\"Au shell\" data support — grid: 16 %. Shell surface vertices: 81 %."), "\"Au shell\" data support — grid…");
  assert.equal(firstSentence("Short one."), "Short one.");
  assert.equal(firstSentence("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen."), "one two three four five six seven eight nine ten eleven twelve thirteen fourteen…");
});

test("Grade shell: the steps, and every setting and tool it had before is still in the pane (steps, Result or Fine-tune)", () => {
  const b = block("shell");
  assert.match(b, /paneHeader\("Grade shell", Gem, "model", true/);
  assert.match(b, /<StepPane id="shell" label=\{tr\("Grade shell"\)\}/);
  for (const k of ['key: "element"', 'key: "cutoff"', 'key: "shape"']) assert.ok(b.includes(k), k);
  assert.match(b, /onClick: runNumericModel/);
  assert.match(b, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="shell">/);
  assert.match(b, /<strong>\{tr\("Not a resource estimate\."\)\}<\/strong>/, "the standing framing stays seen first (#269), in one line");
  const reach = ["setNumericSymbol(", "setNumericCutoff(", "setNumericCellSize(", "setNumericSearchRadius(", "setNumericPadding(", "setShellMode(", "setShellEnvIso(", "setShellPlaneSearch(",
    "setNumericCellHeight(", "setNumericFlatReach(", "setNumericMethod(", "setNumericVariogram(", "setNumericUseComposites(", "setNumericCompositeLength(", "setNumericMinCoverage(",
    "setNumericCapValue(", "setNumericMinHoles(", "setNumericIncludeQAQC(", "setNumericCloseShell(", "setClipToTopo(", "setNumericMaxBlocks(",
    "<ShellCapNote", "<GradeShellUnsampled", "<GeochemCompositingNote", "<DomainUpdateSection", "drillThresholdOffers(", "numericBudgetHint.needed", "numericBudgetHint?.advice", "Use it as the flat search"];
  const missing = reach.filter((k) => !b.includes(k));
  assert.deepEqual(missing, []);
  assert.match(b, /tr\("Add as block model"\)/, "the Result step's own: the shell's cells as a block model (as add_grade_shell_blocks)");
});

test("Strat. stack: the steps, and every setting and tool it had before is still in the pane", () => {
  const b = block("stack");
  assert.match(b, /<StepPane id="stack" label=\{tr\("Stratigraphic stack"\)\}/);
  for (const k of ['key: "units"', 'key: "faults"', 'key: "method"']) assert.ok(b.includes(k), k);
  const reach = ["addStackUnit(", "setAddAllOpen(", "<RemoveAllUnits", "<AddAllUnits", "<SortByHoles", "moveStackUnit(u, -1)", "moveStackUnit(u, 1)", "removeStackUnit(u)", "setStackBreaks(",
    "Use the order from the holes", "setStackFaults(", "setStackFaultOffsets?.(", "setCfg({ faults:", "setStackMethod", "setStackRelation", "setIncludeSectionContacts(", "runStackModel(stackUnits, { method: stackMethod })",
    "{leftOutNote}", "clusterNote(true)", "data-stack-faults"];
  const missing = reach.filter((k) => !b.includes(k));
  assert.deepEqual(missing, []);
  assert.match(b, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="stack">/);
});
