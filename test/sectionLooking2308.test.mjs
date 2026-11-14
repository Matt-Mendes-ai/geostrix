// TASKS.csv #2308 (review #2174, WA gold) — a section's title and caption gave the line's azimuth only ('Azimuth 272°'), ambiguous by 180°.
// The caption and the snapshot's Layout label now say the side the section is seen from ('looking S2°W'), as Layout's north-arrow
// replacement does (#1489: the start is drawn on the left, so the reader faces the azimuth - 90°).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bearingText, sectionLookText } from "../src/lib/layoutLinks.js";

test("the review's section: a line at azimuth 272° (start at its east end, drawn on the left) is seen looking S2°W", () => {
  assert.equal(sectionLookText(272), "Looking S2°W");
  assert.equal(bearingText(272 - 90), "S2°W");
});

test("the bearing of a few azimuths", () => {
  assert.equal(bearingText(90 - 90), "N");
  assert.equal(bearingText(46 - 90), "N44°W");
  assert.equal(bearingText(121 - 90), "N31°E");
});

test("wiring: the caption and the snapshot label", () => {
  const w = fs.readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(w, /import \{ bearingText, sectionLookText \} from "\.\.\/lib\/layoutLinks\.js";/);
  assert.match(w, /tr\("Azimuth \{v\}° · looking \{look\} · \{v2\}\{v3\} · elevation in m", \{ v: azDeg\.toFixed\(0\), look: bearingText\(azDeg - 90\),/);
  assert.match(w, /label: `\$\{data\?\.title \|\| "Cross-section"\}\$\{data\?\.section \? ` · \$\{sectionLookText\(/);
});
