// TASKS.csv #2702 — the planned-hole form takes today's LOCAL date (declination date, entered-azimuth record), not the UTC one
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("PlannedHoleParts uses localDate(), and no Mine Design / Targeting pane slices an ISO string for today", () => {
  const p = fs.readFileSync("src/components/PlannedHoleParts.jsx", "utf8");
  assert.match(p, /const today = localDate\(\);/);
  assert.match(p, /import \{ localDate \} from "\.\.\/lib\/localDate\.js";/);
  for (const f of ["PlannedHoleParts", "PlannedHoleTargeting", "PlannedHolePattern", "EvidenceOverlayPane", "UndrilledZonesPane", "PitShellPane", "PitDesignPane", "NestedPitsPane", "StopesPane", "DumpPane", "DesignStringsPane", "DesignLinesPane"]) {
    assert.ok(!/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(fs.readFileSync(`src/components/${f}.jsx`, "utf8")), f);
  }
});
