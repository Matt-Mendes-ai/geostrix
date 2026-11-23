// TASKS.csv #4022 (Matt, v0.2.8: a way to remove all the units from the Strat. stack) — 'Remove all' beside 'Add all…' from two units up; asked
// first; the units and their unconformity marks go together; an in-pane Undo, then Redo (the stack is session state, outside Ctrl+Z).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#4022 Remove all: shown from two units, asked first, units and breaks cleared together, Undo then Redo", () => {
  const r = read("../src/modules/viewer/RemoveAllUnits.jsx");
  assert.match(r, /const button = stackUnits\.length >= 2\n/, "from two units up");
  assert.match(r, /if \(!\(await askConfirm\(tr\("Remove the \{n\} units from the stack\? Undo, under the buttons, puts them back\.", \{ n \}\), \{ okLabel: tr\("Remove all"\), destructive: true \}\)\)\) return;/);
  assert.match(r, /setLast\(\{ units: \[\.\.\.stackUnits\], breaks: \[\.\.\.\(stackBreaks \|\| \[\]\)\], removed: true \}\);\n\s+clear\(\);/, "saved before clearing");
  assert.match(r, /const clear = \(\) => \{ setStackUnits\(\[\]\); setStackBreaks\(\[\]\); \};/, "the unconformity marks go with the units");
  assert.match(r, /setStackUnits\(\[\.\.\.last\.units\]\); setStackBreaks\(\[\.\.\.last\.breaks\]\); setLast\(\{ \.\.\.last, removed: false \}\);/, "Undo puts both back");
  assert.match(r, /onClick=\{\(\) => \{ clear\(\); setLast\(\{ \.\.\.last, removed: true \}\); \}\}>\{tr\("Redo"\)\}/, "Redo removes again");
  assert.match(r, /last\.removed \? stackUnits\.length > 0 : !same\(last\.units, stackUnits\)\)\) setLast\(null\);/, "another edit of the stack takes the line away");
});

test("#4022 wiring: beside Add all, the line under the buttons; the Sort preview needs two units, so it goes with them", () => {
  const m = read("../src/modules/viewer/ModellingPanes.jsx");
  assert.match(m, /const removeAll = useRemoveAllUnits\(\{ stackUnits, setStackUnits, stackBreaks, setStackBreaks, pBtn \}\);/);
  assert.match(m, /\{tr\("Add all…"\)\}<\/button>\{\/\* #3999 \*\/\}\n\s+\{removeAll\.button\}/);
  assert.match(m, /<div style=\{\{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 \}\}>\{\/\* #4022[^\n]*\n\s+<select aria-label=\{tr\("Add a unit to the stack"\)\}[^\n]*flex: "1 1 120px"/, "three controls wrap rather than squeeze the list (seen live: 'Add a')");
  assert.match(m, /<\/div>\n\s+\{removeAll\.line\}\{\/\* #4022 \*\/\}\n\s+\{stackUnits\.length === 0 && \(/);
  assert.match(m, /if \(toolPane !== "stack" \|\| stackUnits\.length < 2\) return null;\n\s+return holesOrderPlan\(/, "no plan, no SortByHoles, no pending preview");
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(read(`../src/locales/${l}.json`));
    for (const k of ["Remove all", "Removed {n} units.", "Put back {n} units.", "Remove the {n} units from the stack? Undo, under the buttons, puts them back."]) assert.ok(j[k] && (k === "Remove all" || j[k].includes("{n}")), `${l}: ${k}`);
  }
});
