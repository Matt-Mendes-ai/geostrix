// TASKS.csv #4069 — the button roles ("GeoStrix gold", Matt's choice C): the tokens in app.css and theme.js are one set of values, every text pair of every role passes
// WCAG AA, the .gs-btn classes and their states exist, the focus ring stays the blue one, the number of <button>s without a role class may only go down (per file), and no
// component renders two primaries. Pure: reads the source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buttons } from "../src/lib/theme.js";
import { scan, primaryCounts, buttonTags, hasRole, BASELINE_FILE } from "../scripts/button-roles.mjs";

const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const cssTokens = Object.fromEntries([...css.matchAll(/^\s*--btn-([a-z-]+):\s*([^;]+);/gm)].map((m) => [camel(m[1]), m[2].trim()]));

const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test("the --btn-* tokens in app.css and `buttons` in theme.js are the same values, name for name", () => {
  assert.deepEqual(cssTokens, buttons);
  assert.equal(cssTokens.primaryBg, "#e2a63c"); assert.equal(cssTokens.primaryText, "#3a2a06"); assert.equal(cssTokens.primaryBorder, "#c98f2a");
  assert.equal(cssTokens.secondaryBorder, "#c7ccd3"); assert.equal(cssTokens.quietText, "#8a6a1f"); assert.equal(cssTokens.dangerText, "#b23a2e"); assert.equal(cssTokens.dangerBorder, "#e3b4ae");
  assert.equal(cssTokens.radius, "6px"); assert.equal(cssTokens.weight, "500");
});

test("every text pair of every role passes WCAG AA (4.5:1); a disabled control is exempt by the standard and stays flat grey", () => {
  const pairs = {
    "primary": [buttons.primaryText, buttons.primaryBg], "primary hover": [buttons.primaryText, buttons.primaryBgHover], "primary active": [buttons.primaryText, buttons.primaryBgActive],
    "secondary": [buttons.secondaryText, buttons.secondaryBg], "secondary hover": [buttons.secondaryText, buttons.secondaryBgHover], "secondary active": [buttons.secondaryText, buttons.secondaryBgActive],
    "quiet": [buttons.quietText, buttons.secondaryBg], "quiet hover": [buttons.quietText, buttons.quietBgHover], "quiet active": [buttons.quietText, buttons.quietBgActive],
    "danger": [buttons.dangerText, buttons.dangerBg], "danger hover": [buttons.dangerText, buttons.dangerBgHover],
    "icon": [buttons.iconText, buttons.secondaryBg], "icon hover": [buttons.iconText, buttons.secondaryBgHover],
  };
  for (const [name, [fg, bg]] of Object.entries(pairs)) assert.ok(contrast(fg, bg) >= 4.5, `${name}: ${contrast(fg, bg).toFixed(2)}:1`);
  assert.ok(contrast(buttons.disabledText, buttons.disabledBg) < 4.5, "the disabled pair is the flat grey of the design (exempt from AA)");
});

test("the classes: a secondary base, the role classes, a small size, a block row and an icon button, with hover, active and disabled states; the blue focus ring stays", () => {
  for (const sel of [".gs-btn {", ".gs-btn--primary {", ".gs-btn--quiet {", ".gs-btn--danger {", ".gs-btn--icon {", ".gs-btn--sm {", ".gs-btn--block {"]) assert.ok(css.includes(sel), sel);
  for (const role of ["", "--primary", "--quiet", "--danger"]) {
    assert.ok(css.includes(`.gs-btn${role}:hover:not(:disabled)`), `hover ${role}`);
    assert.ok(css.includes(`.gs-btn${role}:active:not(:disabled)`), `active ${role}`);
  }
  assert.match(css, /\.gs-btn:disabled, \.gs-btn\[aria-disabled="true"\] \{[^}]*opacity: 1/); // beside the global 0.55: a flat grey, not a faded role
  assert.match(css, /button:focus-visible[^{]*\{ outline: 2px solid var\(--color-primary\)/);
  assert.match(css, /\.gs-btn \{[^}]*font-weight: var\(--btn-weight\)[^}]*\}/);
  assert.match(css, /--btn-radius/);
});

test("the ratchet: no file has more <button>s without a role class than its baseline, and the total only goes down", () => {
  const base = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  const now = scan();
  const grew = Object.entries(now.byFile).filter(([f, v]) => v.without > (base.byFile[f] ?? 0)).map(([f, v]) => `${f}: ${base.byFile[f] ?? 0} -> ${v.without}`);
  assert.deepEqual(grew, [], "a button needs className=\"gs-btn …\" (or data-btn-own for the ribbon, the 3D view's floating controls, a segmented toggle, a bare glyph): see scripts/button-roles.mjs");
  assert.ok(now.without <= base.withoutRole, `${now.without} role-less buttons, the baseline is ${base.withoutRole}`);
});

test("no component renders two primaries (a line marked gs-primary-alt is one of two alternatives)", () => {
  const twice = primaryCounts().filter((r) => r.primaries > 1).map((r) => `${r.file} ${r.component}: ${r.primaries}`);
  assert.deepEqual(twice, []);
});

test("the scanner reads a tag whose handler holds a comment with an apostrophe, a '>' in a string and an arrow, and the markers", () => {
  const src = `<div><button onClick={() => { // the page's paper > the sheet\n  go("a>b"); }} title={tr("x")} className="gs-btn gs-btn--primary">Go</button><button data-btn-own="">x</button><button style={{ ...pBtn }}>y</button></div>`;
  const tags = buttonTags(src);
  assert.equal(tags.length, 3);
  assert.deepEqual(tags.map((t) => hasRole(t.text)), [true, true, false]);
  assert.ok(tags[0].text.endsWith('className="gs-btn gs-btn--primary">'));
});

test("the migrated surfaces carry the roles: the import dialogs' Import is the primary, Cancel the secondary; the guide's step button is primary", () => {
  const f = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const im = f("../src/components/ImportMappingModal.jsx");
  // TASKS.csv #4073 — the column matching is a StepDialog: its Import is the step's gold primary, Cancel / Back the shell's secondaries
  assert.match(im, /const importPrimary = \{ label: tr\("Import \{rowCount\} rows"/);
  assert.match(im, /primary: importPrimary/);
  assert.match(im, /return <StepDialog title=\{heading\} onClose=\{onCancel\}/);
  assert.match(f("../src/modules/viewer/guided/GuideBar.jsx"), /className="gs-btn gs-btn--primary gs-btn--sm"/);
  assert.match(f("../src/components/GradeEstimationModal.jsx"), /<StepDialog title=/); // #4073: Run, then Add as block model, is the shell's one primary
});
