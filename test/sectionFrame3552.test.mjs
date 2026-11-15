// TASKS.csv #3552 (Fireweed rehearsal, Macpass) — a hole collared past a section line's end, drilling back into the slab: its collar dot, name and
// leader were drawn outside the plot frame, over the elevation labels, and printed on the Layout sheet. The label is anchored at the hole's first
// point inside the frame and says how far beyond the end the collar is; the labels stay within the frame's width, at their drawn width (a canvas
// measures it in the section's font). Live (Section through TU009): TS058 / TS054 / TS18-004 / TS18-010 inside the frame, nothing outside it (was
// four names and dots in the margins, and TS041 2-4 px past the frame).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placeLabels, labelWidth } from "../src/lib/sectionLabels.js";

test("placeLabels keeps a label inside the bounds at the width widthOf gives", () => {
  const items = [{ key: "a", text: "TS041", ax: 40, ay: 200, dir: -1 }, { key: "b", text: "TS18-004 (collar 77 m beyond the right end)", ax: 1060, ay: 300, dir: -1 }];
  const wide = (t) => labelWidth(t, 9) + 20; // a font wider than the estimate
  const L = placeLabels(items, { fontSize: 9, bounds: [60, 1040], widthOf: wide });
  for (const b of L) {
    assert.equal(b.w, wide(b.text));
    assert.ok(b.x - b.w / 2 >= 60 - 1e-9 && b.x + b.w / 2 <= 1040 + 1e-9, `${b.text} at ${b.x - b.w / 2}..${b.x + b.w / 2}`);
  }
  const est = placeLabels(items, { fontSize: 9, bounds: [60, 1040] }); // no widthOf: the estimate, as before
  assert.equal(est[0].w, labelWidth("TS041", 9));
});

test("the section: labels anchored inside the frame, the collar's distance beyond the end, the frame's width as the bounds", () => {
  const s = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /const firstIn = t\.find\(\(q\) => inPlot\(at\(q\)\)\), lastIn = firstIn \? \[\.\.\.t\]\.reverse\(\)\.find\(\(q\) => inPlot\(at\(q\)\)\) : null;\n\s+if \(!firstIn\) return;/);
  assert.match(s, /tr\("\{hole\} \(collar \{m\} m beyond the left end\)"/);
  assert.match(s, /tr\("\{hole\} \(collar \{m\} m beyond the right end\)"/);
  assert.match(s, /ax: at\(firstIn\)\[0\], ay: at\(firstIn\)\[1\], dir: -1/);
  assert.match(s, /ax: at\(lastIn\)\[0\], ay: at\(lastIn\)\[1\], dir: 1/);
  assert.match(s, /placeLabels\(items, \{ fontSize: fs\(9\), bounds: \[PAD, W - PAD\]/);
  assert.match(s, /widthOf: measureLabel\(fs\(9\), textFont\) \/\* #3552 \*\//);
  assert.match(s, /w = Math\.ceil\(measureCtx\.measureText\(String\(text\)\)\.width\) \+ 8;/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(j["{hole} (collar {m} m beyond the left end)"]?.includes("{m}") && j["{hole} (collar {m} m beyond the right end)"]?.includes("{hole}"), l);
  }
});
