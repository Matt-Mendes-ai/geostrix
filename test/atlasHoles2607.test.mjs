// TASKS.csv #2607 — the Atlas hole list was every hole as an unfiltered checkbox with All / None. It now filters by id or collar field (the
// hole list's own rule), All ticks only what is listed, and a large run says what it will take from the last run's time a page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarsMatching } from "../src/lib/holeFilter.js";

test("the filter rule the dialog uses: a collar field value, or a part of the id", () => {
  const collars = [{ hole_id: "RC1", attrs: { Drill_Code: "RC" } }, { hole_id: "DD1", attrs: { Drill_Code: "DD" } }, { hole_id: "DD2", attrs: { Drill_Code: "DD" } }];
  assert.deepEqual(collarsMatching(collars, "Drill_Code=DD").map((c) => c.hole_id), ["DD1", "DD2"]);
  assert.deepEqual(collarsMatching(collars, "rc").map((c) => c.hole_id), ["RC1"]);
});

test("the dialog lists the filtered holes, All ticks them, and the estimate comes from the last run", () => {
  const m = readFileSync(new URL("../src/components/GenerateAtlasModal.jsx", import.meta.url), "utf8");
  assert.match(m, /const shownHoles = useMemo\(\(\) => \(holeFilter\.trim\(\) \? collarsMatching\(collars, holeFilter\)/);
  assert.match(m, /const items = mode === "hole" \? shownHoles : sections;/);
  assert.match(m, /localStorage\.setItem\("geostrix\.atlasMsPerPage"/);
  assert.match(m, /lastMsPerPage \* selectedCount >= 30000 &&/, "only a run of half a minute or more gets an estimate");
  assert.match(m, /tr\("About \{m\} min for \{n\} pages, at the last run's \{s\} s a page on this computer\."/);
});
