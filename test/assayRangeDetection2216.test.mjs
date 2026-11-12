// TASKS.csv #2216 (review #2174, WA gold) — the assay style said 'Data range: 0.005 – 700 ppm' where 0.005 is the stored half of '<0.01':
// a substitute shown as a measured value. With lab '<' flags the range now says '<0.01 (135 below detection) – 700'.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assayClassRange } from "../src/lib/assayClasses.js";

test("#2216 the basis carries the lowest detection limit as the lab wrote it (twice the half-limit substitute)", () => {
  const rows = [
    ...Array.from({ length: 135 }, () => ({ values: { Au: 0.005 }, qualifiers: { Au: "<" } })),
    ...Array.from({ length: 5 }, () => ({ values: { Au: 0.025 }, qualifiers: { Au: "<" } })), // a coarser limit, <0.05
    { values: { Au: 0.02 } }, { values: { Au: 1.2 } }, { values: { Au: 700 } },
  ];
  const r = assayClassRange(rows, "Au");
  assert.equal(r.basis.kind, "flags");
  assert.equal(r.basis.left, 140);
  assert.equal(r.basis.limit, 0.01);
  assert.equal(r.min, 0.005, "the stored minimum is unchanged (the marker sizes use it)");
  const none = assayClassRange([{ values: { Au: 1 } }, { values: { Au: 2 } }], "Au");
  assert.equal(none.basis.limit, undefined);
});

test("#2216 the style dialog says '<limit (n below detection)' when the range comes from flagged rows", () => {
  const m = readFileSync(new URL("../src/components/AssayStyleModal.jsx", import.meta.url), "utf8");
  assert.match(m, /range\.basis\?\.kind === "flags" && Number\.isFinite\(range\.basis\.limit\)[^?]*\? tr\("Data range: <\{dl\} \(\{n\} below detection\) – \{max\} \{unit\}"/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["Data range: <{dl} ({n} below detection) – {max} {unit}"], l);
});
