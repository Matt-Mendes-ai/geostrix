// TASKS.csv #1740 (review #1645, Copley) — 'Unknown' and the like are not offered as an assemblage to model
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isNotLogged } from "../src/lib/notLogged.js";

test("#1740 placeholders for 'nothing logged' are recognized; real codes are not", () => {
  for (const v of ["Unknown", "unknown ", "Not logged", "N/A", "na", "none", "-", "?", "", null, "No data", "TBD"]) assert.equal(isNotLogged(v), true, String(v));
  for (const v of ["ARG", "PHYL", "UNK-ARG", "Unknown argillic", "SIL", "NA2"]) assert.equal(isNotLogged(v), false, v);
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.ok(p.includes("alt_units.filter((u) => !isNotLogged(u))")); // the Alteration layer's codes (#1574: a custom layer's codes go through the same isNotLogged filter)
});
