// TASKS.csv #3661 (reopened, round 3) — at 1,366 px every status-bar item but the credit wrapped and the project name was cut. Now each item is one line at its own width; the credit gives way first (down to 8 em,
// ellipsis, tooltip), then the project name (ellipsis, tooltip). Measured in an Electron window with this stylesheet and the bar's markup at 1,920, 1,366 and 1,280 px: every item one line (12 px high) in the 26 px bar.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("the status bar's items do not wrap; the credit and the name give way", () => {
  const css = read("../src/styles/app.css");
  assert.match(css, /\.ge-status > \* \{ flex-shrink: 0; white-space: nowrap; \}/);
  assert.match(css, /\.ge-status > \.ge-credit \{ flex-shrink: 1; min-width: 8em; \}/);
  assert.match(css, /\.ge-status > \.ge-status-name \{ flex-shrink: 2; min-width: 6em; max-width: 30vw; overflow: hidden; text-overflow: ellipsis; \}/);
  assert.match(css, /\.ge-status \.ge-credit \{ flex: 0 1 auto; min-width: 8em; max-width: min\(26vw, 420px\);/);
  assert.match(read("../src/App.jsx"), /<span className="ge-status-name" title=\{project\.name \|\| undefined\}>/);
});
