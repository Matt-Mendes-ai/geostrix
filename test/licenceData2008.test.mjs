// TASKS.csv #2008 — the FGDC lithology patterns that ship in public/patterns/fgdc are named in Help > Third-party licences.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bundledData } from "../scripts/third-party-licenses.mjs";

test("the bundled pattern tiles are listed with their CC0 text", () => {
  const d = bundledData();
  assert.equal(d.length, 1);
  assert.match(d[0].name, /^FGDC lithology patterns/);
  assert.equal(d[0].license, "CC0-1.0 (public domain)");
  assert.match(d[0].text, /FGDC-STD-013-2006/);
  assert.match(d[0].text, /Creative\s+Commons CC0/);
  assert.match(fs.readFileSync("src/components/LicensesModal.jsx", "utf8"), /bundled\.map\(\(p\) => row\("data", p\)\)/);
});
