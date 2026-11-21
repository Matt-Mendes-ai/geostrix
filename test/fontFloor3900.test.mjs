// TASKS.csv #3900 T2 — the guard: window furniture takes the font-size tokens (so it follows the Text size setting), and figure text is never under
// 10 px (Matt's floor: on screen and in the export alike). Figures drawn smaller than their units (a 300-unit plot in a 256 px side panel) use
// larger units; this pins only that no literal size under 10 is left. The hidden Mine Design pane (NestedPitsPane) is left as the plan says.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(f)) files.push(p); } })(root);
const rel = (p) => path.relative(root, p).replace(/\\/g, "/");
// every literal font size: JSX attributes, style objects, SVG strings, canvas fonts
const SIZE = /fontSize=\{([0-9.]+)\}|fontSize="([0-9.]+)"|font-size=\\?"?([0-9.]+)|font-size: ?([0-9.]+)px|fontSize: ?([0-9.]+)\b|font = ["'`](?:bold |[0-9]{3} )?([0-9.]+)px/g;
const LEFT_ALONE = new Set(["components/NestedPitsPane.jsx"]); // Mine Design is switched off (#3897); plan_fable 2.4 leaves it

test("no figure text under 10 px anywhere in the app (but the hidden Mine Design pane)", () => {
  const under = [];
  for (const p of files) {
    if (LEFT_ALONE.has(rel(p))) continue;
    const s = readFileSync(p, "utf8");
    for (const m of s.matchAll(SIZE)) { const v = Number(m.slice(1).find(Boolean)); if (v > 0 && v < 10) under.push(`${rel(p)}:${s.slice(0, m.index).split("\n").length} ${m[0]}`); }
  }
  assert.deepEqual(under, []);
});

test("window furniture takes the tokens: no typed font size left in the six kept-out components and the dialogs T2 moved", () => {
  for (const f of ["components/SectionWindow.jsx", "modules/GeochemModule.jsx", "components/StripLog.jsx", "components/StereonetModal.jsx", "components/FenceDiagramModal.jsx",
    "components/DownholeStructurePlot.jsx", "components/SectionTabs.jsx", "components/MultiStripLogModal.jsx", "components/LicensesModal.jsx", "components/AiAccessModal.jsx", "components/EmptyState.jsx"]) {
    const s = readFileSync(path.join(root, f), "utf8");
    assert.doesNotMatch(s, /fontSize: ?[0-9]/, f); // a style object's number; their SVG figure text (fontSize="10" attributes) stays typed, as theme.js requires
  }
});

test("on-screen canvas labels follow the setting; a capture keeps the Normal sizes (the Maps plan, the callouts)", () => {
  const plan = readFileSync(path.join(root, "components/MapsPlanView.jsx"), "utf8");
  assert.match(plan, /const labelPx = \(step\) => \(captureDpr \? fontSizes\[step\] : uiFontPx\(step\)\);/);
  assert.doesNotMatch(plan, /ctx\.font = "1[01]px/);
  assert.match(readFileSync(path.join(root, "lib/collarCallouts.js"), "utf8"), /ctx\.font = `\$\{fontPx\}px sans-serif`; ctx\.textBaseline = "middle";\r?\n  const ROW = fontPx \+ 2,/);
});
