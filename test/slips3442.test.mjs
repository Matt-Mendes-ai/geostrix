// TASKS.csv #3442 (the seven leftover slips of #3330)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shortenCode, shortCodes } from "../src/lib/downholeLogs.js";
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3442 (6) two long codes never read the same; a short one is untouched; a trailing parenthesis is kept", () => {
  const a = "Calcic-potassic (Garnet Dominant)", b = "Calcic-potassic (Diopside Dominant)";
  const cut = shortCodes([a, b, "S1"], 18);
  assert.equal(new Set(cut).size, 3); assert.equal(cut[2], "S1");
  assert.ok(cut[0].includes("Garnet") && cut[1].includes("Diopside"), cut.join(" | "));
  assert.equal(shortenCode("Magnesium_Clays_Very_Long_Name", 12), "Magnes…_Name"); // the middle goes: the start and the end both show
  assert.ok(shortenCode("Magnesium_Clays_Very_Long_Name", 12).length <= 12);
  assert.equal(shortCodes(["A", "B"], 18).join(), "A,B");
});

test("#3442 (3) (7) (8) (9) wording and stale messages", () => {
  const g = rd("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /<button onClick=\{\(\) => \{ setXyzPending\(null\); setXyzError\(null\); setError\(null\);/); // a cancelled picker's message goes with it
  assert.match(g, /const about = \(e\) => \(e && typeof e === "object" && String\(e\.text \|\| ""\)\.includes\(`"\$\{sv\.key\}"`\) \? null : e\); setXyzError\(about\); setError\(about\);/);
  assert.match(g, /This limits block models only \(OMF and UBC imports\)\. Point surveys and rasters are not cut down by it\./);
  const d = rd("../src/components/DcipPanel.jsx");
  assert.match(d, /Choose the columns for A, M and the apparent resistivity in the lists above\./); assert.doesNotMatch(d, /columns below\./);
  const m = rd("../src/components/MtSoundingsPane.jsx");
  assert.match(m, /A DC \/ IP line table \(\.csv, \.dat, \.txt\) can be tried in the DC \/ IP pane, which lets you map its columns\./);
});
