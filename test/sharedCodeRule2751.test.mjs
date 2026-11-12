// TASKS.csv #2751 / #2766 / #2787 — Classify and Isocon use #2510's shared rule for a sample's logged code (the code it overlaps most),
// and Isocon folds case / space variants of a code into one
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loggedCodeAt, protolithForSample } from "../src/lib/geochemDiagrams.js";
import { codeIndex, codeAt } from "../src/lib/sampleLithology.js";
import { foldDomainRows } from "../src/lib/domainLayers.js";

const lith = new Map([["H1", [{ from: 0, to: 4.6, value: "RHY" }, { from: 4.6, to: 10, value: "BAS" }]]]);

test("Classify takes the code the sample overlaps most (the middle 4.55 m is in RHY, but BAS covers more of 4.1-5.6 m)", () => {
  assert.equal(loggedCodeAt({ hole_id: "H1", from: 4.1, to: 5.6 }, lith), "BAS");
  assert.equal(loggedCodeAt({ hole_id: "H1", from: 4.0, to: 5.0 }, lith), "RHY");
  assert.equal(loggedCodeAt({ hole_id: "H2", from: 0, to: 1 }, lith), null);
  assert.equal(protolithForSample({ hole_id: "H1", from: 4.1, to: 5.6 }, { lithoByHole: lith, map: { BAS: "basalt" } }), "basalt");
});

test("the same answer as codeAt over the same rows", () => {
  const ix = codeIndex([...lith].flatMap(([h, rows]) => rows.map((r) => ({ ...r, hole_id: h }))));
  for (let f = 0; f < 9; f += 0.37) assert.equal(loggedCodeAt({ hole_id: "H1", from: f, to: f + 1.1 }, lith), codeAt(ix, "H1", f, f + 1.1));
});

test("Isocon: variants folded, the shared rule in its filter", () => {
  const rows = [{ hole_id: "A", from: 0, to: 2, value: "Dcb" }, { hole_id: "A", from: 2, to: 3, value: "DCB" }, { hole_id: "A", from: 3, to: 9, value: "Dcb" }];
  assert.deepEqual([...new Set(foldDomainRows(rows).rows.map((r) => r.value))], ["Dcb"]);
  const m = readFileSync(new URL("../src/components/IsoconTool.jsx", import.meta.url), "utf8");
  assert.match(m, /return r \? foldDomainRows\(r\)\.rows : null;/);
  assert.match(m, /const codeFn = \(rows\) => \{ const ix = codeIndex\(rows\); return \(a\) => codeAt\(ix, a\.hole_id, a\.from, a\.to\); \};/);
  assert.doesNotMatch(m, /domainOfInterval\(/);
});
