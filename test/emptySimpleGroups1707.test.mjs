// TASKS.csv #1707 / #1817 (reviews #1645 Copley, #1646 Kodiak) — the Simple ribbon showed a 'View' caption with no button above it: every tool
// in the 3D View's View group is Advanced-only. A ribbon group whose every tool is Advanced-only is itself marked advanced (hidden in Simple).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// each <RibbonGroup ...>...</RibbonGroup> block: is the group advanced, and is every direct tool (RibbonButton or ge-ribbon-cell) advanced?
function groups(src) {
  const out = [];
  const re = /<RibbonGroup\b([^>]*)>([\s\S]*?)<\/RibbonGroup>/g;
  let m;
  while ((m = re.exec(src))) {
    const attrs = m[1], body = m[2];
    const label = (attrs.match(/label="([^"]*)"/) || [])[1] || "?";
    const buttons = [...body.matchAll(/<RibbonButton\b([^>]*?)\/?>/g)].map((b) => /\badvanced\b(?!=\{)/.test(b[1]) ? "adv" : /\badvanced=\{/.test(b[1]) ? "cond" : "simple");
    const cells = [...body.matchAll(/className="ge-ribbon-cell( ge-adv)?"/g)].map((c) => (c[1] ? "adv" : "simple"));
    const tools = [...buttons, ...cells];
    out.push({ label, advanced: /\badvanced\b/.test(attrs), tools });
  }
  return out;
}

test("#1707 no ribbon group in the 3D View's ribbons is empty in Simple mode", () => {
  for (const f of ["modules/viewer/ViewerParts.jsx", "modules/ViewerModule.jsx"]) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
    for (const g of groups(src)) {
      if (g.advanced || !g.tools.length) continue;
      assert.ok(g.tools.some((t) => t !== "adv"), `${f}: group "${g.label}" shows in Simple mode with only Advanced tools`);
    }
  }
});

test("#1707 the View group is marked advanced", () => {
  const p = readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8");
  assert.match(p, /<RibbonGroup label="View" advanced>/);
});
