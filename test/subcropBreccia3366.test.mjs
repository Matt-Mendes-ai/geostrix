// TASKS.csv #3366 (#3195, Galore Creek review) — Subcrop from collars left the breccia off the map: code B, whose notes describe its cement,
// was read as no recovery (#3254), so holes that reach bedrock in breccia were mapped as the unit under it, or left out as 'only cover', and
// the pane never named the code it skipped. SYNTHETIC log with the review's shape (no Galore Creek data).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { collarSubcrop, subcropSkippedCodes, subcropLeftOut, coverRoleSource } from "../src/lib/collarSubcrop.js";
import { lithologyNoteRoles, setLithologyNoteRoles, roleIsFromNotes } from "../src/lib/layers.js";

// five vertical holes: OVB, then breccia B (notes about its cement) over i10 / V3; one hole in breccia to the end; NPRC ('core not present')
// at the top of the last, a code whose no-recovery role does come from its notes
const collars = ["H1", "H2", "H3", "H4", "H5"].map((h, i) => ({ hole_id: h, x: 1000 + 100 * i, y: 5000, z: 900, azimuth: 0, dip: -90, depth: 320 }));
const litho = [
  { hole_id: "H1", from: 0, to: 34.75, value: "OVB" }, { hole_id: "H1", from: 34.75, to: 148.6, value: "B", desc: "polymict breccia, silica cement, cpy in the matrix" }, { hole_id: "H1", from: 148.6, to: 300, value: "i10" },
  { hole_id: "H2", from: 0, to: 66.5, value: "OVB" }, { hole_id: "H2", from: 66.5, to: 140.88, value: "B", desc: "hydrothermal breccia cemented by tourmaline" }, { hole_id: "H2", from: 140.88, to: 300, value: "V3" },
  { hole_id: "H3", from: 0, to: 14.93, value: "OVB" }, { hole_id: "H3", from: 14.93, to: 311, value: "B", desc: "breccia, magnetite-anhydrite cement" },
  { hole_id: "H4", from: 0, to: 22.3, value: "OVB" }, { hole_id: "H4", from: 22.3, to: 54.4, value: "B", desc: "clast-supported breccia, k-spar cement" }, { hole_id: "H4", from: 54.4, to: 200, value: "V3", desc: "augite porphyry flow" },
  { hole_id: "H5", from: 0, to: 3, value: "NPRC", desc: "core not present" }, { hole_id: "H5", from: 3, to: 9, value: "OVB" }, { hole_id: "H5", from: 9, to: 120, value: "V3" },
];

test("breccia whose notes describe its cement is mapped, and the depth of cover stops at the overburden", () => {
  setLithologyNoteRoles(lithologyNoteRoles(litho));
  try {
    const pts = collarSubcrop({ collars, survey: [], litho });
    const by = Object.fromEntries(pts.map((p) => [p.hole_id, p]));
    assert.equal(pts.length, 5, "H3 (breccia to the end of the hole) is not 'only cover'");
    for (const h of ["H1", "H2", "H3", "H4"]) assert.equal(by[h].unit, "B", h);
    assert.equal(by.H1.cover, 34.75, "cover ends at the base of the overburden, not of the breccia (148.6)");
    assert.equal(by.H5.unit, "V3");
    assert.deepEqual(subcropLeftOut({ collars, litho }), { noLog: 0, blankOnly: 0, coverOnly: 0 });
  } finally { setLithologyNoteRoles(null); }
});

test("the pane gets every code skipped as cover, with its hole count, the longest run and where its role came from", () => {
  setLithologyNoteRoles(lithologyNoteRoles(litho));
  try {
    const sk = subcropSkippedCodes({ collars, litho });
    assert.deepEqual(sk.map((c) => [c.code, c.role, c.holes, c.maxM, c.whole]), [["OVB", "overburden", 5, 66.5, 0], ["NPRC", "no recovery", 1, 3, 0]]);
    assert.ok(roleIsFromNotes("NPRC") && !roleIsFromNotes("OVB") && !roleIsFromNotes("B"));
    assert.equal(coverRoleSource("NPRC", null), "notes");
    assert.equal(coverRoleSource("OVB", null), "name");
    assert.equal(coverRoleSource("nprc", { codes: [{ name: "NPRC", role: "overburden" }] }), "codes");
    // a code read as cover is listed wherever it sits above the mapped unit, and a hole it fills to the end is counted as whole
    const roleOf = (v) => (v === "B" ? "no recovery" : v === "OVB" ? "overburden" : "stratigraphic");
    const old = subcropSkippedCodes({ collars, litho, roleOf });
    assert.deepEqual(old.find((c) => c.code === "B"), { code: "B", role: "no recovery", holes: 4, maxM: 296.1, whole: 1 });
    assert.equal(collarSubcrop({ collars, survey: [], litho, roleOf }).find((p) => p.hole_id === "H1").unit, "i10", "the review's wrong map, with B as cover");
  } finally { setLithologyNoteRoles(null); }
});

test("the Subcrop pane lists the skipped codes with a tick and says them in the result", () => {
  const src = fs.readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /subcropSkippedCodes\(\{ collars, litho: layers\.litho, roleOf: roleWithCodes\(modellingCodes\) \}\)/);
  assert.match(src, /coverRoleSource\(/);
  assert.match(src, /skippedText\(/);
  assert.match(src, /onChange=\{\(e\) => setCoverRole\(c\.code, e\.target\.checked\)\}/);
});
