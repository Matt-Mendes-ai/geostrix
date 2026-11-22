// TASKS.csv #3997 — a rock that starts most holes at the collar is the cover: its top there is the ground, so the Implicit surface, the
// stack and a body built from its tops gave a slab off to one side (Century's limestone, 31 of 34 holes). Every route now says so and
// sends it to its base (Cover and weathering, or the Overburden role); with fewer than three tops the run stops. Synthetic logs only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { codedRuns, collarCover } from "../src/lib/modellingCodes.js";
import { coverAdvice } from "../src/lib/auto/autoUnits.js";

const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// eight holes: a limestone cover in seven, on shale, siltstone or breccia (an unconformity); the eighth starts in shale and has the
// limestone lower down, under siltstone (its only real top)
function logs() {
  const rows = [], under = ["SH", "SI", "BX"];
  for (let h = 0; h < 8; h++) {
    let d = 0;
    const add = (value, t) => { rows.push({ hole_id: `C${h}`, from: d, to: d + t, value }); d += t; };
    if (h < 7) { add("LS", 30 + h); add(under[h % 3], 40); add("SH", 50); } else { add("SH", 20); add("SI", 15); add("LS", 10); add("SH", 30); }
  }
  return rows;
}

test("the cover: it starts most holes, and most of the holes that cut it; what it rests on, most first", () => {
  const c = collarCover(codedRuns(logs(), null, null), "LS");
  assert.deepEqual({ starts: c.starts, holes: c.holes, cut: c.cut, cover: c.cover }, { starts: 7, holes: 8, cut: 8, cover: true });
  assert.deepEqual(c.onto, ["SH", "BX", "SI"]);
  // a layer under it is not the cover; nor is a code that starts fewer than three holes
  assert.equal(collarCover(codedRuns(logs(), null, null), "SH").cover, false);
  assert.equal(collarCover(codedRuns(logs().filter((r) => ["C0", "C1", "C7"].includes(r.hole_id)), null, null), "LS").cover, false);
  // a modelling code (an auto-numbered LS1) is read the same way
  const mc = { codes: [], assign: Object.fromEntries(logs().filter((r) => r.value === "LS" && r.from === 0).map((r) => [`${r.hole_id}|${(0).toFixed(3)}|${Number(r.to).toFixed(3)}`, "LS1"])) };
  assert.equal(collarCover(codedRuns(logs(), mc, null), "LS1").starts, 7);
});

test("the advice says why and the route; in a stack, the eroding surface over the rocks it rests on", () => {
  const c = collarCover(codedRuns(logs(), null, null), "LS");
  const a = coverAdvice("LS", c);
  assert.match(a, /^LS starts 7 of the 8 holes at the collar: it is the cover\. Its top there is the ground, not a contact/);
  assert.match(a, /Model > Cover and weathering, or set its role to Overburden in Modelling codes\.$/);
  assert.match(coverAdvice("LS", c, { stack: true }), /one eroding surface over the rocks it rests on \(SH, BX, SI\)/);
  assert.equal(coverAdvice("LS", { ...c, onto: ["SH"] }, { stack: true }), a, "on one rock it is a layer like the rest: no eroding surface");
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(Object.keys(d).some((k) => k.startsWith("{unit} starts {n} of the {h} holes at the collar")), `${lang}: the advice`);
    assert.ok(Object.keys(d).some((k) => k.startsWith(" As Overburden, its base is one eroding surface")), `${lang}: the stack's line`);
  }
});

test("the guided tools: a body is refused with the cover route; Rock layers notes it; a cover already marked is left alone", async () => {
  const { BODIES, ROCK_LAYERS } = await import("../src/modules/viewer/guided/guidedTools.js");
  const ctx = (role = {}) => ({ rows: logs(), isCover: (v) => role[v] === "overburden", roleOf: (v) => role[v] || "stratigraphic" });
  assert.match(BODIES.check(ctx(), "LS"), /^LS starts 7 of the 8 holes at the collar: it is the cover/);
  assert.match(BODIES.check(ctx(), "SH"), /^Mark SH as an intrusion/);
  assert.equal(BODIES.check(ctx({ LS: "intrusion" }), "LS"), null, "marked a body: the run decides");
  assert.match(ROCK_LAYERS.notes(ctx(), ["LS", "SH"])[0], /eroding surface over the rocks it rests on/);
  assert.deepEqual(ROCK_LAYERS.notes(ctx({ LS: "overburden" }), ["LS", "SH"]), []);
  assert.deepEqual(ROCK_LAYERS.notes(ctx(), ["SH", "SI"]), []);
});

test("the runs: the Implicit surface stops on the cover with fewer than three tops; the stack leaves such a youngest unit out", () => {
  const s = rd("src/modules/viewer/modellingRuns.js");
  assert.match(s, /if \(cc\.cover\) \{ const few = points\.length < 3; setNotices\(\(p\) => \[\.\.\.p, \(few \? errorNotice : infoNotice\)\(coverAdvice\(unitName, cc\)\)\]\); if \(few\) return null; \}/);
  assert.match(s, /if \(!silent && !isOverburdenUnit\) \{\n      const cc = collarCover\(/);
  assert.match(s, /if \(spec && i === coverAt && coverCC\?\.cover && spec\.points\.length < 3\) spec = null; \/\/ #3997/);
  assert.match(s, /if \(coverCC\?\.cover && coverCC\.onto\.length > 1\) setNotices\(\(p\) => \[\.\.\.p, infoNotice\(coverAdvice\(youngestName, coverCC, \{ stack: true \}\)\)\]\);/);
});
