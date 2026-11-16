// TASKS.csv #3862 (Scottie Gold review) — Atlas 'One page per section' made pages named for the section holding a title, a north arrow, a bar and the credit: no picture of the section, and
// nothing said so. Until the mode draws the section, it is named for what it does and says so in the dialog and the result.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("the section mode says it adds a name only, in its label, a standing line and the result", () => {
  const m = read("../src/components/GenerateAtlasModal.jsx");
  assert.match(m, /One page per section \(\{sections\}\): its name only, no drawing/);
  assert.match(m, /mode === "section" && <div[^>]*>\{tr\("A section page takes the section's name in the page's text: the section itself is not drawn on it\./);
  assert.match(m, /\(mode === "section" \? " " \+ tr\("No section drawing was added: only its name\."\) : ""\)/);
  for (const l of ["es", "pt", "fr", "ar"]) for (const k of ["One page per section ({sections}): its name only, no drawing", "No section drawing was added: only its name."]) assert.ok(JSON.parse(read(`../src/locales/${l}.json`))[k], `${l} ${k}`);
});
