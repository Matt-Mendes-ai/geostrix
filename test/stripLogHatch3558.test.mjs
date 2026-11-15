// TASKS.csv #3558 follow-up (Fireweed rehearsal, #3597 notes) — a density bar whose value was calculated (not measured) is paler with a dashed edge; it also carries a diagonal hatch, so it reads in a
// black-and-white print and to a colour-blind reader. The pinned attributes of the bar itself stay.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s = fs.readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("the calculated bar keeps its pale dashed look and gains a hatch overlay of the same width", () => {
  assert.match(s, /opacity=\{calc \? 0\.3 : 0\.75\} stroke=\{calc \? "#4a9be0" : undefined\} strokeDasharray=\{calc \? "2 1\.5" : undefined\}/);
  assert.match(s, /<pattern id="sl-calc-hatch"[^>]*patternTransform="rotate\(45\)"/);
  // #3660 — ONE hatch rect per track, clipped to the calculated bars (a rect per interval wrote a pattern picture per interval into the PDF)
  assert.match(s, /<clipPath id=\{cid\}>\{calcRows\.map/); assert.match(s, /fill="url\(#sl-calc-hatch\)" opacity="0\.6" clipPath=\{`url\(#\$\{cid\}\)`\}/); assert.equal((s.match(/url\(#sl-calc-hatch\)/g) || []).length, 1, "one use of the pattern per track, not one per interval");
});
