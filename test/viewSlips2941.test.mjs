// TASKS.csv #2941 (review #2876, WA iron) — small slips in the 3D View: the Hole labels select cut its longest option, the hole filter's
// example ids came from another project, the assay style's 'Default classes' line stayed after the classes were edited, and the element
// chips looked on while the Assays eye hid them all. (The section end labels in 3D and the wheel zoom's pick are follow-ups.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");

test("the Hole labels row wraps instead of cutting 'Hole ID + total depth'", () => {
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /marginBottom: 10, flexWrap: "wrap" \/\* #2941 \*\/ \}\}>\r?\n\s+<span[^\n]*\{tr\("Hole labels"\)\}/);
  assert.match(v, /style=\{\{ flex: "1 0 auto", minWidth: 0, \/\* #2941/);
});

test("the filter box's examples are this project's first two ids", () => {
  const h = read("../src/modules/viewer/HoleFilterBar.jsx");
  assert.match(h, /ids\.length >= 2 \? tr\("Filter holes… \(\{examples\}\)", \{ examples: `\$\{ids\[0\]\}, \$\{ids\[1\]\}` \}\)/);
  assert.ok(!h.includes("PS-26, GS-21"));
});

test("the default-classes line goes once a class is edited; the chips grey out and the count says why", () => {
  assert.match(read("../src/components/AssayStyleModal.jsx"), /\{\(major \|\| basisText\) && !local\.breaks\.some\(\(b\) => b\.seeded === false\)/);
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /!assayVisible \? tr\("\{n\} chosen, all hidden \(the eye\)", \{ n: assayDisplayElements\.length \}\)/);
  assert.match(v, /opacity: assayVisible \? 1 : 0\.45/);
});

test("rounding or a typed limit clears the seeded flag the line reads", async () => {
  const { roundBreaks, addClassLimit } = await import("../src/lib/assayClasses.js");
  const seeded = [{ max: 1.2345, color: "#111", seeded: true }, { max: 5.4321, color: "#222", seeded: true }];
  assert.ok(roundBreaks(seeded).some((b) => b.seeded === false));
  assert.ok(addClassLimit(seeded, 3, "#333").some((b) => b.seeded === false));
});
