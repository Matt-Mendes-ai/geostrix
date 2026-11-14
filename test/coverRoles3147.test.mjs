// TASKS.csv #3147 (split from #2926, WA iron review) — the cover (ALU alluvium, CLA clay) was 'stratigraphic' by default and joined the pile. A
// code is suggested as overburden when its name reads as cover AND it starts above every rock interval in most of the holes that log it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lithologyNoteRoles, setLithologyNoteRoles, roleForLithology, coverTopShare, COVER_TOP_SHARE } from "../src/lib/layers.js";

// holes of [code, from, to] runs
const log = (holes) => holes.flatMap((runs, i) => runs.map(([value, from, to]) => ({ hole_id: `H${i}`, from, to, value })));
const many = (n, runs) => Array.from({ length: n }, () => runs);

test("ALU and CLA on top of the rock in most holes: overburden, with the share", () => {
  const holes = [...many(8, [["ALU", 0, 4], ["CLA", 4, 10], ["BIF", 10, 60]]), ...many(2, [["BIF", 0, 30], ["CLA", 30, 32], ["BIF", 32, 60]])];
  const m = lithologyNoteRoles(log(holes));
  assert.equal(m.get("alu"), "overburden");
  assert.equal(m.get("cla"), "overburden");
  assert.equal(m.has("bif"), false);
  assert.deepEqual([...m.cover], [["alu", 1], ["cla", 0.8]]);
  assert.ok(COVER_TOP_SHARE > 0.5 && COVER_TOP_SHARE < 0.8);
  // the pane reads the share once the store registers the map
  setLithologyNoteRoles(m);
  try {
    assert.equal(roleForLithology("CLA"), "overburden");
    assert.equal(coverTopShare(" cla "), 0.8);
    assert.equal(coverTopShare("BIF"), null);
  } finally { setLithologyNoteRoles(null); }
  assert.equal(roleForLithology("CLA"), "stratigraphic");
});

test("not from the name alone, nor from the place alone", () => {
  // CLA mostly under the rock (a clay zone in the weathered profile): stays a unit
  const under = lithologyNoteRoles(log([...many(3, [["ALU", 0, 2], ["BAS", 2, 20], ["CLA", 20, 25], ["BAS", 25, 50]]), ...many(2, [["CLA", 0, 3], ["BAS", 3, 50]])]));
  assert.equal(under.has("cla"), false);
  assert.equal(under.get("alu"), "overburden");
  // a code on top of every hole whose name is not cover (a palaeochannel sand host, a basalt flow): stays a unit
  const top = lithologyNoteRoles(log(many(6, [["SAN", 0, 10], ["BAS", 10, 40]])));
  assert.equal(top.size, 0);
  // 'clay' inside a longer name is rock described by its alteration, not cover
  assert.equal(lithologyNoteRoles(log(many(6, [["Clay altered granite", 0, 10], ["GRN", 10, 40]]))).size, 0);
  // too few holes to say
  assert.equal(lithologyNoteRoles(log(many(2, [["ALU", 0, 4], ["BIF", 4, 40]]))).size, 0);
  // a code under 'not logged' or overburden only, nothing else in the hole: still on top
  const fill = lithologyNoteRoles(log(many(4, [["FILL", 0, 1], ["COLL", 1, 6], ["NRCV", 6, 8], ["BIF", 8, 40]])));
  assert.equal(fill.get("coll"), "overburden");
});

test("a note role wins; unsorted rows; the existing name rules unchanged", () => {
  const rows = log(many(5, [["DET", 0, 6], ["BIF", 6, 40]]));
  rows.forEach((r) => { if (r.value === "DET") r.desc = "lost core, tricone"; });
  assert.equal(lithologyNoteRoles(rows).get("det"), "no recovery");
  // the rows of a hole need not be in order, nor the holes together
  const shuffled = log(many(5, [["ALU", 0, 4], ["BIF", 4, 40]])).reverse();
  assert.equal(lithologyNoteRoles(shuffled).get("alu"), "overburden");
  assert.equal(roleForLithology("ALLUVIUM"), "overburden");
  assert.equal(roleForLithology("ALU"), "stratigraphic", "with no log registered, a short code is not guessed");
});

test("wiring: the pane says why; the key", () => {
  const p = readFileSync(new URL("../src/components/ModellingCodesPane.jsx", import.meta.url), "utf8");
  assert.match(p, /import \{ roleIsAssumed, coverTopShare \} from "\.\.\/lib\/layers\.js";/);
  assert.match(p, /: coverWhy\(c\) \|\| tr\(ROLE_HELP\[c\.role\]\)/);
  const k = "Suggested as overburden: its name reads as cover, and it lies at the top of {pct}% of the holes that log it. Check it before modelling.";
  assert.ok(p.includes(`tr("${k}"`));
  const k2 = "A code whose name reads as cover (ALU, CLA, soil ...) and that lies at the top of most of its holes is suggested as overburden.";
  assert.ok(p.includes(`tr("${k2}")`));
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")); assert.ok(d[k] && d[k2], l); }
});
