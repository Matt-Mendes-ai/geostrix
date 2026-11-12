// TASKS.csv #2993 (review #2876, WA iron) — 'Density by Lithology' offered boxes for the first 30 codes by name only: SC, SNAM, SONAM and TNAM
// (two of the five ore strands) had none, and the result's 'other blocks took the density above' did not say which codes. Now every code, most
// logged metres first, 30 shown until 'Show all', and the codes with no density typed named in the result.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { codesByMetres, cellsWithCodeDensity } from "../src/lib/densityByCode.js";
import { densityUsedText } from "../src/components/densityUsedText.js";

test("#2993 every code, most logged metres first (a point row counts 1 m), ties by name", () => {
  // 30 minor codes A00..A29 logged 1 m each, and four ore strands late in the alphabet logged far more
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push({ hole_id: "H", from: i, to: i + 1, value: `A${String(i).padStart(2, "0")}` });
  for (const [code, m] of [["TNAM", 400], ["SONAM", 300], ["SNAM", 120], ["SC", 5]]) rows.push({ hole_id: "H", from: 100, to: 100 + m, value: code });
  rows.push({ hole_id: "H", depth: 3, value: "PT" }, { hole_id: "H", from: 0, to: 1, value: "  " });
  const c = codesByMetres(rows);
  assert.equal(c.length, 35, "every code (blank left out)");
  assert.deepEqual(c.slice(0, 4).map((x) => x.code), ["TNAM", "SONAM", "SNAM", "SC"]);
  assert.ok(c.slice(0, 30).some((x) => x.code === "TNAM"), "the ore strands are in the first 30 shown");
  assert.equal(c.find((x) => x.code === "PT").m, 1);
});

test("#2993 the blocks of a code with no density typed are named in the result", () => {
  const cells = [{ k: "ONAM" }, { k: "TNAM" }, { k: "TNAM" }, { k: "SONAM" }, { k: null }];
  const j = cellsWithCodeDensity(cells, (c) => c.k, { ONAM: "3.13" });
  assert.deepEqual(j.untyped, [{ code: "TNAM", n: 2 }, { code: "SONAM", n: 1 }]);
  const text = densityUsedText({ layer: "litho", used: j.used, untyped: j.untyped });
  assert.match(text, /ONAM 3\.13 t\/m³ \(1 blocks\); 4 other blocks took the density above\. Codes with no density typed: TNAM \(2 blocks\), SONAM \(1 blocks\)\./);
  assert.ok(!/Codes with no density/.test(densityUsedText({ layer: "litho", used: j.used })), "an older result (no untyped) reads as before");
});

test("#2993 wiring: no 30-by-name cut; Show all; the three pit panes pass the untyped codes", () => {
  const p = fs.readFileSync(new URL("../src/components/PitShellPane.jsx", import.meta.url), "utf8");
  assert.ok(!p.includes(".sort().slice(0, 30)"));
  assert.ok(p.includes("codesByMetres(layers?.[f.densityLayer]).map((c) => c.code)"));
  assert.ok(p.includes("Show all {n} codes ({k} more, the least logged)"));
  for (const f of ["PitShellPane.jsx", "NestedPitsPane.jsx", "PitDesignPane.jsx"]) assert.ok(fs.readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8").includes("untyped: coded.untyped || null /* #2993 */"), f);
});
