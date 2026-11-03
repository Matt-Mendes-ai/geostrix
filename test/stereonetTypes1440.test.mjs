// TASKS.csv #1440 — core and outcrop picks of the same type are one Stereonet type, counted by source
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { typeKeyOf, typeEntries } from "../src/lib/stereonetTypes.js";

test("the same type text from both sources is one entry, in the core log's spelling", () => {
  const picks = [
    { value: "Bedding" }, { value: "Bedding" }, { value: "Vein" },
    { value: "bedding", outcrop: true }, { value: " BEDDING ", outcrop: true }, { value: "Fault", outcrop: true }, { value: "", outcrop: true },
  ];
  const e = typeEntries(picks);
  assert.deepEqual(e.map((t) => [t.label, t.core, t.outcrop]), [["(unlabeled)", 0, 1], ["Bedding", 2, 2], ["Fault", 0, 1], ["Vein", 1, 0]]);
  assert.equal(typeKeyOf({ value: "  Natural   Fracture " }), "natural fracture");
});

test("outcrop-only types keep the file's own text", () => {
  assert.deepEqual(typeEntries([{ value: "So", outcrop: true }]).map((t) => t.label), ["So"]);
});

test("the dialog filters by key, keeps the type across Source changes, and opens outcrop poles with Both", () => {
  const src = readFileSync(new URL("../src/components/StereonetModal.jsx", import.meta.url), "utf8");
  assert.match(src, /domainScoped\.filter\(\(p\) => typeKeyOf\(p\) === typeFilter\)/);
  assert.doesNotMatch(src, /setSource\(e\.target\.value\); setTypeFilter\("all"\)/);
  assert.match(src, /if \(typeFilter !== "all" && !types\.includes\(typeFilter\)\) setTypeFilter\("all"\)/);
  assert.match(src, /open = both && p\.outcrop/);
  assert.match(src, /"\{type\}: \{core\} core \+ \{outcrop\} outcrop"/);
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /value: r\.type \|\| r\.cls \|\| "structure"/);
  assert.doesNotMatch(vm, /\(outcrop\)`/);
});
