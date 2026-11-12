// TASKS.csv #2804 (#2303's print pass) — the viewport batch's progress line names the batch's own task (req.batch.label, translated by the
// store) instead of always 'Centring each atlas page's map on its hole'; the atlas wording stays when no label is sent.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#2804 the batch label, else the atlas text", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /label: req\.batch\.label \? tr\("\{v\}: \{i\} of \{n\}", \{ v: req\.batch\.label, i: req\.batch\.index, n: req\.batch\.total \}\)[^:]*: tr\("Centring each atlas page's map on its hole: \{i\} of \{n\}"/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["{v}: {i} of {n}"], l);
});
