// TASKS.csv #3278 (Galore review) — the Holes list's 'DH_HOLE_PURPOSE = Resource' pick listed the Resource Confidence and Resource Expansion
// holes too, and two values of one field could not be joined. Synthetic collars, not Galore.
import test from "node:test";
import assert from "node:assert/strict";
import { holesForFilter, collarsMatching } from "../src/lib/holeFilter.js";

const purposes = ["Resource", "Resource", "Resource", "Resource Confidence", "Resource Confidence", "Resource Expansion", "Infill", "Exploration"];
const areas = ["CZNGL", "CZRPL", "CZSGL", "WF", "CZNGL", "SW", "CZRPL", "JC"];
const collars = purposes.map((p, i) => ({ hole_id: `GX23-${String(i + 1).padStart(3, "0")}`, attrs: { DH_HOLE_PURPOSE: p, DH_AREA: areas[i], hole_type: i % 2 ? "Diamond (DD)" : "Reverse circulation (RC)" } }));
const ids = (r) => r.holes.map((c) => c.hole_id);

test("a value some hole holds exactly matches exactly; a word that is no whole value still matches as a word", () => {
  assert.equal(holesForFilter(collars, "DH_HOLE_PURPOSE=Resource").holes.length, 3);
  assert.equal(holesForFilter(collars, "DH_HOLE_PURPOSE=Resource_Confidence").holes.length, 2);
  assert.equal(holesForFilter(collars, "dh_hole_purpose=resource").holes.length, 3, "field and value in any case");
  assert.equal(holesForFilter(collars, "hole_type=RC").holes.length, 4, "'RC' is no whole value: the word match (#1504)");
  assert.equal(holesForFilter(collars, "DH_HOLE_PURPOSE=Confidence").holes.length, 2);
});

test("terms on one field join by OR, different fields by AND, ids as before", () => {
  assert.deepEqual(ids(holesForFilter(collars, "DH_AREA=CZNGL, DH_AREA=CZRPL, DH_AREA=CZSGL")), ["GX23-001", "GX23-002", "GX23-003", "GX23-005", "GX23-007"]);
  assert.deepEqual(ids(holesForFilter(collars, "DH_AREA=CZNGL DH_HOLE_PURPOSE=Resource")), ["GX23-001"]);
  assert.deepEqual(ids(holesForFilter(collars, "001, 004")), ["GX23-001", "GX23-004"]);
  assert.deepEqual(ids(holesForFilter(collars, "GX23-00 DH_AREA=WF")), ["GX23-004"]);
});

test("the shared collarsMatching (Layout drill plan, Atlas) keeps its rules", () => {
  assert.equal(collarsMatching(collars, "DH_HOLE_PURPOSE=Resource").length, 6);
  assert.equal(collarsMatching(collars, "DH_AREA=CZNGL, DH_AREA=CZRPL").length, 0);
});
