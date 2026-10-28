// TASKS.csv #1065 — .qml colours from both QGIS formats; a category with no colour keeps its automatic one
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQmlStyle, applyQmlToCategories } from "../src/lib/mapLayers.js";

const wrap = (symbols) => `<qgis version="3.10"><renderer-v2 type="categorizedSymbol" attr="UNIT"><categories>
<category render="true" value="Kgd" symbol="0" label="Kgd granodiorite"/><category render="true" value="Ts" symbol="1" label="Ts"/>
</categories><symbols>${symbols}</symbols></renderer-v2><layerOpacity>1</layerOpacity></qgis>`;

test("#1065 an old (QGIS <= 3.16) <prop k v> .qml gives its real colours", () => {
  const q = parseQmlStyle(wrap(`<symbol name="0" type="fill" alpha="1"><layer class="SimpleFill"><prop k="color" v="255,0,128,255"/><prop v="35,35,35,255" k="outline_color"/></layer></symbol>
<symbol name="1" type="fill" alpha="1"><layer class="SimpleFill"><prop v="0,128,0,255" k="color"/></layer></symbol>`));
  assert.deepEqual(q.categories.map((c) => [c.value, c.color, c.outline]), [["Kgd", "#ff0080", "#232323"], ["Ts", "#008000", null]]);
});

test("#1065 a 3.28 <Option> .qml still parses (colour string with rgb: suffix)", () => {
  const q = parseQmlStyle(wrap(`<symbol name="0" type="fill"><layer class="SimpleFill"><Option type="Map"><Option name="color" type="QString" value="255,0,128,255,rgb:1,0,0.5,1"/></Option></layer></symbol>
<symbol name="1" type="fill"><layer class="SimpleFill"><Option type="Map"><Option value="0,128,0,255" name="color" type="QString"/></Option></layer></symbol>`));
  assert.deepEqual(q.categories.map((c) => c.color), ["#ff0080", "#008000"]);
});

test("#1065 a symbol with no readable colour keeps the automatic colour, not grey", () => {
  const q = parseQmlStyle(wrap(`<symbol name="0" type="fill"><layer class="SVGFill"></layer></symbol><symbol name="1" type="fill"><layer class="SimpleFill"><prop k="color" v="0,128,0,255"/></layer></symbol>`));
  const cats = applyQmlToCategories([{ value: "Kgd", color: "#abcdef", label: "Kgd" }, { value: "Ts", color: "#111111", label: "Ts" }], q);
  assert.deepEqual(cats.map((c) => [c.color, c.label]), [["#abcdef", "Kgd granodiorite"], ["#008000", "Ts"]]);
});
