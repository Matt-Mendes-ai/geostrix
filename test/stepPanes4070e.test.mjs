// TASKS.csv #4070 part 5 — the StrixViewer tab (the Basic path): the audit (live on Harry and WA lode gold, 1366 x 768) found the loaded sidebar already short (about 300
// words, the layer rows are one line each), so the work is where words and controls pile up: the Fence series and Section-by-coordinates panes as steps, Best intercepts'
// rarer settings and Data QC's thresholds behind closed folds (and Data QC's row buttons in one line, they ran over the next row), the sidebar's long notices as two lines,
// the layer menu's six exports in one closed group, and the empty card's sample buttons and the shared empty-state button on the gold primary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const reachable = (src, list, who) => assert.deepEqual(list.filter((k) => !src.includes(k)), [], who);

test("Fence series: the azimuth, width and area as the question, Generate as the action, the explanation in Fine-tune; Section by coordinates: four numbers, Open section as the action", () => {
  const v = read("src/modules/ViewerModule.jsx");
  assert.match(v, /<StepPane id="fence" label=\{tr\("Slice series \(fence sections\)"\)\}/);
  assert.match(v, /<StepPane id="sectionCoords" label=\{tr\("Section by coordinates"\)\}/);
  assert.ok(v.includes('key: "fence"') && v.includes('key: "section"'));
  assert.match(v, /label: tr\("Generate"\), onClick: generateSliceSeries/);
  assert.match(v, /label: tr\("Open section"\), onClick: openTypedSection/);
  assert.match(v, /data-fine-tune="fence"/);
  assert.match(v, /data-fine-tune="sectionCoords"/);
  reachable(v, ["setSliceSeriesAzimuth(", "setSliceSeriesWidth(", "<FenceOptions", "setTypedSection(", "Cut the drilling into equal-width parallel sections", "Buffer {sectionCorridor} m (set on the section tool)"], "section panes");
});

test("Best intercepts: the element, unit, cut-off, dilution and length first; the higher cut-off, top cut, weighting, metal equivalent, extra elements, true width, host unit and QC samples in one closed fold", () => {
  const b = read("src/components/BestIntercepts.jsx"), f = b.indexOf('<MoreFold summary={tr("More settings…")} data-fine-tune="best-intercepts">');
  assert.ok(f > 0, "the fold");
  for (const k of ['tr("Element")', 'tr("Cutoff ({unit})"', 'tr("Min length (m)")', "setMinLength("]) assert.ok(b.indexOf(k) > 0 && b.indexOf(k) < f, `${k} is first`);
  const fold = b.slice(f, b.indexOf('tr("Hole contains")'));
  for (const k of ["setIncludeQAQC(", "setWeightBy(", "setMeqOn(", "toggleExtraSymbol", "setTwOn(", "setDomainLayer(", 'tr("Host domain")', 'tr("True width")', 'tr("Also show:")', 'tr("Including at', 'tr("Top cut', 'tr("Min grade']) assert.ok(fold.includes(k), `${k} is in the fold`);
  assert.ok(b.includes("setTwOn(") && b.includes("setMeqOn(") && b.includes("toggleExtraSymbol"), "the settings are still there");
  assert.ok(b.indexOf('tr("Hole contains")') > f, "the results (hole filter, table) follow the fold");
});

test("Data QC: the density range, dogleg limit and terrain check in a closed Thresholds fold, the row's Table / Find / Checked in one line, the footer is Export and Re-run", () => {
  const d = read("src/components/DataQCModal.jsx");
  assert.match(d, /<MoreFold summary=\{tr\("Thresholds…"\)\} data-fine-tune="data-qc-thresholds"/);
  reachable(d, ["applyDensity(", "setDoglegWarn(", "snapToTerrain", "requestCollarZFromTerrain", "exportIssues", "onClick={check}", "toggleChecked(issue)", "openDataTable(", "onZoomHole(issue.holeId)"], "Data QC");
  assert.ok(d.indexOf("Plausible density, lowest") > d.indexOf('data-fine-tune="data-qc-thresholds"'), "the density boxes are in the fold");
  assert.match(d, /display: "flex", gap: 4, flexShrink: 0, alignItems: "center"/, "the row buttons side by side");
  assert.doesNotMatch(d, /flexDirection: "column", gap: 2, flexShrink: 0, justifyContent: "center"/, "no column of three buttons in a 52 px row");
});

test("Recent messages: a long notice is two lines, its full text in the tooltip and on a click; a short one as before", () => {
  const n = read("src/modules/viewer/NoticeLine.jsx"), v = read("src/modules/ViewerModule.jsx");
  assert.match(n, /LONG_NOTICE = 140/);
  assert.match(n, /WebkitLineClamp: 2/);
  assert.match(n, /title: open \? undefined : String\(text\)/);
  assert.match(v, /<NoticeLine key=\{i\} text=\{noticeText\(n\)\} error=\{noticeLevel\(n\) === "error"\} \/>/);
  assert.ok(v.includes("copyText(notices.map(noticeText).join"), "Copy still takes the whole text");
});

test("the layer menu: the six exports are one closed Export group, Inspect / edit table and the group items stay in the menu", () => {
  const v = read("src/modules/ViewerModule.jsx"), g = read("src/modules/viewer/ContextGroup.jsx");
  const a = v.indexOf('<ContextGroup label={tr("Export")}>'), z = v.indexOf("</ContextGroup>", a);
  assert.ok(a > 0 && z > a);
  const body = v.slice(a, z);
  for (const k of ["Export Shapefile (.zip)…", "Export GeoPackage (.gpkg)…", "Export DXF (.dxf)…", "Export GOCAD (.vs / .pl)…", "Export CSV table (imports back)…", "Export all drillhole tables (.zip of CSV)…"]) assert.ok(body.includes(k), k);
  assert.ok(v.indexOf('tr("Inspect / edit table…")', z) > z, "Inspect / edit is outside the group");
  assert.match(g, /useState\(false\)/, "closed until asked for");
});

test("the empty card: the first sample and the shared empty-state button are the gold primary, the other samples the white secondary; no own blue", () => {
  const s = read("src/modules/viewer/SampleButtons.jsx"), e = read("src/components/EmptyState.jsx");
  assert.match(s, /className=\{firstFilled && i === 0 \? "gs-btn gs-btn--primary" : "gs-btn"\}/);
  assert.doesNotMatch(s + e, /2f6f9f|2a6291/);
  assert.match(e, /<button className="gs-btn gs-btn--primary" onClick=\{onAction\}/);
});

test("the new strings are in every language", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(read(`src/locales/${lang}.json`));
    for (const k of ["More settings…", "Thresholds…", "Where is the section?", "Which sections?"]) assert.ok(d[k], `${lang}: ${k}`);
  }
});
