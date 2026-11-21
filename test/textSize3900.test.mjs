// TASKS.csv #3900 T1 — larger text: one bump (0 / 2 / 4 px) on the five tokens, Large the default; heights that hold text follow it; figures
// (theme.js fontSizes), the Layout sheet, exports and 3D captures do not. The setting is on this computer (local storage), never in a project.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const rd = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const T = await import("../src/lib/textSize.js");
const { fontSizes, uiFontPx } = await import("../src/lib/theme.js");
const css = rd("styles/app.css");

test("the five tokens are fontSizes plus one bump; Large (+2) is the default; the sizes of plan_fable 2.1", () => {
  assert.match(css, /--text-bump: 2px;/);
  for (const step of ["xs", "sm", "base", "lg", "xl"]) assert.match(css, new RegExp(`--font-size-${step}: calc\\(${fontSizes[step]}px \\+ var\\(--text-bump\\)\\);`), step);
  assert.deepEqual(T.TEXT_BUMP, { normal: 0, large: 2, larger: 4 });
  const at = (b) => Object.values(fontSizes).map((v) => v + b);
  assert.deepEqual(at(0), [10, 11, 12, 14, 17]); // Normal: today's sizes, and the figures' sizes for good
  assert.deepEqual(at(T.TEXT_BUMP.large), [12, 13, 14, 16, 19]);
  assert.deepEqual(at(T.TEXT_BUMP.larger), [14, 15, 16, 18, 21]);
  // the Layout sheet (on screen and printed) keeps Normal whatever the setting
  assert.match(css, /\.ge-layout-page, \.ge-print-root \{ --font-size-xs: 10px; --font-size-sm: 11px; --font-size-base: 12px; --font-size-lg: 14px; --font-size-xl: 17px; \}/);
});

test("the setting: Large when nothing is stored, kept on this computer, an unknown value ignored; on-screen sizes follow it, figures do not", () => {
  assert.equal(T.textSize(), "large");
  let told = 0; const off = T.subscribeTextSize(() => told++);
  T.setTextSize("larger"); assert.equal(store.get("geostrix.textSize"), "larger"); assert.equal(told, 1);
  assert.equal(uiFontPx("sm"), 15); assert.equal(T.screenLabelPx(), 22);
  T.setTextSize("toString"); T.setTextSize("huge"); assert.equal(T.textSize(), "larger"); // never a prototype key or a stray value
  T.setTextSize("normal"); assert.equal(uiFontPx("sm"), 11); assert.equal(T.screenLabelPx(), 16);
  T.setTextSize("large"); assert.equal(uiFontPx("base"), 14); assert.equal(T.screenLabelPx(), 19);
  off(); T.setTextSize("normal"); assert.equal(told, 3); T.setTextSize("large");
  assert.deepEqual(fontSizes, { xs: 10, sm: 11, base: 12, lg: 14, xl: 17 }); // frozen
  assert.doesNotMatch(rd("lib/store.jsx"), /textSize/); // never in a project file
});

test("heights that hold text (plan_fable 2.2): tab 2.5 em, top row tab + 14, ribbon button, project tab, tab bar and status bar + bump; hole rows 26 / 28 / 30", async () => {
  assert.match(css, /height: 2\.5em; padding: 0 12px;/);
  assert.match(css, /height: calc\(44px \+ 2\.5 \* var\(--text-bump\)\);/);
  assert.match(css, /min-width: calc\(50px \+ 6 \* var\(--text-bump\)\); max-width: calc\(78px \+ 6 \* var\(--text-bump\)\); height: calc\(54px \+ 3 \* var\(--text-bump\)\);/);
  for (const r of [/height: calc\(30px \+ var\(--text-bump\)\); flex-shrink: 0; overflow-x: auto;/, /height: calc\(22px \+ var\(--text-bump\)\); padding: 0 8px 0 9px;/, /height: calc\(26px \+ var\(--text-bump\)\); flex-shrink: 0;/]) assert.match(css, r);
  const parts = rd("modules/viewer/ViewerParts.jsx");
  assert.match(parts, /export const holeRowH = \(size\) => HOLE_ROW_H \+ \(TEXT_BUMP\[size\] \?\? 0\);/);
  assert.match(parts, /const \[ts\] = useTextSize\(\), rowH = holeRowH\(ts\);/);
  assert.match(parts, /windowRange\(view\.top, rowH, view\.h, holes\.length, HOLE_LIST_OVERSCAN\)/);
});

test("3D labels: on screen 16 / 19 / 22 px from the setting; a capture always 16", () => {
  const sprite = rd("lib/viewer/textSprite.js"), hl = rd("lib/viewer/holeLabels.js"), vm = rd("modules/ViewerModule.jsx");
  assert.match(sprite, /export const LABEL_PX = 16;/);
  assert.match(sprite, /export function fitScreenLabels\(group, camera, viewportH, px = screenLabelPx\(\)\)/);
  assert.match(sprite, /export function fitContourLabels\(boundaryGroup, camera, width, height, declutter = true, px = screenLabelPx\(\)\)/);
  for (const f of ["labelBoxes", "withEveryLabel", "declutterHoleLabels"]) assert.match(hl, new RegExp(`export function ${f}\\([^)]*labelPx = screenLabelPx\\(\\)`), f);
  assert.match(vm, /fitScreenLabels\(hl, renderCamera, outH, LABEL_PX\);/);
  assert.match(vm, /fitScreenLabels\(sectionLinesGroupRef\.current\?\.userData\.labels, renderCamera, outH, LABEL_PX\);/);
  assert.match(vm, /fitContourLabels\(boundaryGroupRef\.current, renderCamera, outW, outH, false, LABEL_PX\);/);
});

test("the top row fits in five steps, in this order; a new text size re-fits it and the ribbon; the Aa control beside the language", () => {
  const app = rd("App.jsx");
  assert.match(app, /const TOOLBAR_FIT_STEPS = \["ge-toolbar-snug", "ge-toolbar-compact", "ge-toolbar-smalltabs", "ge-toolbar-noicons", "ge-toolbar-initials"\];/);
  assert.match(app, /for \(const step of TOOLBAR_FIT_STEPS\) \{ if \(el\.scrollWidth <= el\.clientWidth \+ 1\) break; el\.classList\.add\(step\); \}/);
  for (const c of ["smalltabs .ge-tool-btn[data-tier] { font-size: var(--font-size-sm)", "noicons .ge-tool-btn[data-tier] > svg { display: none; }", "initials .ge-tier-cap-rest { display: none; }"]) assert.ok(css.includes(`.ge-toolbar-${c}`), c);
  assert.match(app, /\$\{el\.clientWidth\}\|\$\{el\.textContent\}\|\$\{textSizeNow\}/);
  assert.match(rd("components/Ribbon.jsx"), /const key = `\$\{mode\}\|\$\{textSizeNow\}\|/);
  assert.match(app, /^applyTextSize\(\);/m);
  assert.match(app, /<select className="ge-lang" value=\{textSizeNow\} onChange=\{\(e\) => setTextSizeNow\(e\.target\.value\)\} aria-label=\{tr\("Text size"\)\}>/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["Normal", "Large", "Larger", "Text size"]) assert.ok(d[k], `${lang}: ${k}`);
  }
});
