// TASKS.csv #1821 / #1811 (review #1646, Kodiak) — a surface sample's tooltip and Identify lead with what it is coloured by; a block
// model's Identify names its property
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orderedElements, mappedOfSample, surfaceSampleTip, sampleIdentifyFields } from "../src/lib/viewer/sampleTip.js";

// a rock chip with 49 elements in the lab's alphabetical order (Ag first), coloured by Cu
const ELEMS = "Ag Al As Au B Ba Be Bi Ca Cd Ce Co Cr Cs Cu Fe Ga Ge Hf Hg In K La Li Mg Mn Mo Na Nb Ni P Pb Rb Re S Sb Sc Se Sn Sr Ta Te Th Ti Tl U V W Zn".split(" ");
const values = Object.fromEntries(ELEMS.map((s, i) => [s, s === "Cu" ? 1295 : s === "Ag" ? 0.93 : i + 0.5]));
const row = { sample_id: "222229", medium: "rock chip", x: 684100.4, y: 5511200.6, z: 1600, values, attrs: { Lithology: "GAB", Alteration: "chl-ep", Description: "fine-grained gabbro with py" } };
const units = { Cu: "ppm", Ag: "ppm", Au: "ppb" };
const an = { mode: "element", classOf: Int8Array.from([2]), isolated: Uint8Array.from([0]), classes: [{ label: "below the 75th percentile" }, { label: "75th percentile to the threshold" }, { label: "at or above the threshold (anomalous)" }], values: Float64Array.from([1295]) };

test("#1821 the key elements come first, then the file's order", () => {
  const o = orderedElements(values);
  assert.deepEqual(o.slice(0, 6), ["Cu", "Au", "Ag", "Zn", "Pb", "Mo"]);
  assert.equal(o.length, 49);
  assert.deepEqual(orderedElements(values, ["Te"]).slice(0, 2), ["Te", "Cu"]);
});

test("#1821 the tooltip: id and medium, the coloured element and its class, 8 key elements, '+n more', the coordinates: 13 lines, not 52", () => {
  const mapped = mappedOfSample(an, { mode: "element", symbol: "Cu" }, 0, units);
  assert.deepEqual([mapped.sym, mapped.label, mapped.value, mapped.cls], ["Cu", "Cu (ppm)", 1295, "at or above the threshold (anomalous)"]);
  const lines = surfaceSampleTip(row, { units, mapped }).split("\n");
  assert.equal(lines[0], "Surface sample 222229 (rock chip)");
  assert.equal(lines[1], "Cu (ppm): 1,295");
  assert.equal(lines[2], "at or above the threshold (anomalous)");
  assert.deepEqual(lines.slice(3, 6), ["Au: 3.5ppb", "Ag: 0.93ppm", "Zn: 48.5ppm"]);
  assert.equal(lines[11], "+40 more elements (Identify lists them all)");
  assert.equal(lines.length, 13);
  assert.match(lines[12], /^684100E 5511201N 1600Z$/);
  // coloured by medium: no mapped lines
  assert.equal(surfaceSampleTip(row, { units }).split("\n")[1], "Cu: 1295ppm");
});

test("#1821 Identify: the coloured element and class, all 49 elements, the sample's own fields", () => {
  const mapped = mappedOfSample(an, { mode: "element", symbol: "Cu" }, 0, units);
  const f = sampleIdentifyFields(row, mapped, units);
  assert.deepEqual(f[0], ["Cu (ppm)", "1,295"]);
  assert.deepEqual(f[1], ["Class", "at or above the threshold (anomalous)"]);
  assert.equal(f.filter(([k]) => ELEMS.includes(k)).length, 48, "every other element");
  assert.ok(f.some(([k]) => k === "Mo") && f.some(([k]) => k === "Pb") && f.some(([k]) => k === "Zn"));
  assert.deepEqual(f.slice(-3), [["Lithology", "GAB"], ["Alteration", "chl-ep"], ["Description", "fine-grained gabbro with py"]]);
  assert.equal(mappedOfSample(null, null, 0), null);
});

test("#1811 / #1821 wiring: a block model's value row is its property; samples carry what they are coloured by; the tooltip stays on screen", () => {
  const id = readFileSync(new URL("../src/lib/viewer/identify.js", import.meta.url), "utf8");
  assert.ok(id.includes('fields.push([m.property || tr("Value"), m.valueLabels?.[c.value] ?? (Number.isFinite(c.value) ? num(+c.value.toPrecision(4), 6) : String(c.value))]);'));
  assert.ok(id.includes("sampleIdentifyFields(row, o.userData.mapped, o.userData.units)"));
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(vm.includes("mesh.userData = sampleUserData(row, mapped, surfaceElementUnits);")); // #1500: the same row / mapped / units, the tip made when read
  assert.ok(vm.includes("Math.min(t.x + 14, innerWidth - w - 8)"));
});
