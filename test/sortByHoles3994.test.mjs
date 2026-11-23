// TASKS.csv #3994 (Matt, v0.2.6, Century) — Strat. stack: the run's order question has three answers (Use the holes' order / Run as it is / Cancel), and a "Sort by the holes" button above the stack
// list shows the moves before it changes anything and has Undo. The ordering logic is test/holesOrder3994; this is the dialog, the wiring and the button. Made-up data.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, "..", p), "utf8").replace(/\r\n/g, "\n");
const confirm = await import("../src/lib/confirmDialog.js");

test("#3994 askChoice: the value of the button clicked; Escape or no host answers null (the caller cancels); several asks queue", async () => {
  // no host yet and the host never appears (a test, a window without App): null, nothing runs by default
  assert.equal(typeof confirm.askChoice, "function");
  globalThis.window ||= new EventTarget();
  const seen = [];
  const off = confirm.registerConfirmHost((req) => { seen.push(req); });
  const p1 = confirm.askChoice("Order?", [{ label: "Cancel", value: "cancel" }, { label: "Run as it is", value: "asis" }, { label: "Use the holes' order", value: "holes", primary: true }]);
  assert.equal(seen.length, 1); assert.equal(seen[0].kind, "choice"); assert.deepEqual(seen[0].choices.map((c) => c.value), ["cancel", "asis", "holes"]); assert.equal(seen[0].choices[2].primary, true);
  seen[0].resolve("holes"); assert.equal(await p1, "holes");
  const p2 = confirm.askChoice("Again?", [{ label: "A", value: 1 }]);
  seen[1].resolve(null); assert.equal(await p2, null);
  off();
});

// ConfirmHost rendered statically: three buttons in the order given, the primary one marked
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-sort3994-"));
const bundle = (entry, name) => { const out = path.join(dir, name); writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", ...entry)], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "lucide-react"], logLevel: "silent" }).outputFiles[0].text); return pathToFileURL(out).href; };
const sortFile = bundle(["src", "modules", "viewer", "SortByHoles.jsx"], "sort.mjs");
process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });
const React = (await import("react")).default, { renderToStaticMarkup } = await import("react-dom/server");

test("#3994 the host draws a choice as its buttons, Escape answering null", () => {
  const host = read("src/components/ConfirmHost.jsx");
  assert.match(host, /choiceKind && req\.choices\.map\(\(c, i\) => <button key=\{i\} ref=\{c\.primary \? okRef : undefined\}/);
  assert.match(host, /answer\(choiceKind \? null : false\)/, "Escape");
  assert.match(host, /\{!choiceKind && <button ref=\{okRef\}/, "no OK button for a choice");
  assert.match(host, /req\.kind === "choice" \? \(v \?\? null\)/);
  const lib = read("src/lib/confirmDialog.js");
  assert.match(lib, /const nothing = \(req\) => \(req\.kind === "confirm" \? false : req\.kind === "choice" \? null : undefined\)/);
});

test("#3994 the run's question: Use the holes' order / Run as it is / Cancel; the first re-sorts the stack and runs again once (orderAsked); the others are as before", () => {
  const runs = read("src/modules/viewer/modellingRuns.js");
  assert.match(runs, /import \{ askConfirm, askChoice \} from "\.\.\/\.\.\/lib\/confirmDialog\.js"/);
  assert.match(runs, /\[\{ label: "Cancel", value: "cancel" \}, \{ label: "Run as it is", value: "asis" \}, \{ label: "Use the holes' order", value: "holes", primary: true \}\]/);
  assert.match(runs, /if \(answer === "holes" && !plan\.same && typeof setStackUnits === "function"\) \{\n\s+setStackUnits\(plan\.order\);/);
  assert.match(runs, /return runStackModel\(plan\.order, \{ method, orderAsked: true \}\);/);
  assert.match(runs, /const runStackModel = async \(unitNamesAll, \{ method = "gempy", orderAsked = false \} = \{\}\) =>/);
  assert.match(runs, /if \(ord\.conflicts\.length && !orderAsked\) \{/, "not asked a second time on the re-run");
  assert.match(runs, /if \(answer !== "asis" && answer !== "holes"\) \{\n\s+setNotices\(\(p\) => \[\.\.\.p, notice\("Stack run cancelled before solving/, "Cancel, Escape and a click outside stop the run");
  assert.match(runs, /holesOrderPlan\(layers\.litho \|\| \[\], unitNames, \(u\) => \(specKey\.get\(u\) \? specKey\.get\(u\)\.codes \|\| \[specKey\.get\(u\)\.meshName\] : \[\]\)\)/, "units with no surface keep their place");
  assert.match(runs, /A marked unconformity went with its unit\./);
  assert.doesNotMatch(runs, /Run in the order given anyway\?/, "the two-button question is gone");
  const hook = read("src/modules/viewer/useModelling.js");
  assert.match(hook, /ctxRef\.current = \{ \.\.\.ctx,/, "the run reads setStackUnits from the component's ctx");
  assert.match(read("src/modules/ViewerModule.jsx"), /^\s+setStackUnits,$/m);
});

test("#3994 the pane: Sort by the holes above the list (any time), the plan from the logs, the old note's button uses the same plan", () => {
  const pane = read("src/modules/viewer/ModellingPanes.jsx");
  assert.match(pane, /import \{ holesOrderPlan \} from "\.\.\/\.\.\/lib\/holesOrder\.js"; import SortByHoles from "\.\/SortByHoles\.jsx";/);
  assert.match(pane, /const holesPlan = useMemo\(\(\) => \{\n\s+if \(toolPane !== "stack" \|\| stackUnits\.length < 2\) return null;/);
  assert.ok(pane.indexOf("<SortByHoles ") < pane.indexOf("{stackHoles && ("), "above the note and the list");
  assert.ok(pane.indexOf("{stackHoles && (") < pane.indexOf("{stackUnits.map((u, i) => {"));
  assert.match(pane, /<button type="button" onClick=\{\(\) => setStackUnits\(\[\.\.\.\(holesPlan\?\.order \|\| stackHoles\.order\)\]\)\}/);
  assert.doesNotMatch(pane, /movesToOrder/);
  assert.match(read("src/modules/ViewerModule.jsx"), /<ModellingPanes \{\.\.\.\{ setStackUnits, /);
  assert.ok(Buffer.byteLength(read("src/modules/ViewerModule.jsx")) <= 735000, "the ViewerModule cap");
});

test("#3994 the button: closed it shows Sort by the holes (and flags a contradiction); the preview lists the moves, what stays, what is not settled, Apply and Cancel; Undo after Apply", async () => {
  const { default: SortByHoles } = await import(sortFile);
  const { holesOrderPlan } = await import("../src/lib/holesOrder.js");
  const logs = (holes) => holes.flatMap((h, i) => h.map((value, k) => ({ hole_id: `DH-23-${i}`, from: k * 10, to: k * 10 + 10, value })));
  const many = (n, u) => Array.from({ length: n }, () => u);
  const units = ["A", "B", "C", "D"], rows = logs(many(7, ["D", "A", "B", "C"]));
  const plan = holesOrderPlan(rows, units);
  const html = renderToStaticMarkup(React.createElement(SortByHoles, { stackUnits: units, plan, label: (u) => u, setStackUnits() {}, pBtn: {} }));
  assert.match(html, /data-sort-by-holes=""/); assert.match(html, />Sort by the holes</);
  assert.doesNotMatch(html, /role="group"/, "the preview is closed until the button is pressed");
  assert.equal(renderToStaticMarkup(React.createElement(SortByHoles, { stackUnits: ["A"], plan, label: (u) => u, setStackUnits() {}, pBtn: {} })), "", "a stack of one has nothing to sort");
  // a contradiction is flagged even while the preview is closed
  const split = holesOrderPlan(logs([...many(4, ["A", "B"]), ...many(4, ["B", "A"])]), ["B", "A"]);
  const flagged = renderToStaticMarkup(React.createElement(SortByHoles, { stackUnits: ["B", "A"], plan: split, label: (u) => u, setStackUnits() {}, pBtn: {} }));
  assert.match(flagged, /role="note"[^>]*>Not settled by the holes \(kept as you set them\): B \/ A: 4 holes one way, 4 the other\./);
  // the source: Apply sets the plan's order and remembers the one before; Undo puts it back; another edit of the list drops the Undo
  const src = read("src/modules/viewer/SortByHoles.jsx");
  assert.match(src, /setUndo\(\{ before: \[\.\.\.stackUnits\], after: \[\.\.\.plan\.order\] \}\); setStackUnits\(\[\.\.\.plan\.order\]\);/);
  assert.match(src, /setStackUnits\(undo\.before\); setUndo\(null\);/);
  assert.match(src, /if \(undo && !same\(undo\.after, stackUnits\)\) setUndo\(null\);/);
  assert.match(src, /plan\.same\n\s+\? <div>\{tr\("The holes give no reason to move a unit/);
  assert.match(src, /\{!plan\.same && <div style=\{note\}>\{tr\("A marked unconformity goes with its unit\."\)\}<\/div>\}/);
});

test("#3994 every new sentence and the two answers are in every language", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(read(`src/locales/${lang}.json`));
    for (const k of ["Sort by the holes", "Sorted by the holes.", "Run as it is", "Use the holes' order", "{unit} up {n}", "{unit} down {n}", "and {n} more", "Moves: {moves}.", "A marked unconformity goes with its unit."]) assert.ok(d[k], `${lang}: ${k}`);
  }
});
