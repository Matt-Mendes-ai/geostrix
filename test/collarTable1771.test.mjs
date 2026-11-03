// TASKS.csv #1771 / #1772 (review #1645, Copley) — collar table stars only the value taken from the survey; the atlas uses the same fallback
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");

test("each orientation value has its own source flag, starred on its own; the azimuth column says grid", () => {
  assert.ok(s.includes("azFromSurvey: azS, dipFromSurvey: dipS, orientFromSurvey: azS || dipS"));
  assert.ok(s.includes("star(f(c.azimuth, 0), c.azFromSurvey ?? c.orientFromSurvey)"));
  assert.ok(s.includes('tr("Azimuth (grid)")'));
});

test("the atlas gets the collars with the survey fallback", () => {
  assert.ok(s.includes("collars={tableCollars} /* #1772"));
});
