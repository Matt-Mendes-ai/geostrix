// TASKS.csv #3054 (the rest of #2387, WA uranium review) — the section window's Draw button names what is drawn and what is
// missing, and a step (‹ › / ± buffer) keeps 'What to draw' and the body / fault / string name, as it keeps the VE (#2933).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const s = fs.readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");

test("the Draw button's tip, per kind: what is missing, then what will be drawn", () => {
  const i = s.indexOf("const drawTip = (kind, pick, name, explicit) => {");
  assert.ok(i > 0);
  const f = s.slice(i, s.indexOf("};", i));
  assert.match(f, /kind === "outline" \? tr\("Type a body name first"\)/);
  assert.match(f, /tr\("Type a fault name first"\)/);
  assert.match(f, /tr\("Pick a unit first"\)/, "a contact still asks for a unit");
  assert.match(f, /if \(kind === "outline"\) return tr\("Draw the outline of \{name\}", \{ name \}\);/);
  assert.match(f, /tr\("Draw \{unitPick\}'s upper contact", \{ unitPick: name \}\)/, "only a contact speaks of an upper contact");
  assert.match(s, /title=\{drawTip\(kindPick, unitPick, pickName, pickExplicit\)\}>/);
  assert.ok(!s.includes('tr("Pick a unit first")}>'), "the old one-for-all tip is gone");
});

test("a step hands the next section its VE, 'What to draw' and a body / fault / string name (not a unit, which may not be there)", () => {
  assert.match(s, /if \(!msg\.refresh\) stepVE = \{ ve: vExag, kind: kindPick, unit: unitPick, at: Date\.now\(\) \};/);
  assert.match(s, /const \[kindPick, setKindPick\] = useState\(\(\) => handed\?\.kind \|\| "contact"\);/);
  assert.match(s, /const \[unitPick, setUnitPick\] = useState\(\(\) => \(handed\?\.kind && handed\.kind !== "contact" \? handed\.unit \|\| "" : ""\)\);/);
  assert.ok(s.indexOf("const [handed]") < s.indexOf("const [unitPick"), "the hand-over is read before the picks");
});
