// TASKS.csv #3904 (platform redesign, P2) — the 3D Modelling, Mine Design and Targeting ribbons moved out of ViewerModule.jsx into
// viewer/ModeRibbons.jsx, unchanged. The buttons themselves are pinned by their own rows' tests (#2390, #3003, #2705, #2261).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3904 ViewerModule renders the three mode ribbons through ModeRibbons, once, hidden when bare; no ribbon JSX is left in it", () => {
  const v = read("../src/modules/ViewerModule.jsx");
  assert.equal(v.split("<ModeRibbons ").length, 2);
  assert.match(v, /<ModeRibbons \{\.\.\.\{ mode, paneProps, simpleTools, project, plannedHoles, pickHoleMode, setPickHoleMode, setToolPane, exportPlannedHoles, [^}]*\}\} show=\{visible && !bare\} \/>/);
  assert.doesNotMatch(v, /<Ribbon |<RibbonGroup |<RibbonButton /);
  assert.ok(v.indexOf("<ModeRibbons ") < v.indexOf("<SurfaceRibbon "), "where the 3D Modelling ribbon was (one mode shows at a time)");
});

test("#3904 ModeRibbons: one ribbon per mode, in the old order, each shown only in its mode", () => {
  const r = read("../src/modules/viewer/ModeRibbons.jsx");
  const at = (t) => r.indexOf(t);
  assert.ok(at('{mode === "modelling" && (') > 0 && at('{mode === "modelling" && (') < at('{mode === "minedesign" && (') && at('{mode === "minedesign" && (') < at('{mode === "targeting" && ('));
  for (const l of ["3D Modelling tools", "Mine design tools", "Targeting tools"]) assert.match(r, new RegExp(`<Ribbon show=\{show\} label="${l}">`));
});
