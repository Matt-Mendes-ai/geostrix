// TASKS.csv #1678 — custom-layer categories as domains; point layers are not offered
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { customDomainOptions } from "../src/lib/customDomains.js";

test("an Oxidation-like layer gives its code column as a domain; numeric and free-text fields do not", () => {
  const rows = [];
  for (let i = 0; i < 26; i++) rows.push({ hole_id: `H${i % 5}`, from: i * 10, to: i * 10 + 10, value: ["O", "T", "S"][i % 3], Rock_Oxidation_Int: String(i % 4), Ox_Comments: `note ${i}` });
  const opts = customDomainOptions([{ id: "ox", name: "Copley_2023_DH_Oxidation", rows }, { id: "swir", name: "SWIR", rows: [{ hole_id: "H", depth: 3, value: "Mu" }, { hole_id: "H", depth: 4, value: "Kao" }] }]);
  assert.deepEqual(opts.map((o) => o.label), ["Copley_2023_DH_Oxidation · value"]);
  assert.equal(opts[0].key, "custom:ox:value");
  assert.equal(opts[0].rows.length, 26);
  assert.deepEqual(opts[0].rows[1], { hole_id: "H1", from: 10, to: 20, value: "T" });
});

test("Grade stats and Compositing list them; Grade stats no longer offers point layers", () => {
  const g = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  const c = readFileSync(new URL("../src/components/CompositingModal.jsx", import.meta.url), "utf8");
  assert.ok(g.includes("customDomains.map((d) =>") && c.includes("customDomains.map((d) =>"));
  assert.ok(g.includes('const DOMAIN_LAYER_KEYS = ["litho", "alt", "vein", "breccia", "weath", "structzone", "geotech"]; // weath: #2162'));
});

import { isCategoricalLayer, domainIndex, domainAtMid } from "../src/lib/customDomains.js";
test("#1515 — numeric interval layers are not domains; the indexed lookup finds the interval holding the midpoint", () => {
  assert.equal(isCategoricalLayer([{ value: 100 }, { value: "96.67" }, { value: 98.33 }]), false);
  assert.equal(isCategoricalLayer([{ value: "HBX" }, { value: "FZ" }, { value: 3 }]), true);
  const rows = [];
  for (let h = 0; h < 50; h++) for (let k = 0; k < 40; k++) rows.push({ hole_id: `H${h}`, from: k * 5, to: k * 5 + 5, value: `U${(h + k) % 7}` });
  const idx = domainIndex(rows.slice().reverse());
  const naive = (hole, from, to) => { const mid = (from + to) / 2; const hit = rows.find((r) => r.hole_id === hole && mid >= r.from && mid < r.to); return hit ? hit.value : null; };
  for (let t = 0; t < 2000; t++) { const h = `H${t % 51}`, f = (t * 7.3) % 210; assert.equal(domainAtMid(idx, h, f, f + 1), naive(h, f, f + 1), `${h} ${f}`); }
});
