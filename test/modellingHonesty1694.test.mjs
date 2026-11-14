// TASKS.csv #1694 (review #1645, Copley) and #2232 (review #2174, WA gold) — side 5's hand-backs in ViewerModule: the empty Generated
// surfaces list gives an instruction (not changelog and backlog notes), and an imported solid in a project with no CRS does not claim
// to be in the placeholder EPSG.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const s = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("#1694 the empty Generated surfaces list: one instruction; the 'saved with the project' sentence is its tooltip", () => {
  assert.ok(!s.includes("Binding a surface to a saved theme is still a follow-up"));
  assert.ok(!s.includes("Generated surfaces now save with the project"));
  assert.match(s, /title=\{tr\("Generated surfaces save with the project \(mesh, type, declared relationships and the parameters that produced them\), so a reported volume or tonnage can be reproduced after a restart\."\)\}>\{tr\("None yet: build one with Implicit surface, Explicit surface or Grade shell above, or link section outlines into a solid\."\)\}/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(!Object.keys(d).some((k) => k.includes("Binding a surface to a saved theme")), `${lang}: the old key is gone`);
  }
});

test("#2232 an imported solid's crsAssumed: the local grid when the project's CRS is not set", () => {
  assert.match(s, /crsAssumed: (viaTie \? `[^`]*` \/\* #3186 \*\/ : )?project\?\.crsSet === false \? "assumed on the project's local grid \(CRS not set\)" \/\* #2232 \*\/ : project\?\.epsg \? `assumed already in EPSG:\$\{project\.epsg\}` : "assumed already in the project CRS",/);
});
