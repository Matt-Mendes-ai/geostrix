// TASKS.csv #1164 — the optional columns of the Best intercepts table appear in the same order in the header and the rows
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("#1164 header and row cells: Including before the metal equivalent, in both", () => {
  const src = fs.readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  const order = (tag) => ["incOn", "meqReady"].map((k) => src.indexOf(`{${k} && <${tag}`)).map((i, _, a) => (assert.ok(i > 0), i));
  const [hInc, hMeq] = order("th"), [rInc, rMeq] = order("td");
  assert.ok(hInc < hMeq, "header: Including first");
  assert.ok(rInc < rMeq, "rows: Including first");
});
