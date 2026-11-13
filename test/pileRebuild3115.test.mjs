// TASKS.csv #3115 (from #2921, review #2876 WA iron) — 'Rebuild the pile under it': the tops under a top, top-down by the holes' order, each
// opened in turn so the ones kept under the top above rebuild against its current surface (they rebuilt only when each was opened).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pileFromRuns, pileBelow } from "../src/lib/pileTops.js";

test("the tops down the pile, closest first, each top once; a gap in the explicit tops is stepped over", () => {
  const runs = [];
  for (let h = 0; h < 6; h++) ["A", "B", "C", "D", "E"].forEach((u, k) => runs.push({ hole_id: `H${h}`, code: u, from: k * 5 }));
  const pile = pileFromRuns(runs);
  const c = (u) => ({ unit: u, id: `t${u}`, name: `Top of ${u}` });
  const cands = ["B", "C", "D", "E"].map(c);
  assert.deepEqual(pileBelow(c("B"), cands, () => pile).map((t) => t.unit), ["B", "C", "D", "E"]);
  // no top of D built: C's next is E
  assert.deepEqual(pileBelow(c("B"), cands.filter((t) => t.unit !== "D"), () => pile).map((t) => t.unit), ["B", "C", "E"]);
  // a unit the holes do not place (no pile for it): the walk stops there
  assert.deepEqual(pileBelow(c("B"), cands, (u) => (u === "C" ? null : pile)).map((t) => t.unit), ["B", "C"]);
  assert.equal(pileBelow(c("B"), cands, () => pile, { max: 2 }).length, 2);
  assert.deepEqual(pileBelow(null, cands, () => pile), []);
});

test("wiring: the button on a top with kept tops under it, one top at a time through the pane's own build, then back", () => {
  const p = readFileSync(new URL("../src/components/ExplicitSurfacePanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /return pileBelowOf\(pileBase, cands, \(u\) => topsOfUnit\(u\)\?\.pile\);/);
  assert.match(p, /const keptBelow = pileBelow\.filter\(\(t\) => defs\.find\(\(d\) => d\.id === t\.id\)\?\.keepOrder\);/);
  // the step waits for the mesh built from the key the pane wants now (the pane's own build), or a refusal said after the step began
  assert.match(p, /const built = !!m && wantKey\.current != null && m\.userData\?\.builtKey === wantKey\.current;/);
  assert.match(p, /status\?\.ok === false && statusAt\.current > pileRun\.stepAt/);
  assert.match(p, /setSelId\(pileRun\.from\);/);
  assert.match(p, /\{\(keptBelow\.length > 0 \|\| pileRun\) && \(/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Rebuild the pile under it ({n} tops)", "Rebuilding {name} ({i} of {n})…", "Rebuilt the pile under \"{top}\", top-down: {list} ({s} s)."]) assert.ok(d[k], `${l}: ${k}`);
  }
});

test("the status line is the selected surface's own (opening a current top no longer shows the last build's text)", () => {
  const p = readFileSync(new URL("../src/components/ExplicitSurfacePanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /if \(status !== statusSeen\.current\) \{ statusSeen\.current = status; if \(status && def\?\.id\) statusOf\.current\.set\(def\.id, status\); \}/);
  assert.match(p, /const shownStatus = def \? statusOf\.current\.get\(def\.id\) \?\? null : null;/);
  assert.match(p, /\{shownStatus && <div role="status"[^\n]*\{shownStatus\.text\}<\/div>\}/);
  assert.doesNotMatch(p, /\{status && <div role="status"/, "the shared status is not rendered directly");
});
