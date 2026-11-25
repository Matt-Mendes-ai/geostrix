// TASKS.csv #3999 — Strat. stack "Add all": the button beside "Add a unit…", the panel (three choices, what stays out in one line, the order, the over-16 cut-down), Undo after. The logic is
// test/stackAddAll3999; this is the drawing and the wiring. Made-up data.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import { addAllCandidates } from "../src/lib/stackAddAll.js";
import { modellingPanesSource } from "./helpers/modellingPanesSource.mjs"; // TASKS.csv #4070 — the panes in their own files

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, "..", p), "utf8").replace(/\r\n/g, "\n");
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-addall3999-"));
const out = path.join(dir, "addall.mjs");
writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", "src", "modules", "viewer", "AddAllUnits.jsx")], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "lucide-react"], logLevel: "silent" }).outputFiles[0].text);
process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });
const React = (await import("react")).default, { renderToStaticMarkup } = await import("react-dom/server");

const logs = (holes) => holes.flatMap((h, i) => { let d = 0; return h.map(([value, m]) => { const r = { hole_id: `DH-23-${String(i).padStart(3, "0")}`, from: d, to: d + m, value }; d += m; return r; }); });
const many = (n, h) => Array.from({ length: n }, () => h);
const roleOf = (c) => (c === "CAS" ? "overburden" : c === "DYK" ? "dyke" : "stratigraphic");

test("#3999 the panel: three choices with their counts, what stays out in one line each, the order the holes give, Add and Cancel", async () => {
  const { default: AddAllUnits } = await import(pathToFileURL(out).href);
  const rows = logs(many(6, [["CAS", 3], ["E", 10], ["C", 10], ["A", 30], ["DYK", 2], ["R", 0.2]]));
  const candidates = addAllCandidates({ rows, litho_units: ["CAS", "E", "C", "A", "DYK", "R"], roleOf, modellingCodeList: [] });
  const html = renderToStaticMarkup(React.createElement(AddAllUnits, { open: true, setOpen() {}, stackUnits: [], setStackUnits() {}, rows, candidates, codesOf: (u) => [u], label: (u) => u, pBtn: {} }));
  assert.match(html, /data-add-all=""/); assert.match(html, /role="group"/);
  assert.match(html, /All modelling codes \(0\)/); assert.match(html, /All logged codes \(4\)/); assert.match(html, /Logged codes with at least/);
  assert.match(html, /disabled=""[^>]*name="add-all-mode"|name="add-all-mode"[^>]*disabled=""/, "no modelling codes: that choice is off");
  assert.match(html, /Not added \(cover \/ casing\): CAS\./); assert.match(html, /Not added \(cross-cutting\): DYK\./);
  assert.match(html, /Under 1 % of the logged metres, left out: R\./, "the default share leaves out the rare code and says so");
  assert.match(html, /Order, youngest first: E, C, A\./); assert.match(html, />Add 3 units</); assert.match(html, />Cancel</);
  assert.doesNotMatch(html, /GemPy takes at most/);
  // closed: nothing but the (empty) wrapper
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(AddAllUnits, { open: false, setOpen() {}, stackUnits: [], setStackUnits() {}, rows, candidates, codesOf: (u) => [u], label: (u) => u, pBtn: {} })), /role="group"/);
});

test("#3999 over 16 units the panel says so and offers the cut-down (the most logged metres) or all of them", async () => {
  const { default: AddAllUnits } = await import(pathToFileURL(out).href);
  const names = Array.from({ length: 20 }, (_, i) => `U${String(i).padStart(2, "0")}`);
  const rows = logs(many(5, names.map((n, i) => [n, 2 + (i % 5) * 4])));
  const candidates = addAllCandidates({ rows, litho_units: names, roleOf, modellingCodeList: [] });
  const html = renderToStaticMarkup(React.createElement(AddAllUnits, { open: true, setOpen() {}, stackUnits: [], setStackUnits() {}, rows, candidates, codesOf: (u) => [u], label: (u) => u, pBtn: {} }));
  assert.match(html, /This is 20 units: GemPy takes at most 16 in one model\./);
  assert.match(html, /Cut down to the 16 with the most logged metres/); assert.match(html, /Add all 20 \(the Layer-cake method has no limit\)/);
  assert.match(html, /Left out by the cut: U\d\d \(\d+ m\)/); assert.match(html, />Add 16 units</);
});

test("#3999 the source: Add all beside the dropdown, the candidates from the pane's own roles, one Ctrl+Z step since #4025 (no in-pane Undo), the existing units kept", () => {
  const pane = modellingPanesSource();
  assert.match(pane, /import \{ addAllCandidates \} from "\.\.\/\.\.\/lib\/stackAddAll\.js";/);
  assert.match(pane, /import AddAllUnits from "\.\.\/AddAllUnits\.jsx";/); // #4070 — in the Strat. stack's own file (panes/StackPane.jsx)
  assert.match(pane, /<button type="button" aria-expanded=\{addAllOpen\} onClick=\{\(\) => setAddAllOpen\(\(v\) => !v\)\}[^\n]*\{tr\("Add all…"\)\}<\/button>/);
  assert.ok(pane.indexOf("</select>\n          <button type=\"button\" aria-expanded={addAllOpen}") > 0, "in the row, beside the select");
  assert.match(pane, /roleOf: rawRole, stackUnits, codesOf: stackCodesOf,/);
  assert.ok(pane.indexOf("<AddAllUnits ") < pane.indexOf("<SortByHoles "), "above the Sort by the holes button and the list");
  const src = read("src/modules/viewer/AddAllUnits.jsx");
  assert.match(src, /const apply = \(\) => \{ setStackUnits\(\[\.\.\.final\.order\]\); setOpen\(false\); \};/); assert.doesNotMatch(src, /setUndo/, "#4025: Ctrl+Z takes it back");
  assert.match(read("src/lib/stackAddAll.js"), /const start = \[\.\.\.stackUnits, /, "the units already in the stack come first and stay");
  for (const lang of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(read(`src/locales/${lang}.json`)); for (const k of ["Add all…", "All modelling codes ({n})", "All logged codes ({n})", "Logged codes with at least", "Add {n} units", "Not added ({why}): {names}.", "cover / casing", "no recovery"]) assert.ok(d[k], `${lang}: ${k}`); }
});
