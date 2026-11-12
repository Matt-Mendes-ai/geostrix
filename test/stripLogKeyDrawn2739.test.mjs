// TASKS.csv #2739 (#2612) — a strip log sent to Layout draws its colour key in the image; it now says so (keyDrawn), so Layout can skip
// adding a second, separate legend. Also: its caption date is the local day, not the UTC one.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#2739 the strip log's Layout send flags the drawn key; the caption date is local", () => {
  const s = readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");
  assert.match(s, /keyDrawn: legendItems\.length > 0/);
  assert.match(s, /date: localDate\(\)/);
  assert.ok(!s.includes("new Date().toISOString().slice(0, 10)"));
});
