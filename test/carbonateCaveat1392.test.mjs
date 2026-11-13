// TASKS.csv #1392 — Geochem opened on the Alteration Box Plot ('Standard for VMS/epithermal alteration vectoring') for Silvertip's
// carbonate-hosted CRD with no word that it assumes a volcanic protolith. The volcanic diagrams now carry a caveat when most samples are
// calcareous (more than a third of the samples at Ca >= 10 %).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { carbonateShare, VOLCANIC_DIAGRAMS } from "../src/lib/geochem.js";
import { silvertipAssays } from "../src/lib/sampleSilvertip.js";
import { bcSkip, bcText } from "./helpers/bcSample.mjs"; // TASKS.csv #3134 — the BC samples are not in the repository: real-data checks run where one is found

test("carbonateShare: Ca >= 10 % among samples with Ca, in any unit; null without Ca", () => {
  const units = { Ca: "%" };
  assert.equal(carbonateShare([{ values: { Ca: 25 } }, { values: { Ca: 3 } }, { values: { Ca: 30 } }, { values: {} }], units), 2 / 3);
  assert.equal(carbonateShare([{ values: { Ca: 120000 } }, { values: { Ca: 50000 } }], { Ca: "ppm" }), 0.5);
  assert.equal(carbonateShare([{ values: { Cu: 4 } }], units), null);
});

test("a volcanic suite is not calcareous; the box plot and Winchester-Floyd are the volcanic diagrams", () => {
  assert.ok(carbonateShare(Array.from({ length: 50 }, (_, i) => ({ values: { Ca: 2 + (i % 6) } })), { Ca: "%" }) === 0);
  assert.ok(VOLCANIC_DIAGRAMS.includes("boxplot") && VOLCANIC_DIAGRAMS.includes("winchester"));
});

test("Silvertip's assays are mostly calcareous", { skip: bcSkip("silvertip") }, () => {
  const { rows, elements } = silvertipAssays(bcText("silvertip", "assays.csv"));
  const units = Object.fromEntries(elements.map((e) => [e.symbol, e.unit]));
  const share = carbonateShare(rows, units);
  assert.ok(share > 1 / 3, String(share)); // 47 % of the assays
});

test("the note shows under the caption and travels with the exported figure", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const carbonateNote = VOLCANIC_DIAGRAMS\.includes\(diagramId\) && carbShare != null && carbShare > 1 \/ 3/);
  assert.match(g, /\{carbonateNote && <div /);
  assert.match(g, /caption: \(carbonateNote \? `\$\{carbonateNote\} ` : ""\) \+ (\(volcanicNote \? `\$\{volcanicNote\} ` : ""\) \/\* #2911 \*\/ \+ )?\(pdx\.length/); // #2911 adds the volcanic note beside it
});
