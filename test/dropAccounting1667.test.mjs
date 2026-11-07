// TASKS.csv #1667 — VTK and EDI files dropped on the Geophysics tab are accounted for
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unreadableFormatAdvice } from "../src/lib/unreadableFormats.js";

test("VTK files say what they are and the way in; EDI files are read (#1989)", () => {
  assert.match(unreadableFormatAdvice("MPD2023-AMT-femtic3D-res-r1i09.vtk"), /VTK model .*UBC mesh \+ model/);
  assert.equal(unreadableFormatAdvice("500N3550.edi"), null); // TASKS.csv #1989 — read now, on the Geophysics tab (MT / AMT)
  assert.equal(unreadableFormatAdvice("stations.csv"), null);
});
test("every other file dropped on the tab is named", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.ok(g.includes("Not imported from this drop: {names}."));
});
