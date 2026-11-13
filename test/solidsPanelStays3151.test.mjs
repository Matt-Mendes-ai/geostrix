// TASKS.csv #3151 (#2928 (4)) — 'Solid blocks from surfaces' kept closing its panel after Build, so the result (volumes, crossing columns) was
// only in the message list. The panel stays open and shows the same lines the notices carry.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
const p = fs.readFileSync(new URL("../src/components/SurfaceSolidsPanel.jsx", import.meta.url), "utf8");

test("the build no longer closes the panel, and returns its result lines (each also a notice)", () => {
  const i = v.indexOf("const surfaceSolidsBuilt = (lb, sum) => {"), body = v.slice(i, v.indexOf("\n  };", i));
  assert.ok(i > 0);
  assert.ok(!body.includes("setSurfaceSolidsOpen(false)"), "the panel stays open");
  assert.match(body, /const out = \[\], say = \(n\) => \{ out\.push\(n\.text\); setNotices\(\(p\) => \[\.\.\.p, n\]\); \};/);
  assert.match(body, /say\(notice\("Built \{n\} blocks/);
  assert.match(body, /if \(xn\) say\(xn\);/);
  assert.match(body, /return out;\s*$/);
});

test("the panel shows the lines under Build", () => {
  assert.match(p, /const \[result, setResult\] = useState\(null\);/);
  assert.match(p, /setResult\(onBuilt\(\{ block: r\.block, units,/);
  assert.match(p, /\{result\?\.length > 0 && <div role="status"/);
});
