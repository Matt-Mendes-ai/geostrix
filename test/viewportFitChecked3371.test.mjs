// TASKS.csv #3371 — a Layout viewport's 'Fit the holes' frames the holes its view shows (16 checked of 70), not every collar; 'Fit all'
// is the other choice, and a scale that leaves none of them in the frame says so with 'Centre on the holes'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { viewportHoleVisibility, fitHoleSet } from "../src/lib/viewportHoles.js";

// SYNTHETIC: a 4 x 4 central cluster and 54 holes spread over 29 km
const collars = [];
for (let i = 0; i < 16; i++) collars.push({ hole_id: `C${i}`, x: 350000 + (i % 4) * 100, y: 6330000 + Math.floor(i / 4) * 100 });
for (let i = 0; i < 54; i++) collars.push({ hole_id: `F${i}`, x: 340000 + (i % 9) * 3600, y: 6325000 + Math.floor(i / 9) * 2500 });
const hidden = Object.fromEntries(collars.filter((c) => c.hole_id.startsWith("F")).map((c) => [c.hole_id, false]));

test("the view's hole visibility: its theme, else its captured view state, else the live view", () => {
  const themes = [{ id: "t1", visibleHoles: { A: false } }];
  assert.deepEqual(viewportHoleVisibility({ themeId: "t1" }, themes, { visibleHoles: { B: false } }), { A: false });
  assert.deepEqual(viewportHoleVisibility({ viewState: { visibleHoles: hidden } }, themes, null), hidden);
  assert.deepEqual(viewportHoleVisibility({}, themes, { visibleHoles: { B: false } }), { B: false });
  assert.equal(viewportHoleVisibility({ themeId: "gone" }, themes, { visibleHoles: { B: false } }), null);
});

test("16 of 70 shown: the fit takes those 16; none hidden or all hidden: every hole", () => {
  const s = fitHoleSet(collars, hidden);
  assert.equal(s.shown, 16); assert.equal(s.all, 70);
  assert.deepEqual([...s.ids].sort(), collars.slice(0, 16).map((c) => c.hole_id).sort());
  assert.deepEqual(fitHoleSet(collars, null), { ids: null, shown: 70, all: 70 });
  assert.deepEqual(fitHoleSet(collars, {}), { ids: null, shown: 70, all: 70 });
  assert.equal(fitHoleSet(collars, Object.fromEntries(collars.map((c) => [c.hole_id, false]))).ids, null);
  assert.equal(fitHoleSet([...collars, { hole_id: "nowhere" }], hidden).all, 70, "a collar with no x / y is not counted");
});

test("wired in fitViewport and the viewport panel", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /const holeSet = fitHoleSet\(collars, viewportHoleVisibility\(sel, themes, viewerUiState\)\), only = allHoles \? null : holeSet\.ids;/);
  assert.match(m, /holeTraces\(fitCollars, survey, project\?\.desurveyMethod\)/);
  assert.match(m, /for \(const c of fitCollars \|\| \[\]\) if \(Number\.isFinite\(c\.x\)/);
  assert.match(m, /\.\.\.\(only \? \{ of: holeSet\.all \} : \{\}\)/);
  assert.match(m, /if \(keepScale && sel\.fixedScale > 0\) \{ startViewportRender\(sel\.themeId, sel\.id, true, \{ fixedScale: sel\.fixedScale, elementW: sel\.w, elementH: sel\.h, centreWorld \}\); return; \}/);
  assert.match(m, /onFitAll=\{\(\) => fitViewport\(sel, \{ allHoles: true \}\)\} onCentre=\{\(\) => fitViewport\(sel, \{ keepScale: true \}\)\}/);
  assert.match(m, /\{ pass: 2, allHoles: !!el\.fitInfo\?\.allHoles/);
  assert.match(m, /tr\("Fitted the \{n\} hole\(s\) this view shows, of \{all\}, at 1:\{scale\}\."/);
  assert.match(m, /tr\("None of the holes this view shows is inside the frame at this scale\."\)/);
});
