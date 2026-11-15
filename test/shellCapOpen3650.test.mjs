// TASKS.csv #3650 (Fireweed re-test R1, Macpass) — the Grade shell pane opened on Zn with 209.9 in the cap box (Ag's P99: the pane rendered its
// first listed element, Ag, before settling on Zn), and the first pick of Ag then ran uncapped. lib/viewer/shellCapRule.js decides; this replays
// the clicks the re-test made (Ag P99 209.9, Zn P99 21.74, both over the 150 % CV rule).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shellCapAction } from "../src/lib/viewer/shellCapRule.js";

const P99 = { Ag: 209.9, Zn: 21.74 };
// the note's effect, as ShellCapNote runs it; pick: the pane's element list (clears the box and forgets `auto`, #3650)
function session() {
  const st = { cap: NaN, auto: { symbol: null, value: null }, symbol: null };
  const note = (symbol, over = true) => {
    st.symbol = symbol;
    const act = shellCapAction({ symbol, auto: st.auto, capValue: st.cap, over });
    if (act === "clear") { st.auto = { symbol: null, value: null }; st.cap = NaN; }
    if (act === "fill") { st.auto = { symbol, value: P99[symbol] }; st.cap = P99[symbol]; }
    return st.cap;
  };
  const pick = (symbol) => { st.cap = NaN; st.auto = { symbol: null, value: null }; return note(symbol); };
  const type = (v) => { st.cap = v; return note(st.symbol); };
  return { st, note, pick, type };
}

test("the pane opening on its first listed element, then on the remembered one: the box holds the remembered element's cap", () => {
  const s = session();
  assert.equal(s.note("Ag"), 209.9); // the first render: the first listed element
  assert.equal(s.note("Zn"), 21.74, "Zn's own P99, not Ag's");
  assert.deepEqual(s.st.auto, { symbol: "Zn", value: 21.74 });
});

test("the re-test's clicks: Ag, Zn, Ag are each capped at their own P99 the first time", () => {
  const s = session();
  s.note("Ag"); s.note("Zn");
  assert.equal(s.pick("Ag"), 209.9, "the first pick of Ag is capped (it ran uncapped)");
  assert.equal(s.pick("Zn"), 21.74);
  assert.equal(s.pick("Ag"), 209.9);
});

test("a cap set for another element is cleared when this one is under the CV rule", () => {
  const s = session();
  s.note("Ag");
  assert.ok(Number.isNaN(s.note("Zn", false)), "Zn under 150 %: the box empties instead of keeping Ag's 209.9");
});

test("the user's own choices are kept: a typed cap, and a box emptied by hand stays empty for that element", () => {
  const s = session();
  s.pick("Zn");
  assert.equal(s.type(15), 15);
  assert.equal(s.note("Zn"), 15, "a CV or area change keeps the typed cap");
  s.pick("Zn");
  assert.ok(Number.isNaN(s.type(NaN)), "emptied by hand");
  assert.ok(Number.isNaN(s.note("Zn")), "and it stays empty");
  assert.equal(shellCapAction({ symbol: "Zn", auto: { symbol: "Zn", value: 21.74 }, capValue: 21.74, over: false }), "clear", "#3272: the rule no longer holds");
});

test("the wiring: the note asks the rule; the pane's list forgets the note's cap", () => {
  const n = readFileSync(new URL("../src/modules/viewer/ShellCapNote.jsx", import.meta.url), "utf8");
  assert.match(n, /const act = shellCapAction\(\{ symbol, auto: auto\.current, capValue, over: cv > CAP_CV_PCT \}\);/);
  const m = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(m, /setNumericSymbol\(next\); setNumericCapValue\(NaN\); shellCapAuto\.current = \{ symbol: null, value: null \};/);
});
