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
