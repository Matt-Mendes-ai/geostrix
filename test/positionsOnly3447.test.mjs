// TASKS.csv #3447 — a point file with no measured value (an electrode list) imports as positions only: the picker's "(none: positions only)" for Value,
// every point carrying 0, the survey's record saying positionsOnly, one colour and one legend swatch, and not offered to the inversion. SYNTHETIC points.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { NO_VALUE, withPositionsValue } from "../src/lib/positionsOnly.js";
import { geophysLegendGroups } from "../src/lib/legendGroups.js";
import { makeSurveyColorer } from "../src/lib/geophysSurveys.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("Value 'none' adds a value column of 0 to the rows; any other column leaves them as they are", () => {
  const rows = [{ E: 1, N: 2, Elev: 10 }, { E: 3, N: 4, Elev: 11 }];
  const out = withPositionsValue(rows, NO_VALUE);
  assert.deepEqual(out.map((r) => r[NO_VALUE]), [0, 0]);
  assert.deepEqual(out.map((r) => r.Elev), [10, 11]);
  assert.equal(rows[0][NO_VALUE], undefined, "the picked rows are not changed");
  assert.equal(withPositionsValue(rows, "Elev"), rows);
  assert.deepEqual(withPositionsValue(null, NO_VALUE), []);
});

test("one colour: every value is 0, so the survey is drawn in the one colour its ramp starts at", () => {
  const rows = [0, 1, 2].map((i) => ({ x: i, y: i, z: 5, value: 0, _src: "electrodes.csv" }));
  const c = makeSurveyColorer(rows, {}, { "electrodes.csv": { positionsOnly: true } });
  const colours = new Set(rows.map((r) => c.colorOf(r).color));
  assert.equal(colours.size, 1);
});

test("the legend: a positions-only survey is one swatch in its own colour, no ramp; a measured survey keeps its ramp", () => {
  const rows = [
    ...[0, 1, 2].map((i) => ({ x: i, y: i, z: 5, value: 0, _src: "electrodes.csv" })),
    ...[0, 1, 2, 3].map((i) => ({ x: i, y: i, z: 5, value: 100 + i * 10, _src: "mag.csv" })),
  ];
  const groups = geophysLegendGroups({ rows, surveys: { "electrodes.csv": { positionsOnly: true }, "mag.csv": { units: "nT" } } });
  assert.equal(groups.length, 2);
  const el = groups.find((g) => g.key === "geophys_pts_electrodes.csv"), mag = groups.find((g) => g.key === "geophys_pts_mag.csv");
  assert.equal(el.items.length, 1);
  assert.match(el.items[0][0], /^electrodes\.csv \(3\)$/);
  assert.equal(el.items[0][2].kind, "point");
  assert.match(String(el.items[0][1]), /^rgb\(|^#/, "a colour");
  assert.ok(mag.scale || mag.items.length >= 2 || mag.ramp || Object.keys(mag).length > 2, "the measured survey still has its ramp group");
  assert.notDeepEqual(Object.keys(el).sort(), Object.keys(mag).sort(), "the swatch group is not a ramp group");
});

test("wired: the picker's option, the value column, the survey's record and card, the legend and the inversion's list", () => {
  const g = read("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /import \{ NO_VALUE, withPositionsValue \} from "\.\.\/lib\/positionsOnly\.js";/);
  assert.match(g, /\{key === "valueCol" && !xyzPending\.batch && !xyzPending\.stream && <option value=\{NO_VALUE\}>\{tr\("\(none: positions only\)"\)\}<\/option>/);
  assert.match(g, /const parsedRows = withPositionsValue\(Array\.isArray\(streamedRows\) \? streamedRows : everyNth\(xyzPending\.rows, thinBy\), valueCol\);/);
  assert.match(g, /if \(valueCol === NO_VALUE\) \{ updateGeophysSurvey\(keyOf\(fileName\), \{ positionsOnly: true, units: "" \}\);/);
  assert.match(g, /if \(!jobs && valueCol !== NO_VALUE/, "no method is guessed from a column that is not there");
  assert.match(g, /\{meta\.positionsOnly \? tr\("\{count\} points\{v\}, \{withZ\} with elevation · positions only, no measured value"/);
  assert.match(g, /cols\.x && cols\.y && !cols\.value \? " " \+ tr\("If the file only lists positions/);
  assert.match(read("../src/components/InversionPanel.jsx"), /!geophysSurveys\?\.\[r\._src \|\| ""\]\?\.positionsOnly/);
  assert.match(read("../src/lib/legendGroups.js"), /if \(surveys\?\.\[key\]\?\.positionsOnly\) \{/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["(none: positions only)", "{count} points{v}, {withZ} with elevation · positions only, no measured value", "Positions only: it has no measured value, so every point is drawn in one colour and the survey cannot be gridded or inverted.", "If the file only lists positions (electrodes, stations), choose \"(none: positions only)\" for Value."]) assert.ok(d[k], `${lang}: ${k.slice(0, 40)}`);
  }
});
