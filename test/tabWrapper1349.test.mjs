// TASKS.csv #1349 — a MapInfo .TAB of Type SHAPEFILE is a wrapper: its shapefile is read (picked with it, or from the .TAB's own folder);
// a saved QUERY or a table linked to a spreadsheet / database is said plainly.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTabHeader } from "../src/lib/mapinfoTab.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const tab = (type) => new TextEncoder().encode(`!table\n!version 700\n!charset WindowsLatin1\n\nDefinition Table\n  Type ${type} Charset "WindowsLatin1"\n  Fields 1\n    Id Decimal (8, 0) ;\n`);

test("the wrapper types are read from the header", () => {
  assert.equal(parseTabHeader(tab("SHAPEFILE")).tableType, "SHAPEFILE"); // as ARIS 41597Z's Woodjam_ZTEM_2023-01-18_ln.TAB
  assert.equal(parseTabHeader(tab("QUERY")).tableType, "QUERY");
  assert.equal(parseTabHeader(tab("XLS")).tableType, "XLS");
  assert.equal(parseTabHeader(tab("NATIVE")).tableType, "NATIVE");
});

test("wired: the panel reads the shapefile beside the wrapper, through a route limited to it", () => {
  const p = read("src/components/SurfaceMappingPanel.jsx");
  assert.ok(p.includes('if (type === "SHAPEFILE") {') && p.includes("const r = await tabSiblingShapefile(g.tab);") && p.includes("parseShapefileParts({ shp: r.parts.shp"));
  assert.ok(p.includes('k.toLowerCase() === g.name.toLowerCase() && looseShp[k].shp)) continue; // read below as a shapefile'), "the .shp picked too: read once");
  const m = read("electron/main.js");
  assert.ok(m.includes('ipcMain.handle("tab-sibling-shapefile"') && m.includes('path.extname(String(filePath)).toLowerCase() !== ".tab"') && m.includes('new Set([".shp", ".shx", ".dbf", ".prj", ".cpg"])'));
  assert.ok(read("electron/preload.js").includes('tabSiblingShapefile: (file) => { const filePath = webUtils.getPathForFile(file);'), "the path only from a picked File");
});
