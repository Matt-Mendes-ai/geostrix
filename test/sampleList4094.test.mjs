// TASKS.csv #4094 — the sample table's behaviour and its pinned set: filtering (several icons narrow), search, every sample reachable, the accessible and keyboard
// wiring (static table; every icon named; a row is selectable by arrow keys, Enter / double-click opens), one gold button, and the 1366x768 layout rule (the table scrolls
// inside the card, the gold button stays below it).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SAMPLE_ICONS, SAMPLE_CONTENTS, sampleListFor, filterSampleRows } from "../src/lib/sampleCards.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const { rows } = sampleListFor("view");
const ids = (r) => r.map((x) => x.id).sort();

test("no filter shows every sample; each sample holds at least one icon; the icons together reach every sample", () => {
  assert.equal(filterSampleRows(rows, new Set(), "").length, rows.length);
  for (const r of rows) assert.ok(SAMPLE_ICONS.some((k) => r.has[k]), `${r.id}: no icon`);
  const reached = new Set(SAMPLE_ICONS.flatMap((k) => filterSampleRows(rows, new Set([k]), "").map((r) => r.id)));
  assert.deepEqual([...reached].sort(), ids(rows));
});

test("several icons narrow (AND): Holes + Geophysics is the drilled samples with a survey, grid or downhole log; Mapping + Terrain the mapped ones with a terrain", () => {
  assert.deepEqual(ids(filterSampleRows(rows, new Set(["holes", "geophysics"]), "")), ["qld_century", "silvertip", "wa_iron", "wa_uranium", "woodjam"].filter((id) => rows.some((r) => r.id === id)).sort());
  const mt = ids(filterSampleRows(rows, new Set(["mapping", "terrain"]), ""));
  assert.deepEqual(mt, ["mount_raymond", "perk", "qc_rouyn_noranda"]);
  assert.deepEqual(filterSampleRows(rows, new Set(["geophysics", "mapping", "terrain", "holes", "assays", "surface"]), ""), [], "no sample holds all six");
});

test("the search reads the name, the style and the facts, case-insensitively", () => {
  assert.deepEqual(ids(filterSampleRows(rows, new Set(), "MACPASS")), ["yk_macpass"]);
  assert.ok(filterSampleRows(rows, new Set(), "gamma").some((r) => r.id === "wa_uranium"));
  assert.ok(filterSampleRows(rows, new Set(), "uranium").some((r) => r.id === "wa_uranium"));
  assert.equal(filterSampleRows(rows, new Set(), "  ").length, rows.length);
  assert.equal(filterSampleRows(rows, new Set(["holes"]), "gold").every((r) => r.has.holes), true);
});

test("a hole-traces row (Rouyn-Noranda) is a Holes row drawn dashed, and a sample with no assays says so by its missing icon", () => {
  const rn = rows.find((r) => r.id === "qc_rouyn_noranda");
  assert.ok(rn.has.holes.traces && !rn.has.assays);
  assert.ok(filterSampleRows(rows, new Set(["holes"]), "").some((r) => r.id === "qc_rouyn_noranda"));
});

test("the component: a static table, every icon named, rows selectable and openable by keyboard, one gold button", () => {
  const c = read("../src/modules/viewer/SampleList.jsx");
  assert.doesNotMatch(c, /react-window|useVirtualRows|react-virtual|<DataGrid/, "no heavy component");
  assert.match(c, /<table role="grid" aria-label=\{tr\("Samples"\)\}/);
  assert.match(c, /<svg role=\{decorative \? undefined : "img"\} aria-label=\{decorative \? undefined : label\}/); assert.match(c, /\{!decorative && <title>\{label\}<\/title>\}/); // every table icon: a tooltip and an accessible name
  assert.match(c, /<Icon k=\{k\} label=\{L\[k\]\} decorative \/>\{L\[k\]\}/); // a chip says its name in text: its icon is not read twice
  assert.match(c, /aria-pressed=\{on\.has\(k\)\}/); // a filter chip is a toggle
  assert.match(c, /role="row" aria-selected=\{isSel\} tabIndex=\{isSel \? 0 : -1\}/); // roving tabindex: one row in the tab order
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Enter"]) assert.ok(c.includes(`"${key}"`), key);
  assert.match(c, /onClick=\{\(\) => setSel\(r\.id\)\} onDoubleClick=\{\(\) => open\(r\)\}/);
  assert.equal((c.match(/gs-btn--primary/g) || []).length, 1);
  assert.match(c, /Download and open \{name\} \(\{n\} MB\)/);
  assert.match(c, /<bdi>\{r\.name\}<\/bdi>/); assert.match(c, /<bdi>\{r\.facts\}<\/bdi>/); // Arabic: Latin names and numbers keep their order inside a right-to-left row
});

test("the layout: the card never scrolls, the table scrolls inside it, the gold button is the last item below it (in view at 1366x768)", () => {
  const e = read("../src/components/EmptyState.jsx"), c = read("../src/modules/viewer/SampleList.jsx");
  assert.match(e, /const wideCard = \{ maxWidth: 900, width: "100%", display: "flex", flexDirection: "column" \};/); // the card scrolls only when the own-data fold is opened
  assert.match(e, /\{wide && children && <MoreFold summary=\{tr\("Start with your own data"\)\}/); // the drop area and its steps: folded under the table, one click away
  assert.match(e, /const wideActions = \{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 auto", minHeight: 0 \};/);
  assert.match(c, /overflow: "auto", minHeight: 96, flex: "1 1 auto"/); // the table's own scroller
  const tableAt = c.indexOf("<table"), btnAt = c.indexOf('className="gs-btn gs-btn--primary"');
  assert.ok(btnAt > tableAt && c.slice(btnAt).includes('flex: "none"'), "the button follows the table and does not shrink");
});

test("every sample card the app offers has its contents (a new one fails here until it is added)", () => {
  for (const mode of ["view", "surface"]) for (const r of sampleListFor(mode).rows) assert.ok(SAMPLE_CONTENTS[r.id], r.id);
});
