// TASKS.csv #2058 (review #2013, Woodjam) — an implicit 'Top of VANSS' folded back over itself at 1 of 16 sampled locations and only Check
// relationships said so: the implicit / stack run now runs the same one-elevation-per-location check on each contact surface it adds
// and says it in its own notice. (The row's other half, the unnamed show / hide eye, is ViewerModule's: handed to side session 6.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inversionCheck, checkTopology, FOLD_CONTACT_TYPES } from "../src/lib/topology.js";

// scene space, y up: a sheet over x 0..100, z 0..100 at y = 0, or (folded) a Z-fold whose middle limb runs back under the top one over
// x 40..60, so a vertical line there meets it three times
function sheet(folded) {
  const xs = folded ? [0, 60, 40, 100] : [0, 100], ys = folded ? [0, 0, -10, -10] : [0, 0];
  const pos = [], idx = [];
  xs.forEach((x, i) => { pos.push(x, ys[i], 0, x, ys[i], 100); });
  for (let i = 0; i + 1 < xs.length; i++) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}

test("a Z-fold is caught, a flat sheet is not", () => {
  const f = inversionCheck(sheet(true), { up: "y" });
  assert.ok(f.sampled > 0 && f.folded > 0 && f.fraction > 0.05, JSON.stringify(f));
  assert.equal(inversionCheck(sheet(false), { up: "y" }).folded, 0);
});

test("Check relationships and the run share one list of contact types", () => {
  assert.deepEqual([...FOLD_CONTACT_TYPES].sort(), ["intrusive_contact", "stratigraphic_contact", "unconformity"]);
  const r = checkTopology([{ id: "a", name: "Top of VANSS", type: "stratigraphic_contact", ...sheet(true) }], { up: "y" });
  assert.ok(r.violations.some((v) => v.kind === "inverted"));
  assert.equal(checkTopology([{ id: "a", name: "halo", type: "alteration_halo", ...sheet(true) }], { up: "y" }).violations.length, 0, "not a contact type");
});

test("the implicit run checks each contact surface it adds and says it in its own notice", () => {
  const s = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(s, /if \(FOLD_CONTACT_TYPES\.has\(spec\.type\)\) \{/);
  assert.match(s, /inversionCheck\(meshQuery\(\), \{ up: "y" \}\)/); // #3119: the mesh query shared with the order check
  assert.match(s, /return \(meshQ = \{ positions: pos, indices: idx, query: buildMeshQuery\(pos, idx\) \}\);/);
  assert.match(s, /inv\.sampled && inv\.fraction > 0\.05/, "the same threshold as Check relationships");
  assert.match(s, /notice\("\{list\} Check relationships lists it again with the other checks\."/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(d["{list} Check relationships lists it again with the other checks."], l);
  }
});
