// TASKS.csv #1525 — Best intercepts' True width started on a 090/60 structure nobody entered and printed factors of 0.12-0.16 on
// Lawyers' top intercepts. The plane starts empty; no width or factor is shown (or exported) until both values are typed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("no default orientation", () => {
  assert.ok(!src.includes("useState(90)") && !src.includes("useState(60)"));
  assert.match(src, /const \[twDipDirText, setTwDipDirText\] = useState\(""\);/);
  assert.match(src, /const \[twDipText, setTwDipText\] = useState\(""\);/);
});

test("widths, factors and exports only once both are set; a prompt until then", () => {
  assert.match(src, /const twReady = Number\.isFinite\(twDipDir\) && Number\.isFinite\(twDip\) && twDip >= 0 && twDip <= 90;/);
  assert.match(src, /const twEnabled = twOn && twReady;/);
  assert.match(src, /\{twOn && !twReady && <span[^>]*>\{tr\("Enter the mineralized structure's dip direction and dip/);
  assert.match(src, /tw: tracesByHole \? trueWidthForIntercept\(/); // tracesByHole is built only when twEnabled
  assert.match(src, /if \(!twEnabled \|\| !collars\?\.length\) return null;/);
});
