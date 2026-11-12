// TASKS.csv #2778 (Matt, 2026-11-12: option b) — a project with no collars at all: the 3D View's Simple ribbon shows 3D slice and Level plan in
// place of the drillhole tools (Data QC, Contact picks, Grade intercepts). One collar brings the usual Simple set back.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the Simple set follows whether the project has collars", () => {
  assert.match(src, /const noHoles = !spacingCollars\.length;/);
  assert.match(src, /<RibbonGroup label="View" advanced=\{!noHoles\}>/); // the group shows in Simple only for 3D slice
  assert.match(src, /<RibbonButton advanced=\{!noHoles\} icon=\{SquareSplitVertical\} label="3D slice"/);
  assert.match(src, /<RibbonButton advanced=\{!noHoles\} icon=\{Layers3\} label="Level plan"/);
  assert.match(src, /<div className=\{`ge-ribbon-cell\$\{noHoles \? " ge-adv" : ""\}`\}>\n\s+<HoverToolInfo title=\{tr\("Run data QC"\)\}/);
  assert.match(src, /<div className=\{`ge-ribbon-cell\$\{noHoles \? " ge-adv" : ""\}`\}>\n\s+<HoverToolInfo title=\{tr\("Boundary intercepts"\)\}/);
  assert.match(src, /<RibbonButton advanced=\{noHoles\} icon=\{FileBarChart2\} label="Grade intercepts"/);
});

test("Grid, Figure overlay and Themes stay Advanced either way (so the View group shows only 3D slice in Simple)", () => {
  const view = src.slice(src.indexOf('<RibbonGroup label="View"'), src.indexOf('<RibbonGroup label="Sections">'));
  const cells = view.match(/<div className="ge-ribbon-cell[^"]*">/g) || [];
  assert.equal(cells.length, 3);
  assert.ok(cells.every((c) => c.includes("ge-adv")));
});
