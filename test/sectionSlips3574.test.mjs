// TASKS.csv #3574 (Fireweed rehearsal, Macpass) — small slips in sections: (1) Draw section armed in an oblique view turns the view to Top; (2) the
// section window opens larger and at the size the last one was left; (3) a scale bar on screen; (4) By coordinates on the view's centre. (5), a
// Layout picture dropped on the strip log, is #3608's (a picture with no free room goes to a new page).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sectionTopView, viewCentreEN } from "../src/modules/viewer/sectionView.js";

test("(1) an oblique or bottom view turns to Top, north up, with a notice; a plan view is left alone", () => {
  let updated = 0, notes = [];
  const cam = { __update: () => updated++ }, setNotices = (f) => { notes = f(notes); };
  const plan = { theta: 1.2, phi: 0.05 };
  assert.equal(sectionTopView(plan, cam, setNotices), false);
  assert.deepEqual(plan, { theta: 1.2, phi: 0.05 });
  const oblique = { theta: 0.8, phi: 0.9 };
  assert.equal(sectionTopView(oblique, cam, setNotices), true);
  assert.deepEqual([oblique.theta, oblique.phi, updated, notes.length], [0, 0.02, 1, 1]);
  assert.match(notes[0].text, /turned to Top/);
  assert.equal(sectionTopView({ theta: 0, phi: Math.PI - 0.02 }, cam, setNotices), true, "from below");
});

test("(4) the view's centre in eastings / northings (scene x east, z south of the origin)", () => {
  assert.deepEqual(viewCentreEN({ target: { x: 120, y: 5, z: -40 } }, { x: 441000, y: 7003000, z: 0 }), { e: 441120, n: 7003040 });
  assert.equal(viewCentreEN({}, { x: 0, y: 0 }), null);
  assert.equal(viewCentreEN({ target: { x: NaN, z: 0 } }, { x: 0, y: 0 }), null);
});

test("the wiring", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /if \(!sectionMode\) sectionTopView\(camState\.current, cameraRef\.current, setNotices\); \/\* #3574 \*\/ setSectionMode\(\(s\) => !s\);/);
  assert.match(v, /vc = viewCentreEN\(camState\.current, originRef\.current\)/);
  assert.match(v, /e = vc\?\.e \?\? lineCentre\?\.x \?\?/);
  assert.equal((v.match(/placeholder=\{tr\("view centre"\) \/\* #3574 \*\/\}/g) || []).length, 2);
  const m = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  assert.match(m, /\.\.\.sectionWindowSize\(\), \/\/ #3574/);
  assert.match(m, /Math\.min\(1700, Math\.round\(wa\.width \* 0\.9\)\)/);
  assert.match(m, /lastSectionSize = \{ width, height \}/);
  const s = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(s, /if \(printing \|\| !\(hScale > 0\)\) return null;/);
  assert.match(s, /m = \[5, 2, 1\]\.map\(\(k\) => k \* p10\)\.find\(\(v\) => v <= want\) \|\| p10/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(j["Draw section: the view turned to Top. Click the section's two ends on the plan."], l);
  }
});
