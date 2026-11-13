// TASKS.csv #3076 (#2900 (9) and (10), WA review) — the CRS box's first example, '52.2, -121.3', was a place in British Columbia: now one point
// written both ways, in no mining district. A downhole log layer was named 'downhole_logs: Density_Best' with no unit: the unit read or typed is
// in the name, and a channel with none is said at import.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLatLon } from "../src/lib/projectCrs.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the CRS box's example is one point both ways, and the box reads both", () => {
  const m = read("../src/components/ProjectCrsModal.jsx");
  assert.match(m, /placeholder=\{tr\("e\.g\. 12\.5, -45\.5 or 12\.5 N 45\.5 W"\)\}/);
  assert.doesNotMatch(m, /52\.2, -121\.3/);
  assert.deepEqual(parseLatLon("12.5, -45.5"), parseLatLon("12.5 N 45.5 W"));
  const p = parseLatLon("12.5 N 45.5 W");
  assert.equal(p.lat, 12.5); assert.equal(p.lon, -45.5);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(read(`../src/locales/${lang}.json`));
    assert.ok(d["e.g. 12.5, -45.5 or 12.5 N 45.5 W"], lang);
    assert.equal(d["e.g. 52.2, -121.3 or 23.5 S 46.6 W"], undefined, `${lang}: the old key is gone`);
  }
});

test("a log layer's name carries its unit, unless the column already says it; a channel with no unit is named in a notice", () => {
  const s = read("../src/modules/viewer/useImportPipeline.js");
  assert.match(s, /const name = `\$\{base\}: \$\{col\}\$\{unit && !String\(col\)\.toLowerCase\(\)\.includes\(unit\.toLowerCase\(\)\) \? ` \(\$\{unit\}\)` : ""\}`;/);
  assert.match(s, /if \(!unit\) noUnit\.push\(col\);/);
  assert.match(s, /tr\("\{fileName\}: no unit for \{cols\}: the column name gives none and none was typed, so the values are as logged with no unit\."/);
  // the rule, as the import applies it
  const nameOf = (base, col, unit) => `${base}: ${col}${unit && !String(col).toLowerCase().includes(unit.toLowerCase()) ? ` (${unit})` : ""}`;
  assert.equal(nameOf("downhole_logs", "Density_Best", "g/cc"), "downhole_logs: Density_Best (g/cc)");
  assert.equal(nameOf("logs", "Gamma (cps)", "cps"), "logs: Gamma (cps)", "the column already says it");
  assert.equal(nameOf("logs", "Density_Best", ""), "logs: Density_Best");
});
