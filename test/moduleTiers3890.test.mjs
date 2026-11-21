// TASKS.csv #3890 — Basic / Advanced module tabs: Basic (StrixViewer, Maps, Layout) first, a divider, then Advanced; no fold, in Simple
// mode too; a caption and a 3 px stripe per group from two colour tokens; Ctrl+1..n follow the drawn order everywhere.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { groupModules, tabOrder, TIERS, TIER_CAPTION, TIER_GROUP_LABEL } from "../src/lib/moduleTiers.js";
import { HIDDEN_TABS } from "../src/lib/features.js";
import { colors } from "../src/lib/theme.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const app = rd("src/App.jsx");
// the MODULES entries as App.jsx writes them, in order
const MODULES = [...app.matchAll(/\{ id: "([a-z]+)", label: "([^"]+)", icon: \w+(?:, tip: "[^"]+")?(?:, tier: "([a-z]+)")? \}/g)].map((m) => ({ id: m[1], label: m[2], tier: m[3] }));

test("every module has a tier; Basic is StrixViewer, Maps, Layout (3D Modelling stays Advanced: Matt, #3902)", () => {
  assert.equal(MODULES.length, 9);
  assert.deepEqual(MODULES.filter((m) => !TIERS.includes(m.tier)).map((m) => m.id), []);
  assert.deepEqual(MODULES.filter((m) => m.tier === "basic").map((m) => m.id), ["viewer", "maps", "layout"]);
  assert.throws(() => groupModules([{ id: "x" }]), /no tier/);
});

test("grouping and order: Basic first, then Advanced; the hidden Mine Design left out; eight tabs", () => {
  const g = groupModules(MODULES, HIDDEN_TABS);
  assert.deepEqual(g.map((x) => x.tier), ["basic", "advanced"]);
  assert.deepEqual(tabOrder(MODULES, HIDDEN_TABS), ["viewer", "maps", "layout", "surface", "modelling", "geochem", "geophysics", "targeting"]);
  assert.deepEqual(tabOrder(MODULES, []).slice(-1), ["minedesign"]); // switched on, it closes the Advanced group
  // the given order is kept inside a group, whatever order the list comes in; an empty group is dropped
  assert.deepEqual(tabOrder([{ id: "b", tier: "advanced" }, { id: "a", tier: "basic" }, { id: "c", tier: "advanced" }]), ["a", "b", "c"]);
  assert.deepEqual(groupModules([{ id: "a", tier: "advanced" }]).map((x) => x.tier), ["advanced"]);
  assert.deepEqual(groupModules([{ id: "a", tier: "basic" }], ["a"]), []);
});

test("App.jsx draws the groups with captions and stripes, and never folds them", () => {
  assert.match(app, /groupModules\(MODULES, HIDDEN_TABS\)\.map\(\(g, gi\) => \(/);
  assert.match(app, /\{gi > 0 && <div className="ge-tool-sep ge-tier-sep" \/>\}/);
  assert.match(app, /<div className="ge-tier-group" role="group" aria-label=\{tr\(TIER_GROUP_LABEL\[g\.tier\]\)\} data-tier=\{g\.tier\}>/);
  assert.match(app, /const cap = \[\.\.\.tr\(TIER_CAPTION\[g\.tier\]\)\];/); // #3900 — first letter and the rest, so the last fit step can keep the letter
  assert.match(app, /<span className="ge-tier-cap" aria-hidden="true" title=\{cap\.join\(""\)\}><span>\{cap\[0\]\}<\/span><span className="ge-tier-cap-rest">\{cap\.slice\(1\)\.join\(""\)\}<\/span><\/span>/);
  assert.doesNotMatch(app, /uiMode === "simple"[^\n]*tier/); // no Simple-mode fold
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(rd(`src/locales/${lang}.json`));
    for (const k of [...Object.values(TIER_CAPTION), ...Object.values(TIER_GROUP_LABEL)]) assert.ok(d[k], `${lang}: ${k}`);
  }
});

test("Ctrl+1..n: the native menu and the shortcuts list follow the drawn order", () => {
  const ids = (s) => [...s.matchAll(/\["[^"]+", "([a-z]+)"\]/g)].map((m) => m[1]).filter((id) => MODULES.some((m) => m.id === id));
  const order = MODULES.map((m) => m.id);
  assert.deepEqual(ids(rd("electron/main.js")), order);
  assert.deepEqual(ids(rd("src/components/ShortcutsModal.jsx")), order);
  assert.deepEqual(order.filter((id) => !HIDDEN_TABS.includes(id)), tabOrder(MODULES, HIDDEN_TABS));
});

// WCAG relative luminance contrast
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test("the tier tokens: in app.css and theme.js alike, 3:1 against the bar and the selected tab, 4.5:1 as caption text", () => {
  const css = rd("src/styles/app.css");
  const tok = (n) => css.match(new RegExp(`--color-${n}: (#[0-9a-f]{6});`))?.[1];
  const pairs = { "tier-basic": "tierBasic", "tier-basic-bg": "tierBasicBg", "tier-advanced": "tierAdvanced", "tier-advanced-bg": "tierAdvancedBg" };
  for (const [c, j] of Object.entries(pairs)) assert.equal(tok(c), colors[j], c);
  const bar = tok("bg"), selected = tok("selected-bg");
  for (const t of ["basic", "advanced"]) {
    assert.ok(contrast(tok(`tier-${t}`), bar) >= 3, `${t} stripe on the bar`);
    assert.ok(contrast(tok(`tier-${t}`), selected) >= 3, `${t} stripe on the selected tab`);
    assert.ok(contrast(tok(`tier-${t}`), tok(`tier-${t}-bg`)) >= 4.5, `${t} caption text`);
  }
  assert.match(css, /\.ge-tool-btn\[data-tier\] \{ box-shadow: inset 0 0\.5em 0 var\(--tier-fg\); \}/); // #3902: one fifth of the 2.5em (30 px) tab, in em
  assert.match(css, /\.ge-tool-btn\[data-tier\]\.active \{ box-shadow: inset 0 0\.5em 0 var\(--tier-fg\), inset 0 -2px 0 var\(--color-accent-dark\); \}/);
});

test("#3902 / #3903: each tooltip starts with its tier; the switch reads Basic tools / All tools on the same stored values", () => {
  const tips = [...app.matchAll(/\{ id: "([a-z]+)", label: "[^"]+", icon: \w+, tip: "([^"]+)", tier: "([a-z]+)" \}/g)].map((m) => ({ id: m[1], tip: m[2], tier: m[3] }));
  assert.equal(tips.length, 8); // every shown tab (Mine Design, switched off, has none)
  for (const t of tips) assert.ok(t.tip.startsWith(`${TIER_CAPTION[t.tier]}: `), t.id);
  assert.match(app, /aria-pressed=\{uiMode === "simple"\} onClick=\{\(\) => setUiMode\("simple"\)\}>\{tr\("Basic tools"\)\}<\/button>/);
  assert.match(app, /aria-pressed=\{uiMode === "advanced"\} onClick=\{\(\) => setUiMode\("advanced"\)\}>\{tr\("All tools"\)\}<\/button>/);
  assert.match(rd("src/lib/uiMode.js"), /geostrix\.uiMode/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(rd(`src/locales/${lang}.json`));
    for (const k of [...tips.map((t) => t.tip), "Basic tools", "All tools"]) assert.ok(d[k], `${lang}: ${k}`);
    // the translated tooltip starts with the translated tier caption
    for (const t of tips) assert.ok(d[t.tip].startsWith(d[TIER_CAPTION[t.tier]]), `${lang}: ${t.id}`);
  }
});
