// TASKS.csv #2512 — the X-Y scatter opens on the project's lead commodity (Li on a lithium project), not the file's first column (As)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { correlationDefaults } from "../src/lib/preferredElement.js";

test("the lead first, then the next default element", () => {
  const syms = ["As", "Mg", "Mn", "Na", "Nb", "Li", "Cs", "Rb", "Ta", "Sn"];
  assert.equal(correlationDefaults(syms, 2, { lead: "Li" })[0], "Li");
  assert.equal(correlationDefaults(syms, 2, { lead: "Li" }).length, 2);
});

test("wired", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const two = correlationDefaults\(assayElements\.map\(\(e\) => e\.symbol\), 2, \{ lead: xyLead \}\);/); // Y by correlation since #2741
  assert.match(g, /const xyKeyX = xyX \|\| \(xyPair\[0\] \? `el:\$\{xyPair\[0\]\}` : ""\)/);
});
