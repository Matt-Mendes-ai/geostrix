// TASKS.csv #3939 — the 3D View's empty card, pictures first (Matt's worked example): the diagram, three short lines, the rest behind a closed More.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { wordsOf } from "../scripts/word-count.mjs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3939 the card: the diagram first, three lines of about 45 words in view, the detail behind a closed More", () => {
  const b = read("../src/modules/viewer/EmptyViewerBody.jsx");
  const view = b.slice(b.indexOf("<DropDiagram picture=\"holes\""));
  const before = view.slice(view.indexOf("/>"), view.indexOf("<MoreFold"));
  assert.ok(view.length && b.indexOf("<DropDiagram picture=\"holes\"") < b.indexOf("Drag a collar file"), "the picture comes first");
  const seen = [...before.matchAll(/\bt[rx]\("([^"]+)"/g)].map((m) => m[1]).filter((s) => !/^(Collars|Geochem)$/.test(s));
  assert.deepEqual(seen, [
    "Drag a collar file onto this view, or click {collars} in the left panel.",
    "A collar file needs a hole ID and x, y, z. Columns are matched for you, and you're asked if anything is unclear.",
    "Then add surveys, lithology and other logs. Assays go in the {geochem} tab.",
  ]);
  const n = seen.reduce((a, s) => a + wordsOf(s), 0) + wordsOf("Drill holes in 3D");
  assert.ok(n <= 55, `${n} words in view`);
  assert.match(view, /<MoreFold data-empty-more="" style=/, "More starts closed (no open attribute)");
  assert.doesNotMatch(read("../src/components/MoreFold.jsx"), /\bopen\b/);
  assert.match(view, /Coordinates are reprojected to the project CRS on import\./, "the CRS note is kept, behind More");
  assert.ok(read("../src/modules/ViewerModule.jsx").includes(': tr("Drill holes in 3D")}'), "the headline");
});

test("#3939 the diagram: tokens only, text in the size tokens (no px font sizes), every word HTML, labels translated", () => {
  const d = read("../src/components/DropDiagram.jsx");
  assert.doesNotMatch(d, /["'`]#[0-9a-fA-F]{3,6}\b/, "colours are tokens");
  assert.doesNotMatch(d, /fontSize:\s*\d/, "font sizes are tokens");
  assert.doesNotMatch(d, /<text\b/, "no SVG text: every word is HTML at a token size, so never under the 10 px step");
  assert.match(d, /dir="ltr"/);
  // the labels each card hands it are translated
  const users = ["../src/modules/viewer/EmptyViewerBody.jsx", "../src/modules/GeochemModule.jsx", "../src/modules/GeophysicsModule.jsx", "../src/modules/MapsModule.jsx"].map(read); // #3948: Maps' card, not RasterModule's (never shown, deleted)
  const keys = users.flatMap((u) => [...u.matchAll(/<DropDiagram[\s\S]*?\/>/g)].flatMap((m) => [...m[0].matchAll(/tr\("([^"]+)"\)/g)].map((k) => k[1])));
  assert.ok(keys.includes("Drag your collar file here to start.") && keys.includes("Drop your collar file here") && keys.includes("Your file needs these four columns"));
  assert.ok(users.every((u) => /<DropDiagram /.test(u)), "every empty card opens with its picture");
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const loc = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of keys) assert.ok(loc[k], `${lang}: ${k}`);
  }
});
