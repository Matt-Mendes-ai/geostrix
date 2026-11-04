// TASKS.csv #1797 (review #1646, Kodiak) — Domains runs in a worker (the same result where no worker can start) and opens on the
// largest medium
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { geochemDomains } from "../src/lib/geochemDomains.js";
import { geochemDomainsAsync } from "../src/lib/geochemDomainsClient.js";

// 60 soils in two chemical groups over four elements
const samples = Array.from({ length: 60 }, (_, i) => {
  const g = i % 2, r = (n) => 1 + ((i * 37 + n * 11) % 17) / 10;
  return { medium: "soil", values: { Cu: (g ? 200 : 20) * r(1), Zn: (g ? 40 : 150) * r(2), Pb: 15 * r(3), As: (g ? 5 : 30) * r(4) }, attrs: { x: i } };
});
const units = { Cu: "ppm", Zn: "ppm", Pb: "ppm", As: "ppm" };

test("#1797 without a worker (Node) the client gives the library's result, from each sample's values only", async () => {
  const direct = geochemDomains(samples, ["Cu", "Zn", "Pb", "As"], units, { k: 2 });
  const viaClient = await geochemDomainsAsync(samples, ["Cu", "Zn", "Pb", "As"], units, { k: 2 });
  assert.deepEqual(viaClient.index, direct.index);
  assert.deepEqual(viaClient.assign ?? viaClient.labels ?? null, direct.assign ?? direct.labels ?? null);
  assert.equal(JSON.stringify(viaClient.pca), JSON.stringify(direct.pca));
});

test("#1797 the panel runs it asynchronously with a busy state, and opens on the largest medium", () => {
  const p = readFileSync(new URL("../src/components/DomainsPanel.jsx", import.meta.url), "utf8");
  assert.ok(p.includes("const r = await geochemDomainsAsync(subset, symbols, units, { k });"));
  assert.ok(p.includes('{busy ? tr("Running…") : tr("Run")}'));
  assert.ok(p.includes("return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? \"all\";"));
  const w = readFileSync(new URL("../src/lib/geochemDomains.worker.js", import.meta.url), "utf8");
  assert.ok(w.includes("geochemDomains(samples, symbols, units, { k })"));
});
