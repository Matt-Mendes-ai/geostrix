import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(f, "utf8");
test("#1199 results go to the main area; embedded panels keep them in place", () => {
  const geo = read("src/modules/GeophysicsModule.jsx");
  assert.match(geo, /className="ge-geo-results" ref=\{setResultSlot\}/);
  assert.match(geo, /<InversionPanel [^>]*resultSlot=\{resultSlot\}/);
  assert.match(geo, /<DcipPanel [^>]*resultSlot=\{resultSlot\}/);
  assert.match(read("src/components/InResultArea.jsx"), /slot \? createPortal\(/);
  const css = read("src/styles/app.css");
  assert.match(css, /\.ge-main:has\(> \.ge-geo-results > \*\) > \.ge-geo-empty \{ display: none; \}/);
});
