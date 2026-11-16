// TASKS.csv #3713 (the strip-log sheet's key), #3714 (company / author typed once), #3716 (small slips: 3, 4, 7, 8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sharedTitleRows, newTitleBlock, defaultTitleBlockRows } from "../src/lib/layoutTitleBlock.js";
import { tieStarterFurniture, LOOK_SHIFT } from "../src/lib/layoutLinks.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const hasKey = (k) => { for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 50)}`); };

test("#3714 a new title block starts with the Company and Drawn by of the first one that has them; Title and Figure stay per page", () => {
  const pages = [
    { elements: [{ type: "titleblock", rows: [["Title", "Plan"], ["Company", "Acme Ltd"], ["Figure", "1"], ["Drawn by", "  "]] }] },
    { elements: [{ type: "titleblock", rows: [["Company", "Other"], ["Drawn by", "M. Mendes"]] }] },
  ];
  const shared = sharedTitleRows(pages);
  assert.deepEqual(shared, { Company: "Acme Ltd", "Drawn by": "M. Mendes" }); // each from the first page that holds a value
  const tb = newTitleBlock("x", 0, 0, { shared });
  const row = (l) => tb.rows.find((r) => r[0] === l)[1];
  assert.equal(row("Company"), "Acme Ltd"); assert.equal(row("Drawn by"), "M. Mendes");
  assert.equal(row("Title"), ""); assert.equal(row("Figure"), "");
  assert.equal(defaultTitleBlockRows().find((r) => r[0] === "Company")[1], ""); // no document, no invention (#264)
  assert.deepEqual(sharedTitleRows([{ elements: [{ type: "titleblock", rows: [["Company", "{project}"]] }] }]), {}); // a placeholder is not a company
});

test("#3714 wired: the Add title block button and the stock templates take the document's rows", () => {
  const l = read("../src/modules/LayoutModule.jsx");
  assert.match(l, /shared: sharedTitleRows\(layoutPages\.map\(\(pg\) => \(pg\.id === activeLayoutPageId \? \{ \.\.\.pg, elements \} : pg\)\)\)/);
  assert.match(l, /shared: sharedTitleRows\(layoutPages\) \/\* #3714 \*\//);
});

test("#3713 the strip-log figure carries a key for its hatched density bars", () => {
  const s = read("../src/components/StripLog.jsx");
  assert.match(s, /const keyH = hasCalc \? 34 : 0;/);
  assert.match(s, /\{hasCalc && \(\(\) => \{ const y0 = sy\(d1\) \+ 26/);
  assert.match(s, /tr\("hatched = calculated \(regression\)"\)/);
  assert.match(s, /\{hasMeasured && /);
  assert.match(s, /height=\{H \+ keyH\}/); assert.match(s, /h: H \+ keyH/);
  hasKey("hatched = calculated (regression)"); hasKey("solid = measured");
});

test("#3716 (7) 'Looking N' ends a page margin (40 px) inside the arrow's right edge, not 23 px", () => {
  assert.equal(LOOK_SHIFT, 77);
  const north = { id: "north", type: "north", x: 1000, y: 40 };
  const view = { id: "img1", type: "image", sectionAzimuth: 115, x: 100, y: 100, w: 600, h: 400, worldWidthAtCaptureM: 1000 };
  const look = tieStarterFurniture([north, view], view).find((e) => e.id === "look_img1");
  assert.equal(look.x, 923); assert.equal(look.x + look.w, 1083); // the arrow's own box ends at x + 100: the label ends 17 px short of it (it was 60 px left of the arrow, 23 px from a page's edge)
});

test("#3716 (3) the collar table's 'Holes containing' gives the same space hint as the drill plan's", () => {
  const l = read("../src/modules/LayoutModule.jsx");
  assert.equal((l.match(/A space ends a term: did you mean \{term\}\?/g) || []).length, 2);
});

test("#3716 (4) a cut-off typed for one element is dropped when the element changes", () => {
  const c = read("../src/components/DrillPlanColourControls.jsx");
  assert.match(c, /\.\.\.\(kind === "bi" && e\.target\.value !== key \? \{ biCutoff: undefined \} : \{\}\)/);
});

test("#3716 (8) Undrilled zones' open-mesh note names the Grade shell's Close shell artificially box", () => {
  const u = read("../src/components/UndrilledZonesPane.jsx");
  assert.match(u, /tick \\"Close shell artificially at the search-radius boundary\\" in the Grade shell pane and run it again/);
  const m = u.match(/const OPEN_ROUTE = "(.*)";/)[1].replace(/\\"/g, '"');
  hasKey(m);
});
