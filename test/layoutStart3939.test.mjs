// TASKS.csv #3939 — Layout's first screen: while the page holds only a new page's starter elements, a card over the page makes a whole sheet in one
// click, as the ribbon's Sheets group does. It must say what the ribbon says, never sit on the printed page, and know the starter elements.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DEFAULT_LAYOUT_ELEMENTS } from "../src/lib/projectFields.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const m = read("../src/modules/LayoutModule.jsx");

test("#3939 the card's four sheets say what the ribbon's Sheets group says, with the same conditions", () => {
  const card = m.slice(m.indexOf("<LayoutStartCard "), m.indexOf("]} />", m.indexOf("<LayoutStartCard ")));
  const ribbon = m.slice(m.indexOf('<RibbonGroup label="Sheets">'), m.indexOf('<RibbonGroup label="Insert">'));
  for (const label of ["Plan map", "Cross-section", "Hole log", "Intercepts table"]) {
    const r = ribbon.match(new RegExp(`label="${label}" tone="output" disabled=\\{([^}]+\\}?)\\} disabledReason="([^"]+)" title="([^"]+)"`));
    assert.ok(r, `ribbon: ${label}`);
    const c = card.match(new RegExp(`label: "${label}", disabled: ([^,]+(?:\\|\\| \\[\\]\\)\\.length)?), reason: "([^"]+)", title: "([^"]+)"`));
    assert.ok(c, `card: ${label}`);
    assert.equal(c[1].replace(/\s+/g, " "), r[1].replace(/\s+/g, " "), `${label}: the same condition`);
    assert.equal(c[2], r[2], `${label}: the same reason`);
    assert.equal(c[3], r[3], `${label}: the same title`);
  }
  assert.match(card, /onMake=\{\(k\) => makeSheet\(k\)\}/);
});

test("#3939 the card is over the page, never on it (so never printed), and shows only on a starter page", () => {
  const area = m.indexOf('<div dir="ltr" ref={areaRef}'), cardAt = m.indexOf("<LayoutStartCard "), page = m.indexOf("ref={pageRef}");
  assert.ok(area > 0 && area < cardAt && cardAt < page, "inside the scroll area, before the page");
  assert.match(m, /!startCardClosed && elements\.every\(\(el\) => LAYOUT_STARTER_IDS\.has\(el\.id\)\)/);
  const ids = m.match(/const LAYOUT_STARTER_IDS = new Set\(\[([^\]]+)\]\);/)[1].match(/"([^"]+)"/g).map((x) => x.slice(1, -1));
  assert.deepEqual(ids.sort(), DEFAULT_LAYOUT_ELEMENTS.map((e) => e.id).sort(), "the starter elements of a new page");
});

test("#3939 the card's drawing: tokens only, no SVG text, translated words", () => {
  const c = read("../src/components/LayoutStartCard.jsx");
  assert.doesNotMatch(c, /["'`]#[0-9a-fA-F]{3,6}\b/);
  assert.doesNotMatch(c, /<text\b/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["A sheet in one click", "Or start from the 3D view:", "Current view", "Plan map", "Cross-section", "Hole log", "Intercepts table", "Import collars or plan a hole first"]) assert.ok(d[k], `${lang}: ${k}`);
  }
});
