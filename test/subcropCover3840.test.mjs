// TASKS.csv #3840 (Subcrop from collars mapped the overburden itself: OVBN, 'overburden' in the file, was not read as cover) and #3841 (a gap in the log read as cover:
// SR23-269 / 270, cover to 4.4 / 7.0 m, nothing logged to 135.9 / 132.2 m, gave a dyke 95 m from the pad with 97 m of cover). Synthetic only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setLithologyMeanings, roleForLithology } from "../src/lib/layers.js";
import { collarSubcrop, dominantStartUnit, codeReadsAsRock } from "../src/lib/collarSubcrop.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const hasKeys = (keys) => { for (const k of keys) for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 50)}`); };

test("#3840 a description that starts with overburden / casing / till is read as cover", () => {
  setLithologyMeanings(null);
  assert.equal(roleForLithology("OVBN"), "stratigraphic"); // the name alone says nothing (#3735); its meaning in the code dictionary does:
  setLithologyMeanings({ ovbn: { desc: "overburden" } }); assert.equal(roleForLithology("OVBN"), "overburden");
  for (const d of ["overburden", "Overburden (till)", "Overburden and casing", "glacial till", "Casing", "no core recovery"]) {
    setLithologyMeanings({ zzz: { desc: d } });
    assert.equal(roleForLithology("ZZZ"), /recovery/.test(d) ? "no recovery" : "overburden", d);
  }
  for (const d of ["Tricone through overburden", "sandstone under overburden", "andesite"]) { setLithologyMeanings({ zzz: { desc: d } }); assert.equal(roleForLithology("ZZZ"), "stratigraphic", d); }
  setLithologyMeanings(null);
});

test("#3840 the first map is bedrock with the description known; with it unknown the notice's first sentence says most holes start in the mapped unit", () => {
  const collars = Array.from({ length: 6 }, (_, i) => ({ hole_id: "H" + i, x: i * 50, y: 0, z: 100, azimuth: 0, dip: -90 }));
  const litho = collars.flatMap((c, i) => [{ hole_id: c.hole_id, from: 0, to: 5, value: "XOB" }, { hole_id: c.hole_id, from: 5, to: 40, value: i < 4 ? "AND" : "DIO" }]);
  setLithologyMeanings(null);
  const unknown = collarSubcrop({ collars, survey: [], litho });
  assert.equal(unknown.length, 6); assert.ok(unknown.every((p) => p.unit === "XOB")); // the old first map: all XOB
  const dom = dominantStartUnit({ collars, litho, points: unknown });
  assert.deepEqual(dom, { code: "XOB", holes: 6, total: 6 });
  setLithologyMeanings({ xob: { desc: "Overburden (till)" } });
  const known = collarSubcrop({ collars, survey: [], litho });
  assert.deepEqual([...new Set(known.map((p) => p.unit))].sort(), ["AND", "DIO"]);
  assert.ok(known.every((p) => p.coverAlong === 5));
  assert.equal(dominantStartUnit({ collars, litho, points: known }), null); // cover starts the holes: nothing to say
  setLithologyMeanings(null);
  const p = read("../src/components/SurfaceMappingPanel.jsx");
  assert.match(p, /const dom = depth == null \? dominantStartUnit\(\{ collars, litho: layers\.litho, points: pts, roleOf: roleWithCodes\(modellingCodes\) \}\) : null;/);
  assert.match(p, /setMapMsg\(\{ ok: true, text: \[domText, /); // first in the notice
  hasKeys(["{n} of {total} hole(s) start in {code}, and it is mapped here as a unit, not as cover. If {code} is overburden or casing, tick it in the list below and press Make it again."]);
});

test("#3841 cover to 4.4 m and the next logged rock at 135.9 m: the hole is left out and named; a continuous log still maps", () => {
  const collars = [{ hole_id: "SR23-269", x: 0, y: 0, z: 100, azimuth: 0, dip: -90 }, { hole_id: "SR23-270", x: 50, y: 0, z: 100, azimuth: 0, dip: -90 }, { hole_id: "OK", x: 100, y: 0, z: 100, azimuth: 0, dip: -90 }];
  const litho = [
    { hole_id: "SR23-269", from: 0, to: 4.4, value: "OVB" }, { hole_id: "SR23-269", from: 135.9, to: 150, value: "DYK" },
    { hole_id: "SR23-270", from: 0, to: 7, value: "OVB" }, { hole_id: "SR23-270", from: 132.2, to: 140, value: "DYK" },
    { hole_id: "OK", from: 0, to: 6, value: "OVB" }, { hole_id: "OK", from: 6.5, to: 60, value: "AND" }, // 0.5 m between: within LATE_START_M
  ];
  const report = { lateStart: [], gap: [] };
  const pts = collarSubcrop({ collars, survey: [], litho, report });
  assert.deepEqual(pts.map((p) => p.hole_id), ["OK"]);
  assert.deepEqual(report.gap.map((g) => g.hole_id), ["SR23-269", "SR23-270"]);
  assert.equal(report.gap[0].coverEnd, 4.4); assert.equal(report.gap[0].rockStart, 135.9);
  assert.deepEqual(report.lateStart, []);
  // no report object: still left out
  assert.equal(collarSubcrop({ collars, survey: [], litho }).length, 1);
  // at a typed depth the rule is not applied: that depth is what was asked for
  assert.equal(collarSubcrop({ collars, survey: [], litho, atDepthM: 140 }).length, 1);
  const p = read("../src/components/SurfaceMappingPanel.jsx");
  assert.match(p, /const rep = \{ lateStart: \[\], gap: \[\] \};/);
  assert.match(p, /rep\.lateStart\.length - rep\.gap\.length - \(rep\.notAtDepth \|\| 0\)/);
  assert.equal((p.match(/late, gapText, skippedText\(skippedCodes\)/g) || []).length, 2);
  hasKeys(["{n} hole(s) with an unlogged stretch above the first rock ({a}–{b} m) were left out: missing log is not cover ({ids})."]);
});

test("#3840 follow-up: a start code whose own words read as rock gets no nudge (Century's LMST); words that name cover, or none, keep it", () => {
  setLithologyMeanings(null);
  const collars = Array.from({ length: 6 }, (_, i) => ({ hole_id: "H" + i, x: i * 50, y: 0, z: 100, azimuth: 0, dip: -90 }));
  const rows = (desc) => collars.flatMap((c) => [{ hole_id: c.hole_id, from: 0, to: 40, value: "LMST", description: desc }, { hole_id: c.hole_id, from: 40, to: 80, value: "SLST", description: "siltstone" }]);
  const lime = rows("Cambrian limestone, dolomite and marl");
  assert.equal(codeReadsAsRock("LMST", lime), true);
  assert.equal(dominantStartUnit({ collars, litho: lime, points: collarSubcrop({ collars, survey: [], litho: lime }) }), null);
  const bare = rows("");
  assert.equal(codeReadsAsRock("LMST", bare), false); // no words: said
  assert.equal(dominantStartUnit({ collars, litho: bare, points: collarSubcrop({ collars, survey: [], litho: bare }) })?.code, "LMST");
  const till = rows("weathered till over limestone"); // cover named: said, even beside a rock word
  assert.equal(codeReadsAsRock("LMST", till), false);
  // the code dictionary's meaning wins over the rows' text
  setLithologyMeanings({ lmst: { desc: "andesite" } });
  assert.equal(codeReadsAsRock("LMST", bare), true);
  setLithologyMeanings(null);
});
