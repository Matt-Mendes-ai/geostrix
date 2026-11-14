// TASKS.csv #3280 (Galore review) — small slips met in the 3D View. Synthetic or source checks only, not Galore.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("(2) the section header counts are singular or plural, and an offset rounds before its sign ('-0…+6 m' was printed)", () => {
  const w = src("../src/components/SectionWindow.jsx");
  assert.match(w, /v: countText\(data\.holes\?\.length, "\{n\} hole", "\{n\} holes"\)/);
  const m = w.match(/const signedM = (\(v\) => \{[^\n]*\});/);
  const signedM = new Function(`return ${m[1]}`)();
  assert.deepEqual([-0.3, 0.2, 5.6, -4.5, -12.2].map(signedM), ["0", "0", "+6", "-4", "-12"]);
  assert.match(w, /`\$\{signedM\(h\.minOffset\)\}…\$\{signedM\(h\.maxOffset\)\} m`/);
});

test("(11) the Holes list by hole id, numbers as numbers, sorted once for the same holes", async () => {
  const s = src("../src/modules/viewer/ViewerParts.jsx");
  assert.match(s, /export function HoleRowList\(\{ holes: given,[^\n]*\n\s+const holes = holesById\(given\);/);
  const body = s.match(/const ID_ORDER = [^\n]+\n(export function holesById[\s\S]*?\n\})/);
  const ID = s.match(/const ID_ORDER = (new Intl\.Collator\([^)]*\))/)[1];
  const holesById = new Function(`const ID_ORDER = ${ID}, idSorted = { src: [], out: [] }; ${body[1].replace("export ", "")}; return holesById;`)();
  const file = ["PD23-012", "PD23-002", "CC23-001", "GC23-0976", "GC23-976A", "GC23-0081", "pd23-010"].map((hole_id) => ({ hole_id }));
  const a = holesById(file);
  assert.deepEqual(a.map((h) => h.hole_id), ["CC23-001", "GC23-0081", "GC23-0976", "GC23-976A", "PD23-002", "pd23-010", "PD23-012"]);
  assert.equal(holesById(file.slice()), a, "the same holes in the same order: the kept array");
  assert.notEqual(holesById(file.slice(1)), a);
});

test("(4) (5) (6) the 'Also show' units as the Element menu's, the 3D menu's tooltip row capped, the style controls fit their dialogs", () => {
  assert.match(src("../src/components/BestIntercepts.jsx"), /<option key=\{s\} value=\{s\}>\{`\$\{s\} \(\$\{gradeUnitLabel\(s, elementUnits\[s\]\)\}\)`\}<\/option>\)\}\{\/\* #3280 \(4\)/);
  assert.match(src("../src/modules/ViewerModule.jsx"), /whiteSpace: "pre-line", maxWidth: 360, overflowWrap: "anywhere", borderBottom: "1px solid var\(--color-border\)", marginBottom: 4 \}\}>\{contextMenu\.hit\.tip\}<\/div>/);
  assert.match(src("../src/components/AssayStyleModal.jsx"), /aria-label=\{tr\("Marker shape"\)\} style=\{\{ \.\.\.inp, flex: 1, minWidth: 0 \}\}>/);
  assert.match(src("../src/components/LayerStyleModal.jsx"), /aria-label=\{tr\("Number of colour classes"\)\} style=\{\{ width: 64, padding: "2px 4px" \}\} \/>/);
});
