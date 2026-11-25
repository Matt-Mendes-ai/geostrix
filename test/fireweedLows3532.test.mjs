// TASKS.csv #3532 / #3533 / #3534 / #3535 / #3538 / #3541 / #3542 — the Low rows of the Fireweed rehearsal's first run, each pinned where it was found.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Papa from "papaparse";
import { normalizeHoleType } from "../src/lib/holeType.js";
import { holeFieldPicks } from "../src/lib/viewer/holeFieldPicks.js";
import { sampleFootnote, SAMPLE_RANK } from "../src/lib/sampleCards.js";
import { MACPASS_CREDIT } from "../src/lib/sampleCredits.js";
import { openShortcuts, onShortcutsOpen } from "../src/lib/help.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const loc = (lang) => JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));

// ---- #3532
test("#3532 Data QC says nothing before the first check has run: the counts read '…', and no 'No issues found' line", () => {
  const m = read("../src/components/DataQCModal.jsx");
  assert.match(m, /\{ran \? \(result\.summary\[sev\] \|\| 0\) : "…"/);
  assert.match(m, /\{!ran \? null [^\n]*: result\.issues\.length === 0 \? \(/);
  assert.match(m, /const NOT_YET = \{ issues: \[\], byCategory: new Map\(\), summary: \{\} \};/);
});

// ---- #3533
test("#3533 the import dialogs focus their primary button (Enter accepts the guesses), not Close; the trap skips the Close icon and a '?' otherwise", () => {
  const t = read("../src/lib/useFocusTrap.js");
  assert.match(t, /dialog\.querySelector\("\[data-autofocus\]:not\(\[disabled\]\)"\)/);
  assert.match(t, /focusables\.find\(\(el\) => el\.tagName\.toLowerCase\(\) !== "svg" && !el\.classList\?\.contains\("ge-pane-help"\)\)/);
  assert.match(t, /\(first \|\| focusables\[0\] \|\| dialog\)\.focus\?\.\(\)/);
  assert.match(read("../src/components/ImportMappingModal.jsx"), /onClick: onCommit, disabled: blocked, attrs: \{ "data-autofocus": "" \}/); // #4073 — StepDialog spreads attrs on its gold button
  assert.match(read("../src/components/AssayImportModal.jsx"), /onClick: onCommit, disabled: busyOrWaiting, attrs: \{ "data-autofocus": "",/); // #4073 — StepDialog spreads attrs on its gold button
});

// ---- #3534
test("#3534 the status bar's ? opens Help; Shortcuts and About are one click inside it; F1 is in the shortcut list", async () => {
  const a = read("../src/App.jsx");
  assert.match(a, /onHelp=\{\(\) => openHelp\(null\)/);
  assert.match(a, /useEffect\(\(\) => onShortcutsOpen\(\(tab\) => setShortcutsTab\(tab\)\), \[\]\);/);
  assert.match(a, /title=\{tr\("Help \(F1\) — the help pages, keyboard shortcuts and about GeoStrix"\)\}/);
  const h = read("../src/components/HelpPane.jsx");
  assert.match(h, /onClick=\{\(\) => openShortcuts\("shortcuts"\)\}[^\n]*tr\("Keyboard shortcuts"\)/);
  assert.match(h, /onClick=\{\(\) => openShortcuts\("about"\)\}[^\n]*tr\("About GeoStrix"\)/);
  assert.match(read("../src/components/ShortcutsModal.jsx"), /\["F1", "The help pages \(offline\)/);
  // the event round trip
  const seen = [];
  const listeners = new Map();
  globalThis.window = { addEventListener: (n, f) => listeners.set(n, f), removeEventListener: (n) => listeners.delete(n), dispatchEvent: (e) => { listeners.get(e.type)?.(e); return true; } };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  const off = onShortcutsOpen((tab) => seen.push(tab));
  openShortcuts("about"); openShortcuts(); off(); openShortcuts("python");
  assert.deepEqual(seen, ["about", "shortcuts"]);
  delete globalThis.window; delete globalThis.CustomEvent;
  for (const lang of ["es", "pt", "fr", "ar"]) { const d = loc(lang); for (const k of ["Keyboard shortcuts", "About GeoStrix", "Help (F1) — the help pages, keyboard shortcuts and about GeoStrix"]) assert.ok(d[k], `${lang}: ${k}`); }
});

// ---- #3535
test("#3535 a collar file of a multi-file drop does not claim 'no survey' while the survey is still queued; the end of the queue checks once", () => {
  const p = read("../src/modules/viewer/importPipelineImpl.js");
  assert.match(p, /const moreToCome = !!batchRowsRef\.current && importQueueRef\.current\.length > 0;/);
  assert.match(p, /if \(moreToCome\) assumedVertical\.forEach\(\(c\) => deferredAssumed\.add\(c\.hole_id\)\);/);
  assert.match(p, /if \(assumedVertical\.length && !moreToCome\) parts\.push\(tr\("\{n\} hole\(s\) have no azimuth, dip or survey/); // #3899
  assert.match(p, /if \(!surveyedHoles\.size && assumedVertical\.length < applied\.length && !moreToCome\) parts\.push/);
  assert.match(p, /queueSummary\(\); \/\* #3071 \*\/ handOverAssays\(\); reportDeferredAssumed\(\); return; \}/);
  assert.match(p, /const still = ids\.filter\(\(id\) => byId\.has\(id\) && !surveyed\.has\(id\) && holeAttitudeAssumed\(byId\.get\(id\), \[\]\)\);/);
  // the reprojection sentence says what happened to coordinates already in the project CRS
  assert.match(p, /if \(fromEpsg && Number\(fromEpsg\) === Number\(toEpsg\)\) \{ alreadyCount \+= groupRows\.length; continue; \}/);
  assert.match(p, /\{n\} row\(s\) have coordinates already in the project CRS \(EPSG:\{epsg\}\), so they were not changed/);
  assert.doesNotMatch(p, /already the project CRS, or no source CRS given/);
  for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(loc(lang)["{n} row(s) have coordinates already in the project CRS (EPSG:{epsg}), so they were not changed"], lang);
});

// ---- #3538
test("#3538 UDDH is an underground diamond hole; the colour list has one entry per split, the app's own hole type first; the Macpass types", () => {
  for (const v of ["UDDH", "UGDD", "ug dd", "UDD"]) assert.equal(normalizeHoleType(v), "Diamond, underground", v);
  assert.equal(normalizeHoleType("DDH"), "Diamond (DD)"); assert.equal(normalizeHoleType("RC"), "Reverse circulation (RC)");
  const collars = Papa.parse(read("../sample_data/yk_macpass/collars.csv"), { header: true, skipEmptyLines: true }).data;
  const types = new Set(collars.map((c) => normalizeHoleType(c.hole_type)));
  assert.deepEqual([...types].sort(), ["Diamond (DD)", "Diamond, underground", "Reverse circulation (RC)"]);
  const withAttrs = collars.slice(0, 300).map((c) => ({ hole_id: c.hole_id, attrs: { hole_type: c.hole_type, "hole type": normalizeHoleType(c.hole_type) } }));
  const picks = holeFieldPicks(withAttrs, [{ key: "hole_type", values: [] }, { key: "hole type", values: [] }]);
  assert.equal(picks.length, 1); assert.deepEqual(picks[0].also, ["hole type"]);
  assert.match(read("../src/modules/viewer/HoleFilterBar.jsx"), /\{picks\.map\(\(p\) => \{ const key = p\.also\.includes\("hole type"\) \? "hole type" : p\.key;/);
});

// ---- #3541
test("#3541 the sample footnote is one line per sample (the Macpass credit on its own sample's line); the empty state keeps the lines and its buttons share a grid", () => {
  const lines = sampleFootnote().split("\n");
  assert.ok(lines.length >= 12, `${lines.length} lines`);
  const mac = lines.find((l) => l.startsWith("Macpass"));
  assert.ok(mac.endsWith(MACPASS_CREDIT), "the credit follows its sample on the same line");
  assert.ok(lines.every((l) => l.length < 600), "no paragraph of fifteen descriptions");
  assert.ok(SAMPLE_RANK.includes("yk_macpass"));
  const e = read("../src/components/EmptyState.jsx");
  assert.match(e, /whiteSpace: "pre-line"/); assert.match(e, /className="ge-empty-actions"/);
  assert.match(read("../src/styles/app.css"), /\.ge-empty-actions > button \{ margin-left: 0 !important; \}/);
  const g = read("../src/modules/GeochemModule.jsx");
  assert.match(g, /const \[diagramKept, setDiagramId\] = useKeptState\(keptScope, "geochem\.diagramId", "boxplot"\);/);
  assert.match(g, /const diagramId = !assayElements\.length && diagramKept === "boxplot" \? "xy" : diagramKept;/);
});

// ---- #3542
test("#3542 the collar dialog's Source CRS line reads the CRS column; dip and north choices wait for a dip / azimuth column", () => {
  const m = read("../src/components/ImportMappingModal.jsx");
  assert.match(m, /defaultText=\{perRowCrsText \? perRowCrsText/);
  assert.match(m, /return tr\("Read from the \{col\} column of the file: \{list\}", \{ col, list \}\);/);
  assert.match(m, /\{schema\.dipConvention && \(modal\.target !== "collars" \|\| modal\.mapping\?\.dip\)/);
  assert.match(m, /\{\["collars", "survey", "structure"\]\.includes\(modal\.target\) && \(modal\.target !== "collars" \|\| modal\.mapping\?\.azimuth\)/);
  for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(loc(lang)["Read from the {col} column of the file: {list}"], lang);
});
