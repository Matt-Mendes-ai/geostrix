// TASKS.csv #2674 (part) — the Atlas strip-log checkbox said 'litho/alteration/vein/RQD%' on a project with neither veins nor RQD
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the checkbox names the logs the project has", () => {
  const s = readFileSync(new URL("../src/components/GenerateAtlasModal.jsx", import.meta.url), "utf8");
  assert.match(s, /\[\["litho", tr\("lithology"\)\], \["alt", tr\("alteration"\)\], \["vein", tr\("veins"\)\], \["geotech", "RQD%"\]\]\.filter\(\(\[k\]\) => \(layers\?\.\[k\] \|\| \[\]\)\.length\)/);
  assert.match(s, /tr\("Add a strip log image \(\{logs\}\) to each page", \{ logs: logs\.join\(", "\) \}\) : tr\("Add a strip log image to each page"\)/);
  assert.doesNotMatch(s, /litho\/alteration\/vein\/RQD%\) to each page/);
});
