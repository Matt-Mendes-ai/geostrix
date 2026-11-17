// TASKS.csv #3759 (Scottie Geochem leftovers of #3754) — (3) one heading for the detection-floor column, (4) the Help pane opened from a dialog's '?' closes with that dialog, (8) Best intercepts'
// host domain offers the sample fields, collar fields and custom interval layers the other tools offer. Synthetic only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attributeDomainOptions, customDomainOptions } from "../src/lib/customDomains.js";
import { domainsForInterval } from "../src/lib/geochem.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3759 (3) one heading, 'On the floor %', in Grade statistics and Thresholds", () => {
  for (const f of ["../src/components/GradeStatistics.jsx", "../src/components/ThresholdToolkit.jsx"]) {
    const s = read(f);
    assert.match(s, /\{tr\("On the floor %"\)\}<\/th>/);
    assert.doesNotMatch(s, /tr\("<DL %"\)/);
  }
});

test("#3759 (4) a Help page opened from a dialog closes with the dialog; one opened elsewhere stays", () => {
  const a = read("../src/App.jsx");
  assert.match(a, /const d = document\.activeElement\?\.closest\?\.\('\[role="dialog"\]'\); if \(d\) helpDialogRef\.current = d;/);
  assert.match(a, /if \(d && !d\.isConnected\) \{ helpDialogRef\.current = null; setHelpAt\(null\); \}/);
});

test("#3759 (8) Best intercepts' host domain: the kept sample fields and a custom interval layer resolve to rows the host split can read", () => {
  const assays = Array.from({ length: 12 }, (_, i) => ({ hole_id: "A", from: i, to: i + 1, values: { Au: 1 }, attrs: { Zone: i < 6 ? "Steep" : "Low" } }));
  const opts = [...attributeDomainOptions(assays, []), ...customDomainOptions([{ id: "c1", name: "Alteration (mine)", rows: Array.from({ length: 12 }, (_, i) => ({ hole_id: "A", from: i, to: i + 1, style: i < 6 ? "potassic" : "phyllic" })) }], null, { groupTop: 12 })];
  const zone = opts.find((d) => d.key === "assay:Zone"), custom = opts.find((d) => d.key.startsWith("custom:c1:style"));
  assert.ok(zone && custom, opts.map((d) => d.key).join());
  const split = domainsForInterval(zone.rows, "A", 4, 8); // an intercept straddling the contact
  assert.deepEqual(split.parts.map((p) => p.value ?? p.code ?? p.domain).sort(), ["Low", "Steep"]);
  assert.ok(domainsForInterval(custom.rows, "A", 2, 4).parts.length >= 1);
  const b = read("../src/components/BestIntercepts.jsx");
  assert.match(b, /const domainRows = domainLayer \? \(domainExtra \? domainExtra\.rows : layers\?\.\[domainLayer\] \|\| \[\]\) : null;/);
  assert.match(b, /\{extraDomains\.map\(\(d\) => <option key=\{d\.key\} value=\{d\.key\}>\{attributeDomainLabel\(d, tr\)\}<\/option>\)\}/);
  assert.match(b, /\(domainLayerOptions\.length > 0 \|\| extraDomains\.length > 0\)/);
});
