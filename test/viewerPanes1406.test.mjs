// TASKS.csv #1406 — a ribbon pane opened at the top of a scrolled sidebar, out of sight; #1405 — the 3D grid walls stood 1,000 m above the
// origin (the mean collar elevation) while the drilling is below it
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("#1406: opening a pane scrolls the sidebar to it, after toolPane is declared", () => {
  assert.ok(v.includes('<div className="ge-panel" ref={panelScrollRef}'));
  const decl = v.indexOf("const [toolPane, setToolPane]"), eff = v.indexOf("if (toolPane || interpretOpen) panelScrollRef.current?.scrollTo?.({ top: 0 });");
  assert.ok(decl > 0 && eff > decl);
});

test("#1405: the walls hang below the ground grid", () => {
  assert.ok(v.includes("back.position.set(0, -size / 2, -size / 2);") && v.includes("side.position.set(-size / 2, -size / 2, 0);"));
});
