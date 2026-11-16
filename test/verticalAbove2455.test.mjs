// TASKS.csv #2455 — on a surface project a vertical hole above the target, not the nearest pads; the list stays for underground collars
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the form offers the vertical hole off underground projects and keeps the nearest-collars list for underground ones", () => {
  const p = fs.readFileSync("src/components/PlannedHoleParts.jsx", "utf8");
  assert.match(p, /\{targetReady && !underground && ground && \(\(\) => \{/); // #3818: the Elev judged inside (judgedCollarZ)
  assert.match(p, /azimuth: 0, dip: -90 \}\)/); assert.match(p, /length: Math\.round\(\(depth \+ PAST_TARGET_M\) \* 10\) \/ 10/); // #3818: the E / N / Az / Dip of the target, the Elev and length as judged
  assert.match(p, /\{nearest\.length > 0 && collars\.length > 1 && underground && \(/);
  assert.match(p, /n\.dip < 0 && isShallowDip\(n\.dip\) \? "var\(--color-warn-text\)"/);
});
