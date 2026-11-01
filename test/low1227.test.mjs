import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tabNoticesSwitch } from "../src/lib/useTabNotices.js";
import { explicitPoints, fitExplicitSurface } from "../src/lib/explicitSurface.js";

const read = (f) => readFileSync(f, "utf8");
test("#1203 each tab gets its own notices back, and a new tab starts empty", () => {
  const stash = new Map();
  assert.deepEqual(tabNoticesSwitch(stash, "a", "b", ["woodjam"]), []);
  assert.deepEqual(tabNoticesSwitch(stash, "b", "a", ["perk"]), ["woodjam"]);
  assert.deepEqual(tabNoticesSwitch(stash, "a", "b", ["woodjam", "more"]), ["perk"]);
  assert.equal(stash.size, 1); // only the tab just left is held
  assert.match(read("src/modules/ViewerModule.jsx"), /useTabNotices\(store\.activeTabId, \(\) => \{ setCursor\(.*setToast\(null\); tabSwitchedRef\.current = true;/);
  assert.match(read("src/modules/GeochemModule.jsx"), /useTabNotices\(useStore\(\)\.activeTabId\)/);
});
test("#1296 box plot labels come after the points, with a halo", () => {
  const p = read("src/components/GeochemPlot.jsx");
  assert.ok(p.indexOf("<BoxplotLabels") > p.indexOf("{dots}"));
  assert.match(p, /paintOrder: "stroke", stroke: "#ffffff"/);
  const guides = p.slice(p.indexOf("function BoxplotGuides"), p.indexOf("function BoxplotLabels"));
  assert.ok(!/<text/.test(guides));
});
test("#1227 through the real fit: guide points do not count, and the figure does not shrink because of them", () => {
  // scattered picks on a rough surface, and straight guide lines through each, which predict each other well
  const picks = [[0, 0, 100], [300, 40, 160], [80, 310, 60], [340, 330, 140], [170, 160, 40], [40, 170, 130], [290, 190, 70]].map(([x, y, z], i) => ({ id: `p${i}`, x: 500000 + x, y: 6200000 + y, z, src: "pick" }));
  const guide = (p) => ({ ref: `${p.id} guide`, src: "downhole", pts: [-1, 1].map((d) => ({ x: p.x + d * 60, y: p.y, z: p.z })) });
  const plain = fitExplicitSurface(explicitPoints({ picks }, []).points, { resolution: 20 }).quality;
  const guided = fitExplicitSurface(explicitPoints({ picks }, [], { spacing: 20, extraLines: picks.map(guide) }).points, { resolution: 20 }).quality;
  assert.equal(plain.looObserved, picks.length);
  assert.equal(plain.looConstructed, 0);
  assert.equal(guided.looObserved, picks.length);
  assert.ok(guided.looConstructed > 0);
  assert.equal(guided.looWorst.src, "pick");
});
test("#1227 the figure is over the observed inputs and says so", () => {
  assert.match(read("src/lib/explicitSurface.js"), /CONSTRUCTED_SRC = new Set\(\["downhole", "guide"\]\)/);
  assert.match(read("src/components/ExplicitSurfacePanel.jsx"), /Leave-one-out over the \{n\} observed inputs/);
  assert.match(read("src/lib/meshExport.js"), /over the \$\{q\.looObserved\} observed inputs/);
});
test("#1218 a tab left behind keeps the project's name: it came back as Untitled project", () => {
  const st = read("src/lib/store.jsx");
  const n = st.split("{ ...t, name: project?.name || t.name, payload: current, dirty: activeTabDirty }").length - 1;
  assert.ok(n >= 2, String(n));
  assert.ok(!st.includes("{ ...t, payload: current, dirty: activeTabDirty }"));
});
