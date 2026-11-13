// TASKS.csv #3091 (side 3's symbol line thickness) for #3067's drillhole structure discs: a disc's USGS symbol is drawn at the line thickness
// of the outcrop set its type's symbol choice comes from (a later set's choice wins, as projectSymbolChoices); a type no set chooses for at 1.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SYMBOLS } from "../src/lib/structureSymbols.js";
import { projectSymbolScales, symbolProto3d, symbolTriangles, STRIP_HALF, STRIP_HALF_MAX } from "../src/lib/viewer/structureSymbol3d.js";

test("each type's thickness comes from the set whose choice it uses", () => {
  const sets = [
    { lineScale: 2, symbolByType: { FAULT: "fault", BEDDING: "bedding" } },
    { lineScale: 3, symbolByType: { FAULT: "fault" } }, // a later set's choice wins for FAULT
    { symbolByType: { VEIN: "vein" } }, // no lineScale: 1
    { lineScale: 99, symbolByType: { CONTACT: "contact" } }, // clamped to 6
  ];
  const sc = projectSymbolScales(sets);
  assert.equal(sc.FAULT, 3);
  assert.equal(sc.BEDDING, 2);
  assert.equal(sc.VEIN, 1);
  assert.equal(sc.CONTACT, 6);
  assert.deepEqual(projectSymbolScales([]), {});
});

test("the strips widen with the thickness, capped; one shared geometry per symbol and thickness", () => {
  const sym = SYMBOLS["6.2"];
  const width = (half) => { const p = symbolTriangles(sym, { half }).positions; let m = 0; for (let i = 0; i < p.length; i += 3) m = Math.max(m, Math.abs(p[i + 1])); return m; };
  assert.ok(width(STRIP_HALF * 2) > width(STRIP_HALF), "thicker strips reach further from the strike line");
  const a = symbolProto3d(sym), b = symbolProto3d(sym, 1), c = symbolProto3d(sym, 2), d = symbolProto3d(sym, 2);
  assert.equal(a, b, "1 is the existing geometry");
  assert.notEqual(c, a);
  assert.equal(c, d, "shared per thickness");
  assert.ok(STRIP_HALF * 6 > STRIP_HALF_MAX, "the cap applies at the thickest");
});

test("wiring: drillholeScene reads the thickness for each disc's type and redraws when it changes", () => {
  const s = fs.readFileSync(new URL("../src/modules/viewer/drillholeScene.js", import.meta.url), "utf8");
  assert.match(s, /const symScales = projectSymbolScales\(surfaceStructures\);/);
  assert.match(s, /symbolProto3d\(symbol, symScales\[typeKey\(s\.value\)\] \?\? 1\)/);
});

test("a symbol choice or a thickness change redraws the discs (the build re-runs on its key, not on new outcrop rows)", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const symbolKey = useMemo\(\(\) => symbolBuildKey\(surfaceStructures\), \[surfaceStructures\]\);/);
  assert.match(v, /placedSurfaceSamples \/\* #606 — and the no-drillhole camera anchor \*\/, symbolKey \/\* #3091 \*\/\]\);/);
});
