// TASKS.csv #4022 (Matt, v0.2.8: a way to remove all the units from the Strat. stack) — 'Remove all' beside 'Add all…' from two units up; asked
// first; the units and their unconformity marks go together. Since #4025 the stack is in the project's history: Ctrl+Z, no in-pane Undo line.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const here = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-removeall4022-"));
process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });
const bundled = (rel) => { const out = path.join(dir, "c.mjs"); writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", rel)], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime"], logLevel: "silent" }).outputFiles[0].text); return pathToFileURL(out).href; };

test("#4022 Remove all: shown from two units, asked first, units and breaks cleared in one render", async () => {
  const { default: RemoveAllUnits } = await import(bundled("src/modules/viewer/RemoveAllUnits.jsx"));
  const el = (units) => renderToStaticMarkup(React.createElement(RemoveAllUnits, { stackUnits: units, setStackUnits() {}, setStackBreaks() {}, pBtn: {} }));
  assert.equal(el(["TUF"]), "", "one unit: nothing to remove all of");
  assert.match(el(["TUF", "AND"]), /data-remove-all=""[^>]*>Remove all</);
  const r = read("../src/modules/viewer/RemoveAllUnits.jsx");
  assert.match(r, /if \(!\(await askConfirm\(tr\("Remove the \{n\} units from the stack\? \(Ctrl\+Z undoes this\.\)", \{ n: stackUnits\.length \}\), \{ okLabel: tr\("Remove all"\), destructive: true \}\)\)\) return;/);
  assert.match(r, /setStackUnits\(\[\]\); setStackBreaks\(\[\]\);/, "the unconformity marks go with the units");
  assert.doesNotMatch(r, /Undo"\)|Redo"\)/, "#4025: Ctrl+Z, not a line of its own");
});

test("#4022 wiring: beside Add all; the add row wraps; the Sort preview needs two units, so it goes with them", () => {
  const m = read("../src/modules/viewer/ModellingPanes.jsx");
  assert.match(m, /\{tr\("Add all…"\)\}<\/button>\{\/\* #3999 \*\/\}\n\s+<RemoveAllUnits stackUnits=\{stackUnits\} setStackUnits=\{setStackUnits\} setStackBreaks=\{setStackBreaks\} pBtn=\{pBtn\} \/>/);
  assert.match(m, /<div style=\{\{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 \}\}>\{\/\* #4022[^\n]*\n\s+<select aria-label=\{tr\("Add a unit to the stack"\)\}[^\n]*flex: "1 1 120px"/, "three controls wrap rather than squeeze the list (seen live: 'Add a')");
  assert.match(m, /if \(toolPane !== "stack" \|\| stackUnits\.length < 2\) return null;\n\s+return holesOrderPlan\(/, "no plan, no SortByHoles, no pending preview");
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(read(`../src/locales/${l}.json`));
    for (const k of ["Remove all", "Remove the {n} units from the stack? (Ctrl+Z undoes this.)"]) assert.ok(j[k], `${l}: ${k}`);
    for (const k of ["Removed {n} units.", "Put back {n} units.", "Sorted by the holes.", "Added {n} units, in the order the holes give."]) assert.equal(j[k], undefined, `${l}: ${k} is gone with its line (#4025)`);
  }
});
