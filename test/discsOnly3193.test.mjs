// TASKS.csv #3193 (Matt, 2026-11-13: "let's remove the structural symbols of the drill holes structural plane and leave the discs only. it
// got too crowded") — the drillhole structure discs carry no USGS symbol any more (#3067 undone); the outcrop structures keep theirs (#3066).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("the drillhole build draws a disc and its dip pin, no symbol", () => {
  const s = read("../src/modules/viewer/drillholeScene.js");
  assert.ok(!/symbolProto3d|symbolForReading|projectSymbolChoices|structureSymbol3d/.test(s));
  assert.match(s, /groups\.structure\.add\(disc\);/);
  assert.match(s, /groups\.structure\.add\(pin\);/);
  assert.ok(!fs.existsSync(new URL("../src/lib/viewer/structureSymbol3d.js", import.meta.url)));
  assert.ok(!/symbolBuildKey|symbolKey/.test(read("../src/modules/ViewerModule.jsx")), "a symbol choice no longer rebuilds the holes");
});

test("the outcrop structures still have their symbols", () => {
  const s = read("../src/lib/structureSymbols.js");
  assert.match(s, /export function projectSymbolChoices/);
  assert.match(s, /export function symbolForReading/);
});
