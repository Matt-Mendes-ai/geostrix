// TASKS.csv #1542 — a run's messages stay readable in full: Recent messages shows all / copies, the pane notice lists every line
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Recent messages: the last 6, or all of them, and Copy", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const \[allNotices, setAllNotices\] = useState\(false\);/);
  assert.match(v, /notices\.slice\(allNotices \? -500 : -6\)/);
  assert.match(v, /copyText\(notices\.map\(noticeText\)\.join\(/);
});

test("the pane notice can list every message since the pane opened", () => {
  const r = readFileSync(new URL("../src/components/Ribbon.jsx", import.meta.url), "utf8");
  assert.match(r, /all \? notices\.slice\(from\)\.map\(/);
  assert.match(r, /count > 1 && <span role="button"/);
});

test("Check relationships pushes one notice with the count and every violation", async () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /appendNotice\(notice\("Topology check found \{violations\} violation\(s\) in \{checked\} check\(s\):"/);
  const { notice, appendNotice, noticeText } = await import("../src/lib/notices.js");
  const n = appendNotice(notice("Topology check found {violations} violation(s) in {checked} check(s):", { violations: 2, checked: 5 }), [" • A folds back", " • B crosses C"].join(""));
  assert.equal(noticeText(n), "Topology check found 2 violation(s) in 5 check(s): • A folds back • B crosses C");
});
