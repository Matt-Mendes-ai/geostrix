// TASKS.csv #3598 (Fireweed rehearsal, Macpass) — the grade-tonnage table and its CSV say what a model pools: the years its holes were drilled (by
// decade), their hole types, and that no geology model or domain bounds it (lib/poolBasis.js). Review counted Tom West by hand: 143 collars from
// 1952 to 2023, 17 from the 1950s, 38 from the 1970s, 52 since 2010, 6 RC holes among core.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { poolBasis, poolBasisLine } from "../src/lib/poolBasis.js";
import { parseTableText } from "../src/lib/tabular.js";

test("Macpass Tom West: the years by decade, the hole types, one domain", () => {
  const rows = parseTableText(readFileSync(new URL("../sample_data/yk_macpass/collars.csv", import.meta.url), "utf8")).rows;
  const collars = rows.map((r) => ({ hole_id: r.hole_id, x: +r.x, y: +r.y, z: +r.z, attrs: { hole_type: r.hole_type, year: r.year, prospect: r.prospect } }));
  const tw = collars.filter((c) => c.attrs.prospect === "Tom West").map((c) => c.hole_id);
  const b = poolBasis(tw, collars, { domain: null });
  assert.equal(b.holes, 143);
  assert.deepEqual([b.years.min, b.years.max], [1952, 2023]);
  const dec = Object.fromEntries(b.years.decades);
  assert.equal(dec[1950], 17); assert.equal(dec[1970], 38); assert.equal((dec[2010] || 0) + (dec[2020] || 0), 52);
  assert.equal(Object.fromEntries(b.types).RC, 6);
  const line = poolBasisLine(b);
  assert.match(line, /^Pooled: 143 holes drilled 1952-2023 \(1950s 17, .*\); hole types: .*RC 6.*; one domain: no geology model or domain bounds the estimate$/);
  assert.match(poolBasisLine(poolBasis(tw, collars, { domain: "Litho: SHALE" })), /; domain: Litho: SHALE$/);
  assert.equal(poolBasis([], collars), null);
  const bare = poolBasis(["X1"], [{ hole_id: "X1", attrs: {} }]);
  assert.deepEqual([bare.years, bare.types], [null, null], "no year or type column: neither said");
});

test("wiring: the table's line and the CSV header", () => {
  const g = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.match(g, /const pooled = useMemo\(\(\) => \(model\?\.params\?\.holeIds \? poolBasis\(model\.params\.holeIds, collars, model\.params\) : null\), \[model, collars\]\);/);
  assert.match(g, /\.\.\.\(pooled \? \[poolBasisLine\(pooled\)\] : \[\]\), \/\/ #3598/);
  assert.match(g, /tr\("One domain: no geology model or domain bounds the estimate, so every hole's grade informs every block it reaches\."\)/);
});
