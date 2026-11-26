// TASKS.csv #4102 (the follow-up of #4070's closing audit, side 3's five) — five long views trimmed. Folded, not hidden: the reachable set is pinned here.
//  1 Modelling codes: the codes to look at stay in view, the layers wait in 'Stratigraphic, assumed (n)' (up to six codes everything stays in view); one row for both.
//  2 Correlation > Intervals: the tick boxes of the codes to number (past six) and the optional sheet correlation are folds.
//  3 Geophysics survey card: the method, units, z meaning, equivalent sources, gravity reduction and heights are one Fine-tune fold; the name, hide, rename, export,
//    remove, the count line and 'Draw interpretation lines…' stay in view. The Blake River load notice says what loaded; where next and the licence are behind its More.
//  4 The terrain's draw-the-area map: 'no tiles are loaded' and 'nothing is fetched' are one sentence.
//  5 SQL workspace: the table names stay, their columns wait in 'Columns'.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, "..", p), "utf8").replace(/\r\n/g, "\n");
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-long4102-"));
const bundle = (entry, name) => { const out = path.join(dir, name); writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", entry)], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "lucide-react", "papaparse", "three"], logLevel: "silent", loader: { ".js": "jsx" } }).outputFiles[0].text); return pathToFileURL(out).href; };
process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });
const React = (await import("react")).default, { renderToStaticMarkup } = await import("react-dom/server");
const h = React.createElement;

const mcSrc = read("src/components/ModellingCodesPane.jsx");
const LOCALES = ["es", "pt", "fr", "ar"];
const dict = (l) => JSON.parse(read(`src/locales/${l}.json`));

test("#4102 Modelling codes: one row for every code, in view or in the fold; the same controls", () => {
  assert.equal(mcSrc.split("const codeRow = (c, i) => (").length, 2, "one row definition");
  const from = mcSrc.indexOf("const codeRow = (c, i) => ("), row = mcSrc.slice(from, mcSrc.indexOf("const indexed", from));
  for (const k of ['aria-label={tr("Colour of {name}"', "onClick={() => showCode(c.name)}", "setCode(c.name, { role: e.target.value })", "moveCode(c.name, -1)", "moveCode(c.name, 1)", "leaveOut([c.name], !c.leftOut)", "deleteCodesNamed([c.name])", "clickCodeRow(e, c.name)"]) assert.ok(row.includes(k), k);
  assert.ok(mcSrc.includes("{lookNow.map(([c, i]) => codeRow(c, i))}") && mcSrc.includes("{others.map(([c, i]) => codeRow(c, i))}"), "the rows in view and the rows in the fold are the same row");
  assert.ok(mcSrc.includes('<MoreFold summary={tr("Stratigraphic, assumed ({n})", { n: others.length })}'), "the fold");
  assert.match(mcSrc, /const needsLook = \(c\) => c\.role !== "stratigraphic" \|\| !!c\.leftOut \|\| overrideCount\.has\(c\.name\) \|\| pickedCodes\.has\(c\.name\);/);
  assert.match(mcSrc, /const lookNow = codes\.length <= 6 \? indexed : indexed\.filter\(\(\[c\]\) => needsLook\(c\)\);/);
  assert.match(mcSrc, /const others = codes\.length <= 6 \? \[\] : indexed\.filter\(\(\[c\]\) => !needsLook\(c\)\);/);
  // the order buttons keep their place in the whole list, not in the visible part
  assert.ok(row.includes("disabled={i === 0}") && row.includes("disabled={i === codes.length - 1}"));
  // 'Use the order from the holes' and 'Delete all' stay above the rows
  assert.ok(mcSrc.indexOf('tr("Use the order from the holes")') < mcSrc.indexOf("{lookNow.map("));
});

test("#4102 Modelling codes rendered: past six codes the layers are in the fold, the overburden and cross-cutting codes stay in view; up to six, all in view", async () => {
  const { default: Pane } = await import(bundle("src/components/ModellingCodesPane.jsx", "mc.mjs"));
  const names = ["DAC", "AND", "BAS", "TUFF", "SST", "RHY", "GRAN", "OB", "DYKE"];
  const litho = names.map((v, k) => ({ hole_id: "H1", from: k * 10, to: k * 10 + 10, value: v }));
  const roleOf = (n) => ({ OB: "overburden", DYKE: "cross-cutting" }[n] || "stratigraphic");
  const props = (rows) => ({ litho: rows, modellingCodes: { codes: [], assign: {}, ties: [] }, setModellingCodes: () => {}, groupOf: null, defaultRole: roleOf, pickMode: false, setPickMode: () => {}, selected: null, setSelected: () => {}, connectFrom: null, setConnectFrom: () => {}, askPrompt: () => {}, pBtn: {}, unitBody: null, setUnitBody: () => {}, inputStyle: {}, view: null });
  const html = renderToStaticMarkup(h(Pane, props(litho)));
  const open = html.indexOf("<details"), fold = html.slice(open, html.indexOf("</details>", open));
  assert.ok(open > 0 && html.includes("Stratigraphic, assumed (7)"), "seven layers wait in the fold, named for what they are: assumed");
  for (const n of ["OB", "DYKE"]) { const at = html.indexOf(`aria-label="Role of ${n}"`); assert.ok(at > 0 && at < open, `${n} is in view`); assert.ok(!fold.includes(`aria-label="Role of ${n}"`), `${n} is not in the fold`); }
  for (const n of ["DAC", "AND", "BAS", "TUFF", "SST", "RHY", "GRAN"]) assert.ok(fold.includes(`aria-label="Role of ${n}"`), `${n} is in the fold`);
  const few = renderToStaticMarkup(h(Pane, props(litho.slice(0, 5))));
  assert.ok(!few.includes("Stratigraphic, assumed") && few.includes('aria-label="Role of SST"'), "five codes: all in view, no fold");
  const none = renderToStaticMarkup(h(Pane, props(litho.slice(0, 7))));
  assert.ok(none.includes("Stratigraphic, assumed (7)") && !none.includes("All the codes"), "seven layers and nothing to look at: the fold alone");
});

test("#4102 Correlation > Intervals: the tick boxes past six codes and the sheet correlation are folds, with the same controls", () => {
  assert.match(mcSrc, /\{loggedCodes\.length > 6\s*\? <MoreFold summary=\{numberCodes\.length \? tr\("Codes to number: \{codes\}"/);
  assert.ok(mcSrc.includes('tr("Codes to number ({n})", { n: loggedCodes.length })') && mcSrc.includes(": codePicker}"));
  assert.ok(mcSrc.includes('<MoreFold summary={tr("Correlate sheets between holes (optional)")} data-more-sheets=""'));
  const at = mcSrc.indexOf('data-more-sheets=""'), sheets = mcSrc.slice(at, mcSrc.indexOf("</MoreFold>)}", at));
  for (const k of ["setSheetAtt(", 'tr("Correlate {v} into sheets"', "computeSheets()", 'tr("Preview the sheets in 3D")', "setSheetMsg("]) assert.ok(sheets.includes(k), k);
  const picker = mcSrc.slice(mcSrc.indexOf("const codePicker = ("), mcSrc.indexOf("const numberSection"));
  assert.ok(picker.includes('type="checkbox"') && picker.includes("setNumberCodes("));
  assert.ok(mcSrc.indexOf('tr("Auto-number {v}"') > mcSrc.indexOf("</MoreFold>", mcSrc.indexOf("data-more-number")), "the Auto-number button is below the picker's fold");
  for (const l of LOCALES) { const d = dict(l); for (const k of ["Stratigraphic, assumed ({n})", "Codes to number: {codes}", "Codes to number ({n})"]) assert.ok(d[k], `${l}: ${k}`); assert.ok(!("All other codes ({n})" in d) && !("All the codes are stratigraphic layers." in d)); }
});

test("#4102 the survey card: the details are one Fine-tune fold; the name, hide, rename, export, remove, the count and 'Draw interpretation lines…' stay out", () => {
  const g = read("src/modules/GeophysicsModule.jsx");
  const at = g.indexOf('data-fine-tune="survey"'), end = g.indexOf("</MoreFold>", at), card = g.slice(g.lastIndexOf("paneSurveys.map((sv) => {"), at), fold = g.slice(at, end);
  assert.ok(at > 0 && end > at);
  for (const k of ["setRenamingSurvey(sv.key)", "exportSurvey(sv.key)", "Remove survey", "meta.hidden", 'tr("Draw interpretation lines…")']) assert.ok(card.includes(k), `in view: ${k}`);
  assert.ok(!fold.includes('tr("Draw interpretation lines…")'));
  for (const k of ["updateGeophysSurvey(sv.key, { method: e.target.value", "updateGeophysSurvey(sv.key, { units: e.target.value", "updateGeophysSurvey(sv.key, { zMeaning: e.target.value }", "setEqsFor(eqsFor === sv.key ? null : sv.key)", "setGravFor(gravFor === sv.key ? null : sv.key)", "convertAgl(sv.key)", "<EqsGridBox", "<GravityReductionBox"]) assert.ok(fold.includes(k), `in the fold: ${k}`);
  assert.ok(g.includes('!noValue && !meta.method ? tr("Fine-tune: method not set…") : tr("Fine-tune…")'), "a survey with no method says so on the closed fold");
  for (const l of LOCALES) assert.ok(dict(l)["Fine-tune: method not set…"], l);
});

test("#4102 the Blake River load notice: what loaded, in one sentence; where next and the licence behind its More", async () => {
  const { BLAKE } = await import(bundle("src/lib/sampleBlakeRiver.js", "blake.mjs"));
  const n = BLAKE.msgs.loaded("767 × 424", 7810);
  assert.match(n.text, /^Loaded the Blake River gravity sample \(Geological Survey of Canada; no drillholes\): the published Bouguer anomaly grid \(767 × 424 nodes at 100 m, mGal\) and 7,810 gravity stations\.$/);
  assert.ok(/Open Maps for the grid/.test(n.more) && /README\.md for the source and the licence/.test(n.more));
  assert.ok(n.text.split(/\s+/).length < 32, "short");
  for (const l of LOCALES) { const d = dict(l); assert.ok(d["Loaded the Blake River gravity sample (Geological Survey of Canada; no drillholes): the published Bouguer anomaly grid ({size} nodes at 100 m, mGal) and {n} gravity stations."], l); assert.ok(d["Open Maps for the grid, its contours and filters, or Geophysics > Point survey to grid the stations yourself and compare. See sample_data/blake_river/README.md for the source and the licence."], l); }
});

test("#4102 the draw-the-area map: 'no tiles are loaded' and 'nothing is fetched' are one sentence; the banner says how to draw", () => {
  const b = read("src/components/BasemapView.jsx");
  assert.ok(b.includes('tr("No map tiles are loaded, and nothing is fetched for the project until you press {confirm}.", { confirm: tr(confirmLabel) })'));
  assert.ok(b.includes("mode === \"draw\" ? tr(\"Draw the area over the project's collars and layer outlines, or choose it from the list.\") : tr(\"No map tiles are loaded until you ask.\")"));
  assert.ok(!b.includes("is off: no tiles are loaded. Nothing is fetched"), "the two-sentence header is gone");
  assert.ok(b.includes('tr("The online basemap ({layer}) is off: no tiles are loaded.", { layer:'), "the Locate map keeps its own header (maps3463group)");
  const gone = "No map tiles are loaded until you ask: draw the area over the project's collars and layer outlines, or choose it from the list.";
  for (const l of LOCALES) { const d = dict(l); for (const k of ["No map tiles are loaded, and nothing is fetched for the project until you press {confirm}.", "Draw the area over the project's collars and layer outlines, or choose it from the list.", "No map tiles are loaded until you ask."]) assert.ok(d[k], `${l}: ${k}`); assert.ok(!(gone in d), `${l}: the old banner key is gone`); }
});

test("#4102 SQL workspace: the table names stay in view, the columns are behind 'Columns', and the quoting note goes with them", () => {
  const s = read("src/components/SQLWorkspaceModal.jsx");
  const at = s.indexOf('data-more-columns=""'), end = s.indexOf("</MoreFold>", at), fold = s.slice(at, end);
  assert.ok(at > 0 && fold.includes('t.columns.map(sqlColumnLabel).join(", ")') && fold.includes("Columns shown in double quotes"));
  const names = '{state.tables.map((t) => t.name).join(", ")}';
  assert.ok(s.includes(names) && s.indexOf(names) < at, "the names stay above the fold");
  assert.ok(s.includes('import MoreFold from "./MoreFold.jsx"'));
});

test("#4102 a notice's own More reaches the sidebar's Recent messages (it was dropped there): NoticeLine shows it behind a closed More", async () => {
  const n = read("src/modules/viewer/NoticeLine.jsx"), v = read("src/modules/ViewerModule.jsx");
  assert.ok(n.includes("more = null") && n.includes('{more && <details data-more-fold=""'), "NoticeLine takes `more`");
  assert.ok(v.includes('<NoticeLine key={i} text={noticeText(n)} error={noticeLevel(n) === "error"} more={n?.more} />'), "the list passes it");
  const { default: NL } = await import(bundle("src/modules/viewer/NoticeLine.jsx", "nl.mjs"));
  const withMore = renderToStaticMarkup(h(NL, { text: "Loaded the sample.", more: "See README.md for the source and the licence." }));
  assert.ok(withMore.includes("<details") && withMore.includes(">More<") && withMore.includes("See README.md for the source and the licence."));
  assert.ok(!renderToStaticMarkup(h(NL, { text: "Loaded the sample." })).includes("<details"), "no fold without details");
});
