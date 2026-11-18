// TASKS.csv #3916 — the release notes' "·" separators arrived on GitHub as "Â·": scripts/sign-release.ps1 (read as ANSI by Windows PowerShell
// 5.1, no BOM) builds the dot from its code point and hands gh the notes in a UTF-8 file (--notes-file), not on the command line. Source test only:
// the script is never run here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const s = readFileSync(new URL("../scripts/sign-release.ps1", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3916 the notes go to gh through a UTF-8 file, with the dot built from its code point", () => {
  const notes = s.split("\n").find((l) => l.startsWith('$notes = "Download'));
  assert.ok(notes, "the notes line");
  assert.doesNotMatch(notes, /[^\x00-\x7F]/, "no character outside ASCII in the notes line (an ANSI read would mangle it)");
  assert.match(notes, /\$dot/);
  assert.match(s, /\$dot = \[char\]0x00B7\n\$notes = /);
  assert.match(s, /\[System\.IO\.File\]::WriteAllText\(\$notesFile, \$notes, \(New-Object System\.Text\.UTF8Encoding \$false\)\)/);
  assert.match(s, /gh release create \$Tag --repo \$repo --title \$Tag --notes-file \$notesFile --draft --verify-tag/);
  assert.doesNotMatch(s, /--notes \$notes/);
});
