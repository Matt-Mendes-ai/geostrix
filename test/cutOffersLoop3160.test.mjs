// TASKS.csv #3160 (part, 5b58c2e4) — a trailing comment swallowed the loop's out.push in Grade stats' cut-off offers: the loop's body became the
// return, so the memo gave undefined with no saved threshold and the dialog closed on cutOffers.length. Found live under #3243.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("Grade stats' threshold offers are pushed in the loop, and the memo returns after it", () => {
  const s = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.match(s, /\.slice\(0, 4\)\) out\.push\(\{ key: "t:" \+ o\.key/);
  assert.match(s, /\}\);\r?\n\s*return out\.filter\(\(o, i, a\) => a\.findIndex/);
});

test("no loop or if in src has its statement after a trailing // comment", () => {
  const root = fileURLToPath(new URL("../src", import.meta.url));
  const bad = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(jsx?|mjs)$/.test(f)) readFileSync(p, "utf8").split(/\r?\n/).forEach((line, i) => {
        if (/^\s*(for|if|while) \(.*\) \/\/[^\n]*(\.push\(|\}\);\s*$)/.test(line)) bad.push(`${path.relative(root, p)}:${i + 1}`);
      });
    }
  };
  walk(root);
  assert.deepEqual(bad, []);
});
