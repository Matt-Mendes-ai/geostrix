// TASKS.csv #1641 — a strip log sent with a depth range names it; a send closes the window and its advice goes to Layout as a notice.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
// v0.1.103 release CI: the Windows runner checks the sources out with CRLF, so the text pins compare LF text
const readLf = (p, enc) => fs.readFileSync(p, enc).replace(/\r\n/g, "\n");

test("label with the range; close on a clean send", () => {
  const s = readLf("src/components/StripLog.jsx", "utf8");
  assert.match(s, /const rangeText = ranged \? `, \$\{Number\(d0\.toFixed\(1\)\)\}-\$\{Number\(d1\.toFixed\(1\)\)\} m` : "";/);
  assert.match(s, /label: `Strip log — \$\{holeId\}\$\{rangeText\}`/);
  assert.match(s, /onAdvice\?\.\(advice\);\n    onClose\?\.\(\);/);
  assert.match(readLf("src/modules/ViewerModule.jsx", "utf8"), /onAdvice=\{\(t\) => t && setNotices\(\(p\) => \[\.\.\.p, t\]\)\}/);
});
