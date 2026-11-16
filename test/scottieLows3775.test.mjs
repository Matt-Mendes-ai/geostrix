// TASKS.csv #3775 (3D View slips), #3776 (the model box against the drilling), #3779 (3D Modelling slips): the pieces done outside ViewerModule.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { holesForFilter, holeSetsOf, setKeyByLabel } from "../src/lib/holeFilter.js";
import { allocateLegendRows } from "../src/lib/legendGroups.js";
import { runQuery } from "../src/lib/sqlRun.js";

const require = createRequire(import.meta.url);
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const hasKeys = (keys) => { for (const k of keys) for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 40)}`); };

test("#3775 (3) the hole filter: dip and azimuth as the collar table prints them, and has: by a layer's own name", () => {
  const collars = [{ hole_id: "A", dip: 50, azimuth: 100 }, { hole_id: "B", dip: 80, azimuth: 200 }, { hole_id: "C" }];
  const hs = holeSetsOf([{ hole_id: "A" }], { litho: [{ hole_id: "B" }] });
  const ids = (f) => holesForFilter(collars, f, { holeSets: hs }).holes.map((c) => c.hole_id);
  assert.deepEqual(ids("dip<-60"), ["B"]); // negative down: 80° stored, -80 printed
  assert.deepEqual(ids("dip>=-55"), ["A"]);
  assert.deepEqual(ids("azimuth>150"), ["B"]); assert.deepEqual(ids("az<150"), ["A"]);
  assert.deepEqual(ids("has:Lithology"), ["B"]); assert.deepEqual(ids("has:litho"), ["B"]); assert.deepEqual(ids("no:lithology"), ["A", "C"]);
  assert.equal(holesForFilter(collars, "has:nonsense", { holeSets: hs }).hint.kind, "set");
  assert.equal(setKeyByLabel("lithology", hs), "litho"); assert.equal(setKeyByLabel("zzz", hs), null);
});

test("#3775 (8) the legend names the rows it leaves out", () => {
  const groups = [{ items: Array.from({ length: 10 }, (_, i) => [`U${i}`, "#000"]) }];
  const r = allocateLegendRows(groups, 6);
  assert.equal(r.total - r.shown, 4); assert.deepEqual(r.omitted, ["U6", "U7", "U8", "U9"]);
  assert.deepEqual(allocateLegendRows(groups, 20).omitted, []);
  assert.match(read("../src/components/ViewportFigureOverlay.jsx"), /omitted\.length \? tr\("\+ \{hiddenCount\} more not shown, among them \{names\}/);
  hasKeys(["+ {hiddenCount} more not shown, among them {names} — filter categories, or build the figure in Layout"]);
});

test("#3775 (6) the SQL workspace is read-only: a DELETE is refused in words and the table is untouched", async () => {
  const SQL = await require("sql.js")();
  const db = new SQL.Database();
  db.run("CREATE TABLE assays (h TEXT, Zn REAL); INSERT INTO assays VALUES ('x', 10);");
  db.run("PRAGMA query_only = ON");
  assert.throws(() => runQuery(db, "DELETE FROM assays"), /read-only copy of the project's tables/);
  assert.equal(runQuery(db, "SELECT * FROM assays").rows.length, 1);
  assert.match(read("../src/lib/sqlWorkspace.js"), /db\.run\("PRAGMA query_only = ON"\)/);
  hasKeys(["This workspace is a read-only copy of the project's tables: only queries that read run here, and the project is never changed."]);
});

test("#3775 wired: Style dialog g/t, '+ is away', strip-log axes note, slice holes, Data table filter", () => {
  const style = read("../src/components/AssayStyleModal.jsx");
  assert.match(style, /const unitLbl = gradeUnitLabel\(symbol, unit\);/); assert.match(style, /\{unitLbl\}<\/span>/);
  assert.match(read("../src/components/SectionWindow.jsx"), /tr\("\(\+ is away from the viewer, − towards\)"\)/);
  assert.match(read("../src/components/StripLog.jsx"), /Automatic: \{lin\} on a linear axis/);
  assert.match(read("../src/components/SlicePlaceRow.jsx"), /const shown = useHoleVisibility\(\);/);
  assert.match(read("../src/components/DrillTableModal.jsx"), /const dFilters = useDeferredValue\(colFilters\), dSearch = useDeferredValue\(search\);/);
  hasKeys(["(+ is away from the viewer, − towards)", "Automatic: {lin} on a linear axis (their values span under two decades), {log} on a log axis.", "The {n} checked holes of {all}."]);
});

test("#3776 the model box notice states the box against the drilling", () => {
  const r = read("../src/modules/viewer/modellingRuns.js");
  assert.match(r, /if \(vPad != null && colHit && !anisotropy\.enabled\) \{\n\s*const upM = zmax - colR\.max, downM = colR\.min - zmin;/);
  assert.match(r, /notice\("The model box runs \{up\} m above the highest drilled point and \{down\} m below the deepest hole end/);
  hasKeys(["The model box runs {up} m above the highest drilled point and {down} m below the deepest hole end ({drilled} m drilled): the rock in those parts is not tested by any hole, and a unit volume counts it."]);
});

test("#3779 (2) (7) (8) the refusal says why, a new trend takes its fit's name, Veins / dykes says how a unit gets in", () => {
  const t = read("../src/components/TrendsPanel.jsx"), m = read("../src/modules/viewer/ModellingPanes.jsx");
  assert.match(t, /why = tr\("\{code\} has \{n\} top\(s\) here and a plane needs at least \{min\}\./);
  assert.match(t, /tr\("Not enough data to fit a plane: \{why\}", \{ why \}\)/);
  assert.match(t, /\|\| \/\^Trend \\d\+\$\/\.test\(t\.name \|\| ""\)/);
  assert.ok(/^Trend \d+$/.test("Trend 2") && !/^Trend \d+$/.test("My trend"));
  assert.match(m, /vein_units\.length > 0 && <div[^>]*>\{tr\("The list holds the Veins log and every lithology code whose role is cross-cutting/);
  hasKeys([
    "{code} has {n} top(s) here and a plane needs at least {min}. A unit has a top only where a younger unit lies above it in the Modelling codes order: the youngest has none.",
    "{name} gave {n} point(s), too few to fix a plane.", "Not enough data to fit a plane: {why}",
    "The list holds the Veins log and every lithology code whose role is cross-cutting in Modelling codes. A unit that is missing: set its role there.",
  ]);
});
