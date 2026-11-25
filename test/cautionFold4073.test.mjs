// TASKS.csv #4073 — the cautions fold says how many cautions there are and the worst one ("Cautions (3): 38 % of the estimated metal lies…"), is plain "Details (n)" when there are only plain lines and is not
// shown when empty; ranking by severity (danger, then warning, in reading order); the five dialogs' Result steps use it.
import test from "node:test";
import assert from "node:assert/strict";
import { readSrc, localeMissing } from "./helpers/stepSplit.mjs";
import { cautionSummary, levelOfStyle, worstWords } from "../src/lib/cautionFold.js";

test("#4073 a line's level from its colours: danger 2, warning 1, a plain detail 0", () => {
  assert.equal(levelOfStyle("color: var(--color-danger-text)"), 2);
  assert.equal(levelOfStyle("", "alert"), 2);
  assert.equal(levelOfStyle("color: var(--color-warn-text); margin: 4px"), 1);
  assert.equal(levelOfStyle("background: var(--color-warn-bg)"), 1);
  assert.equal(levelOfStyle("color: var(--color-text-secondary)"), 0);
  assert.equal(levelOfStyle(), 0);
});

test("#4073 the label: the count of warnings and the worst one in a few words; details only; nothing", () => {
  const items = [
    { text: "0 rest on one hole.", level: 0 },
    { text: "38 % of the estimated metal lies below the deepest sample of every hole nearby, so it is extrapolated.", level: 1 },
    { text: "Mostly the detection floor: Au.", level: 1 },
  ];
  assert.deepEqual(cautionSummary(items), { kind: "cautions", n: 2, worst: "38 % of the estimated metal lies…" });
  // a danger line outranks earlier warnings
  assert.equal(cautionSummary([...items, { text: "No block met the rules: nothing was estimated.", level: 2 }]).worst, "No block met the rules: nothing was…");
  assert.deepEqual(cautionSummary([{ text: "Raw assays: 2 duplicate rows left out.", level: 0 }, { text: "  ", level: 1 }]), { kind: "details", n: 1, worst: "" });
  assert.deepEqual(cautionSummary([]), { kind: "none", n: 0, worst: "" });
  assert.deepEqual(cautionSummary([{ text: "", level: 2 }]), { kind: "none", n: 0, worst: "" }, "an empty element is not a line");
  assert.equal(worstWords("one two three"), "one two three");
  assert.equal(worstWords("a b c d e f g h"), "a b c d e f g…");
});

test("#4073 the component hides itself when empty, reads its own rendered lines, and the word count reads it as folded", () => {
  const c = readSrc("src/components/CautionFold.jsx");
  assert.ok(c.includes('sum.kind === "none" ? { display: "none" } : {}') && c.includes("useLayoutEffect") && c.includes("[...el.children]"));
  assert.ok(c.includes('tr("Cautions ({n}): {worst}"') && c.includes('tr("Details ({n})"'));
  assert.ok(readSrc("scripts/word-count.mjs").includes('name === "CautionFold"'));
});

test("#4073 the Result steps of the grade dialogs use it, none keeps the unlabelled fold", () => {
  for (const f of ["GradeEstimationModal", "VariogramModal", "CompositingModal", "GradeTonnageModal"]) {
    const s = readSrc(`src/components/${f}.jsx`);
    assert.ok(s.includes("<CautionFold>") && s.includes("</CautionFold>") && s.includes('import CautionFold from "./CautionFold.jsx"'), f);
    assert.ok(!s.includes('<MoreFold summary={tr("Cautions and details")}>'), f);
  }
});

test("#4073 its labels are in every language", () => assert.deepEqual(localeMissing(["Cautions ({n}): {worst}", "Details ({n})", "Cautions"]), []));
