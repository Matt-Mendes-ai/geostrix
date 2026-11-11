// TASKS.csv #2078 — a non-EDI file picked in MT / AMT 'Import EDI files…' was dropped without a word
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("files that are not .edi are named, alone or beside EDI files", () => {
  const src = readFileSync(new URL("../src/components/MtSoundingsPane.jsx", import.meta.url), "utf8");
  const i = src.indexOf("const importEdi = async (fileList) => {"), body = src.slice(i, i + 6000);
  assert.match(body, /tr\("Not EDI files, not read here: \{names\}\. MT \/ AMT reads \.edi soundings; a DC \/ IP line file \(\.dat, \.txt\) goes to the DC \/ IP pane\."/);
  assert.match(body, /if \(!files\.length\) \{ if \(othersNote\) setMsg\(\{ info: false, text: othersNote \}\); return; \}/);
  assert.match(body, /othersNote, \/\/ #2078/);
});
