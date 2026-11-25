// TASKS.csv #4074 — no ribbon or top-bar tool is ever unreachable at a small window. The decision of what moves into a More menu is lib/overflowFit.js, kept free
// of the DOM: this test runs it at the widths that matter (1,366, 1,280, 1,024 and below) over ribbons shaped like the real ones (the group and tool counts are read
// from the modules' source) and reports any tool that would be dropped. The real layout is checked by `node scripts/audit-ribbon.mjs` against a running app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { pickOverflowGroup, fitByOverflow, fitRowByOverflow, clearOverflow, hideLastTool, shownCount, trimSeparators, OVF } from "../src/lib/overflowFit.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// ---- the real ribbons' shape: for each module file, the tools of each <RibbonGroup> (a RibbonButton or a ge-ribbon-cell)
function ribbonsOf(file) {
  const s = read(file), groups = [];
  const re = /<RibbonGroup\b[^>]*>([\s\S]*?)<\/RibbonGroup>/g;
  let m;
  while ((m = re.exec(s))) {
    const n = (m[1].match(/<RibbonButton\b/g) || []).length + (m[1].match(/className="ge-ribbon-cell/g) || []).length;
    if (n) groups.push(n);
  }
  return groups;
}
const MODULES = ["src/modules/ViewerModule.jsx", "src/modules/viewer/ViewerParts.jsx", "src/modules/GeochemModule.jsx", "src/modules/GeophysicsModule.jsx", "src/modules/LayoutModule.jsx", "src/modules/RasterModule.jsx", "src/modules/CartographyModule.jsx", "src/modules/SurfaceMappingModule.jsx", "src/modules/viewer/ModellingPanes.jsx"]
  .filter((f) => existsSync(new URL("../" + f, import.meta.url)));

// a simulated band: every tool is a 29 px icon (tight, icon-only), a group has 2 px of padding and a 34 px More button once a tool left it
const TOOL = 29, PAD = 2, MORE = 34;
function simulate(groupSizes, available) {
  const shownIn = groupSizes.slice();
  const widthOf = (i) => PAD + shownIn[i] * TOOL + (shownIn[i] < groupSizes[i] ? MORE : 0);
  const total = () => shownIn.reduce((t, _, i) => t + widthOf(i), 0);
  const r = fitByOverflow({
    fits: () => total() <= available,
    groups: () => shownIn.map((v, i) => ({ width: widthOf(i), visible: v })),
    hideLast: (i) => { shownIn[i]--; },
  });
  return { ...r, shownIn, total: total() };
}

test("which group gives up a tool: the widest one still showing two or more", () => {
  assert.equal(pickOverflowGroup([{ width: 100, visible: 3 }, { width: 200, visible: 5 }, { width: 300, visible: 1 }]), 1, "a group on its last tool keeps it");
  assert.equal(pickOverflowGroup([{ width: 100, visible: 1 }, { width: 50, visible: 1 }]), -1);
  assert.equal(pickOverflowGroup([]), -1);
});

test("real ribbons at 1,366, 1,280, 1,024 and 900 px: every tool is shown or in a More menu, none dropped, hidden ones always the group's last", () => {
  assert.ok(MODULES.length >= 5, "the module files were found");
  const lost = [];
  let checked = 0;
  for (const f of MODULES) {
    const groups = ribbonsOf("../" + f);
    if (groups.length < 2) continue;
    const tools = groups.reduce((a, b) => a + b, 0);
    for (const w of [1366, 1280, 1024, 900]) {
      const avail = w - 150; // the Basic / All tools toggle, the divider and the page's own margin
      const r = simulate(groups, avail);
      checked++;
      const hiddenCount = r.shownIn.reduce((a, v, i) => a + (groups[i] - v), 0);
      const minPossible = groups.length * (PAD + TOOL + MORE) - 0; // one tool and a More button per group
      if (avail >= minPossible && !r.ok) lost.push(`${f} at ${w}: still too wide with ${hiddenCount} tools in More`);
      if (r.shownIn.some((v) => v < 1)) lost.push(`${f} at ${w}: a group has no tool left`);
      assert.equal(r.shownIn.reduce((a, v) => a + v, 0) + hiddenCount, tools, `${f} at ${w}: shown + in More = all tools`);
      if (avail >= tools * TOOL + groups.length * PAD) assert.equal(hiddenCount, 0, `${f} at ${w}: nothing hidden when everything fits`);
    }
  }
  assert.ok(checked >= 20, `checked ${checked} ribbons x widths`);
  assert.deepEqual(lost, [], "tools that would be unreachable");
});

test("the top bar's actions: the last ones go first, at least one stays", () => {
  const n = 9, w = 38; // New Open Save, Undo Redo, Export PDF KMZ Report ... as icons
  for (const avail of [900, 400, 250, 120]) {
    let shown = n;
    const r = fitRowByOverflow({ fits: () => shown * w + (shown < n ? 34 : 0) <= avail, visible: () => shown, hideLast: () => { shown--; } });
    assert.ok(shown >= 1 && shown <= n);
    if (avail >= 38 + 34) assert.ok(r.ok, `fits at ${avail}`);
    assert.equal(r.hidden, n - shown);
  }
});

// ---- the DOM side, on a minimal stand-in for a node
class Node {
  constructor(attrs = {}, width = 30) { this.attrs = { ...attrs }; this.offsetWidth = width; this.children = []; }
  hasAttribute(k) { return k in this.attrs; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  querySelectorAll(sel) { const k = sel.replace(/^\[|\]$/g, ""); return this.children.filter((c) => c.hasAttribute(k)); }
}
const row = (...spec) => { const c = new Node(); c.children = spec.map((s) => (s === "sep" ? new Node({ "data-sep": "" }, 8) : s === "more" ? new Node({ "data-more-wrap": "" }, 34) : new Node({}, 30))); return c; };

test("hideLastTool hides from the end, marks where the menu starts, and clearOverflow undoes it", () => {
  const c = row("t", "t", "t", "t", "more");
  assert.equal(shownCount(c), 4);
  assert.equal(hideLastTool(c), 3);
  assert.equal(hideLastTool(c), 2);
  assert.equal(c.getAttribute("data-overflow-from"), "2");
  assert.equal(shownCount(c), 2);
  assert.ok(c.children[3].hasAttribute(OVF) && c.children[2].hasAttribute(OVF) && !c.children[1].hasAttribute(OVF));
  assert.ok(!c.children[4].hasAttribute(OVF), "the More button itself is never hidden");
  clearOverflow(c);
  assert.equal(shownCount(c), 4);
  assert.equal(c.getAttribute("data-overflow-from"), null);
});

test("a slot with no width (a tool Simple mode hides) is not a tool to hide, and a divider at the end of the row goes with its neighbours", () => {
  const c = row("t", "t", "sep", "t", "t", "more");
  c.children[4].offsetWidth = 0;
  assert.equal(shownCount(c), 3);
  assert.equal(hideLastTool(c), 2, "the empty slot after it is skipped (index among the tools, dividers not counted)");
  trimSeparators(c);
  assert.ok(c.children[2].hasAttribute(OVF), "no tool after the divider any more");
  const d = row("t", "sep", "t", "more");
  trimSeparators(d);
  assert.ok(!d.children[1].hasAttribute(OVF), "a divider between two shown tools stays");
});

test("the wiring: groups carry a More menu, the top bar an OverflowRow, the second row that was cut off is gone, and the audit script exists", () => {
  const rib = read("../src/components/Ribbon.jsx"), app = read("../src/App.jsx"), css = read("../src/styles/app.css");
  assert.match(rib, /data-more-wrap=""/);
  assert.match(rib, /fitByOverflow\(\{/);
  assert.match(rib, /className="ge-ribbon-slot"/);
  assert.doesNotMatch(rib, /setAttribute\("data-wrap", ""\)/, "no second row under a band of fixed height");
  assert.match(app, /<OverflowRow ref=\{actionsRef\}/);
  assert.match(app, /fitRowByOverflow\(\{/);
  assert.match(css, /\.ge-ribbon-items > \[data-ovf\] \{ display: none; \}/);
  assert.match(css, /\.ge-tool-actions > \[data-ovf\] \{ display: none; \}/);
  // Arabic mirrors the bar: the ⋯ sits at the window's left edge, so its menu is anchored to the side the button is on (never always to its right edge, which ran off screen)
  const ovr = read("../src/components/OverflowRow.jsx");
  assert.match(ovr, /const end = r\.left > window\.innerWidth \/ 2;/);
  assert.match(ovr, /\.\.\.\(menu\.end \? \{ right: menu\.x \} : \{ left: menu\.x \}\)/);
  assert.match(app, /fitRowByOverflow\(\{ keep: 0,/, "the last action may go into the menu too: in French at the largest text the tabs alone fill a 900 px bar");
  assert.ok(existsSync(new URL("../scripts/audit-ribbon.mjs", import.meta.url)));
  assert.match(read("../scripts/audit-ribbon.mjs"), /LOST/);
  assert.ok(readdirSync(new URL("../src/components/", import.meta.url)).includes("OverflowRow.jsx"));
});
