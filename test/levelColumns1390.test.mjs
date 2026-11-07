// TASKS.csv #1390 (review #1352, Silvertip) — Level surveys no longer offers the Domains tool's 'Geochemical domain' column as the thing
// that tells surveys apart (it levelled one k-means cluster of a soil program against another), and says why.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DOMAIN_ATTR } from "../src/lib/geochemDomains.js";

test("the domain column is left out of the survey columns, with a note", () => {
  assert.equal(DOMAIN_ATTR, "Geochemical domain");
  const p = readFileSync(new URL("../src/components/LevellingPanel.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('if (!k.endsWith("_lev_basis") && k !== DOMAIN_ATTR) c.add(k);'));
  assert.ok(p.includes("{hasDomains && <div style={note}>"));
});
