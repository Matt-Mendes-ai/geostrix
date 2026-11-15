// TASKS.csv #3511 (of #3447) — the readers of a survey's value leave a positions-only survey (an electrode list: every point carries 0) alone: the Geophysics pane's colour
// range, legend editor, gridding, sampling along the holes and spatial analysis read the measured surveys; its card has no method, units, equivalent sources or
// gravity reduction; the evidence overlay does not offer it as a source. Source pins (the lists are inside a component).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const g = read("../src/modules/GeophysicsModule.jsx");

test("the measured lists are the survey list and the rows without the positions-only surveys", () => {
  assert.match(g, /const measuredList = useMemo\(\(\) => surveyList\.filter\(\(s\) => !geophysSurveys\[s\.key\]\?\.positionsOnly\), \[surveyList, geophysSurveys\]\);/);
  assert.match(g, /const measuredRows = useMemo\(\(\) => \(measuredList\.length === surveyList\.length \? rows : rows\.filter\(\(r\) => !geophysSurveys\[surveyKey\(r\)\]\?\.positionsOnly\)\)/);
  assert.match(g, /const drawnRange = useMemo\(\(\) => robustRange\(measuredRows\.map\(\(r\) => r\.value\)\), \[measuredRows\]\);/, "the colour range is not pulled to 0 by electrodes");
});

test("the legend editor, the gridding survey, sampling along the holes and the spatial analysis read the measured surveys", () => {
  assert.match(g, /const manySurveys = measuredList\.length > 1;/);
  assert.match(g, /const legendKey = measuredList\.some\(\(s\) => s\.key === legendSurvey\) \? legendSurvey : measuredList\[0\]\?\.key \|\| "";/);
  assert.match(g, /: measuredRows\), \[manySurveys, rows, measuredRows, legendKey\]\);/, "the legend's rows with one survey: the measured ones");
  assert.match(g, /const idwKey = measuredList\.some\(\(s\) => s\.key === idwSurvey\) \? idwSurvey : measuredList\[0\]\?\.key \|\| "";/);
  assert.match(g, /\{measuredList\.length > 1 && \(\n\s+<div style=\{\{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 \}\}>/, "the gridding's survey select");
  assert.match(g, /\{measuredList\.map\(\(s\) => <option key=\{s\.key\} value=\{s\.key\}>\{s\.key\} \(\{s\.count\.toLocaleString\(\)\}\)<\/option>\)\}/);
  assert.match(g, /<SpatialAnalysis points=\{measuredRows\} surveys=\{measuredList\.map\(/);
});

test("a positions-only survey's card keeps its name, show / hide, rename, export, remove and z meaning, and drops the value-based controls", () => {
  assert.match(g, /const meta = geophysSurveys\[sv\.key\] \|\| \{\}, noValue = !!meta\.positionsOnly;/);
  assert.match(g, /\{!noValue && <div style=\{\{ display: "flex", gap: 6, marginTop: 5 \}\}>\n\s+<select value=\{meta\.method \|\| ""\}/, "the method / units row");
  assert.match(g, /placeholder=\{tr\("units"\)\}[^\n]*\n\s+<\/div>\}/);
  assert.match(g, /\{!noValue && <>\n\s+\{\/\* TASKS\.csv #1985 — gridded on one level with equivalent sources[\s\S]*?GravityReductionBox[^\n]*\n\s+<\/>\}/, "equivalent sources and gravity reduction");
  assert.match(g, /\{\/\* TASKS\.csv #1152 — interpretation lines over this survey/, "drawing interpretation lines over the electrodes stays");
});

test("the evidence overlay does not offer it as a source, and the inversion list already left it out (#3447)", () => {
  assert.match(read("../src/components/EvidenceOverlayPane.jsx"), /surveyNames\(geophysPts\)\.forEach\(\(k\) => geophysSurveys\[k\]\?\.positionsOnly [^\n]*\|\| out\.push\(/);
  assert.match(read("../src/components/InversionPanel.jsx"), /!geophysSurveys\?\.\[r\._src \|\| ""\]\?\.positionsOnly/);
});
