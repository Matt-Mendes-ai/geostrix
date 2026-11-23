// TASKS.csv #4034 (#4015 guided modelling, row 4) — the modelling runs' failure notices carry a code and a detail, their text unchanged, and
// nextFor(code, detail) gives the guide's Next buttons (labels that already exist wherever one does). Made-up unit codes only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GUIDE_FAILURES, nextFor } from "../src/lib/guide/guideFailures.js";
import { withCode, errorNotice, infoNotice, noticeText, noticeLevel } from "../src/lib/notices.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#4034 withCode keeps the notice as it was and adds the cause", () => {
  const n = errorNotice("GemPy could not solve this model (singular matrix): x", "more");
  const c = withCode(n, "singular", { unit: "VOL" });
  assert.deepEqual(c, { text: n.text, level: "error", more: "more", code: "singular", detail: { unit: "VOL" } });
  assert.deepEqual(withCode(infoNotice("a"), "cover"), { text: "a", level: "info", code: "cover" }, "no detail: no key");
  const s = withCode("Export failed", "limit");
  assert.equal(noticeText(s), "Export failed"); assert.equal(noticeLevel(s), "error", "a string keeps its judged level");
});

test("#4034 each code maps to its Next, best first", () => {
  const ids = (code, d) => nextFor(code, d).map((x) => x.act.id);
  assert.deepEqual(GUIDE_FAILURES, ["singular", "nothing-left", "order", "limit", "too-few-contacts", "cover"]);
  // singular: the unit the cause names; else sort by the holes; then draw it
  assert.deepEqual(nextFor("singular", { kind: "close", unit: "TUF", other: "VOL" }).map((x) => [x.label, x.act.id, x.act.unit]), [["Leave out of the model", "leave-out", "TUF"], ["Draw it instead", "draw-instead", "TUF"]]);
  assert.deepEqual(ids("singular", { kind: null, unit: null }), ["sort-by-holes", "draw-instead"]);
  // nothing left: leave out the first unit named; Data QC when a column is invalid or collars are suspect
  assert.deepEqual(ids("nothing-left", { reasons: [{ kind: "invalid", label: "Top of VOL", n: 4, columns: "z (4)", unit: "VOL" }] }), ["leave-out", "data-qc"]);
  assert.deepEqual(nextFor("nothing-left", { reasons: [{ kind: "tooFew", label: "Top of VOL", before: 3, after: 1, unit: "VOL" }] }).map((x) => x.act), [{ id: "leave-out", unit: "VOL" }], "the unit, not the surface's label");
  assert.deepEqual(ids("nothing-left", { reasons: [{ kind: "suspect", label: "Top of ?", unit: null }] }), ["data-qc"], "no unit known: no Leave out");
  assert.deepEqual(ids("nothing-left", { reasons: [] }), []);
  assert.deepEqual(nextFor("order", { order: ["VOL", "TUF"] }), [{ label: "Use the holes' order", act: { id: "use-holes-order", order: ["VOL", "TUF"] } }]);
  // limit: Add all's cut, or the map's pick; faults: pick the six
  assert.deepEqual(nextFor("limit", { overSurfaces: true, surfaces: 20, maxSurfaces: 16 }).map((x) => [x.label, x.vars, x.act.id]), [["Cut down to the {max} with the most logged metres", { max: 16 }, "cut-down"]]);
  assert.deepEqual(ids("limit", { overSurfaces: true, maxSurfaces: 16, fromMap: true, overFaults: true, maxFaults: 6 }), ["pick-map-units", "pick-faults"]);
  assert.deepEqual(nextFor("too-few-contacts", { units: ["SST", "VOL"] }).map((x) => x.act), [{ id: "draw-instead", unit: "SST" }]);
  assert.deepEqual(nextFor("cover", { unit: "OVB" }), [{ label: "Cover and weathering", act: { id: "cover", unit: "OVB" } }]);
  assert.deepEqual(nextFor("cover", {}), []); assert.deepEqual(nextFor("unknown", {}), []); assert.deepEqual(nextFor("singular", null).length, 2);
});

test("#4034 the labels are existing buttons (or the one new key) in every language", () => {
  const labels = new Set();
  const details = { singular: [{ unit: "A" }, {}], "nothing-left": [{ reasons: [{ kind: "invalid", label: "Top of A", unit: "A" }] }], order: [{}], limit: [{ overSurfaces: true }, { overSurfaces: true, fromMap: true, overFaults: true }], "too-few-contacts": [{ units: ["A"] }], cover: [{ unit: "A" }] };
  for (const code of GUIDE_FAILURES) for (const d of details[code]) for (const x of nextFor(code, d)) labels.add(x.label);
  for (const l of ["es", "pt", "fr", "ar"]) { const j = JSON.parse(read(`../src/locales/${l}.json`)); for (const k of labels) assert.ok(j[k], `${l}: ${k}`); }
});

test("#4034 the run's notices carry their code with the text exactly as before", () => {
  const r = read("../src/modules/viewer/modellingRuns.js");
  const pins = [
    [/withCode\(errorNotice\(tr\("Not run: \{why\}", \{ why: parts\.join\(" "\) \}\)\), "limit", \{ overSurfaces: !!overLimit\.overSurfaces,/, "limit"],
    [/withCode\(errorNotice\(nothingLeftText\(why\)\), "nothing-left", \{ reasons: why\.map\(\(r\) => \(\{ \.\.\.r, unit: unitOfLabel\(r\.label\) \}\)\) \}\)/, "nothing left"],
    [/held\.push\(withCode\(notice\("Too few contacts to shape a surface: \{list\}\. Fewer than three, or all in a line, so its shape comes from the structure picks alone\.", \{ list: thinSpecs\.map[^\n]*"too-few-contacts", \{ units: thinSpecs\.map\(\(s\) => s\.meshName\) \}\)\)/, "too few"],
    [/withCode\(errorNotice\(tr\("GemPy could not solve this model \(singular matrix\): \{cause\}", \{ cause: singularCause\(inputCheck\.risks\) \}\), `\$\{stackNames\}: \$\{plainEngineError\(res\.error\)\}`\), "singular", \{ kind: inputCheck\.risks\?\.\[0\]\?\.kind \|\| null, unit: unitOfLabel\(inputCheck\.risks\?\.\[0\]\?\.label\), other: unitOfLabel\(inputCheck\.risks\?\.\[0\]\?\.other\) \}/, "singular"],
    [/const unitOfLabel = \(l\) => rawSpecs\.find\(\(s\) => s\.label === l\)\?\.meshName \?\? null;/, "the unit behind a surface label"],
    [/withCode\(\(few \? errorNotice : infoNotice\)\(coverAdvice\(unitName, cc\)\), "cover", \{ unit: unitName \}\)/, "cover, one surface"],
    [/withCode\(infoNotice\(coverAdvice\(youngestName, coverCC, \{ stack: true \}\)\), "cover", \{ unit: youngestName \}\)/, "cover, the stack"],
    [/withCode\(notice\("Stack run cancelled before solving: the holes give the order \{order\} \(youngest first\)\. 'Use the order from the holes' over the stack's units puts them in it; then run again\.", \{ order: holesOrder \}\), "order", \{ order: plan\.order \}\)/, "order"],
  ];
  for (const [re, name] of pins) assert.match(r, re, name);
  assert.equal((r.match(/withCode\(/g) || []).length, 7, "the seven notices (cover twice): no other notice was touched");
});
