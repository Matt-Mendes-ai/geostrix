// TASKS.csv #1487 — templates without this project's pictures, and a store of templates on this computer for every project.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { templateElements, isDataSnapshot } from "../src/lib/layoutTitleBlock.js";
import { parseComputerTemplates, withComputerTemplate, withoutComputerTemplate, computerTemplatesText } from "../src/lib/computerTemplates.js";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const page = [
  { id: "tb", type: "titleblock", x: 10, y: 10, w: 300, h: 120 },
  { id: "logo", type: "logo", x: 0, y: 0, w: 160, src: PNG },
  { id: "pic", type: "image", x: 5, y: 5, w: 100, h: 80, src: PNG }, // a picture the user added
  { id: "sec", type: "image", x: 5, y: 5, w: 700, h: 300, src: PNG, sectionTabId: "s1", worldWidthAtCaptureM: 900, legendItems: [{ label: "Argillite", color: "#777" }] },
  { id: "leg", type: "legend", x: 720, y: 5, items: [], boundViewportId: "sec" },
  { id: "vp", type: "viewport", x: 20, y: 200, w: 500, h: 300, capW: 500, capH: 300, src: PNG, worldHeightAtTarget: 1200, targetWorld: { x: 1, y: 2, z: 3 }, planView: true, trueScale: true, fixedScale: 5000, themeId: "th1", utmGrid: true, frameStyle: "double" },
  { id: "bar", type: "scale", x: 30, y: 520, boundTo: "vp" },
  { id: "bar2", type: "scale", x: 30, y: 540, boundTo: "sec" },
];

test("a template leaves out the data snapshots and the viewports' pictures, keeps the furniture and the user's images", () => {
  const { elements, dropped, cleared } = templateElements(page);
  assert.equal(dropped, 1);
  assert.equal(cleared, 1);
  const ids = elements.map((e) => e.id);
  assert.deepEqual(ids, ["tb", "logo", "pic", "leg", "vp", "bar", "bar2"]);
  const vp = elements.find((e) => e.id === "vp");
  for (const k of ["src", "worldHeightAtTarget", "targetWorld", "planView"]) assert.ok(!(k in vp), k);
  for (const [k, v] of [["w", 500], ["h", 300], ["trueScale", true], ["fixedScale", 5000], ["utmGrid", true], ["frameStyle", "double"]]) assert.equal(vp[k], v, k);
  assert.equal(elements.find((e) => e.id === "leg").boundViewportId, null);
  assert.equal(elements.find((e) => e.id === "bar").boundTo, "vp");
  assert.equal(elements.find((e) => e.id === "bar2").boundTo, null);
  assert.equal(elements.find((e) => e.id === "logo").src, PNG);
  assert.equal(isDataSnapshot(page[2]), false);
  assert.ok(page[5].src, "the page itself is not changed");
});

test("the computer store: add, replace by name, delete, and read back through the template validator", () => {
  let { list, replaced } = withComputerTemplate([], { name: "Company A4", format: { size: "A4", orientation: "portrait" }, elements: page }, 1);
  assert.equal(replaced, false);
  assert.equal(list.length, 1);
  ({ list, replaced } = withComputerTemplate(list, { name: "Company A4", format: null, elements: [page[0]] }, 2));
  assert.equal(replaced, true);
  assert.equal(list.length, 1);
  assert.equal(list[0].elements.length, 1);
  ({ list } = withComputerTemplate(list, { name: "Section A3", format: { size: "A3", orientation: "landscape" }, elements: page }, 3));
  const text = computerTemplatesText(list);
  const back = parseComputerTemplates(text);
  assert.deepEqual(back.map((t) => t.name), ["Company A4", "Section A3"]);
  assert.deepEqual(back[1].format, { size: "A3", orientation: "landscape" });
  assert.ok(!back[1].elements.some((e) => e.id === "sec"), "no section snapshot on the computer");
  assert.equal(withoutComputerTemplate(back, back[0].id).length, 1);
  // junk is skipped, not thrown
  assert.deepEqual(parseComputerTemplates("not json"), []);
  assert.deepEqual(parseComputerTemplates('{"a":1}'), []);
  const mixed = JSON.parse(text); mixed.push({ nope: 1 }, { geostrixLayoutTemplate: 1, name: "Evil", elements: [{ id: "x", type: "logo", src: "https://example.com/a.png" }] });
  const m = parseComputerTemplates(JSON.stringify(mixed));
  assert.equal(m.length, 3);
  assert.equal(m[2].elements.length, 0, "a logo pointing at the network is dropped");
});

test("main keeps the store in userData, size-capped, a JSON array, written through a temporary file", () => {
  const src = fs.readFileSync("electron/main.js", "utf8");
  const i = src.indexOf('ipcMain.handle("computer-templates-write"');
  const block = src.slice(i, i + 800);
  assert.match(src, /COMPUTER_TEMPLATES_PATH = \(\) => path\.join\(app\.getPath\("userData"\), "layout-templates\.json"\)/);
  assert.match(block, /COMPUTER_TEMPLATES_MAX/);
  assert.match(block, /Array\.isArray\(JSON\.parse\(content\)\)/);
  assert.match(block, /\.tmp"[\s\S]*rename/);
  assert.match(fs.readFileSync("electron/preload.js", "utf8"), /computerTemplatesWrite: \(content\) => ipcRenderer\.invoke\("computer-templates-write", content\)/);
});
