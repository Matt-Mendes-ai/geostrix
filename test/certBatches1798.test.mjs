// TASKS.csv #1798 (review #1646, Kodiak) — Surface QAQC batches by certificate use the sample file's certificate column when no
// certificate was imported; and no source file carries a control character (a "\b" written through a script became a backspace)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { certificateColumn, batchSummary, DEFAULT_SURFACE_QC_SETTINGS } from "../src/lib/surfaceQaqc.js";

const s = (i, cert) => ({ id: `S${i}`, medium: "soil", values: {}, attrs: { Certificate: cert, "Certificate completed": "2023-08-01", "Cu ppm AuME-ST43 certificate": cert } });
const samples = [...Array.from({ length: 214 }, (_, i) => s(i, "VA23178295")), ...Array.from({ length: 248 }, (_, i) => s(1000 + i, "VA23242348"))];
const records = [...Array.from({ length: 9 }, () => ({ kind: "duplicate", batch: "VA23178295", source: "program" })), ...Array.from({ length: 11 }, () => ({ kind: "duplicate", batch: "VA23242348", source: "program" }))];

test("#1798 the certificate column: the plain one, not an element's, never a '... completed' date", () => {
  assert.equal(certificateColumn(samples), "Certificate");
  assert.equal(certificateColumn([{ attrs: { "Cu ppm AuME-ST43 certificate": "X", "Certificate completed": "d" } }]), "Cu ppm AuME-ST43 certificate");
  assert.equal(certificateColumn([{ attrs: { Job: "J1" } }]), "Job");
  assert.equal(certificateColumn([{ attrs: { Horizon: "B" } }]), null);
});

test("#1798 batches by certificate: the samples join their certificates, so the duplicate rate shows (about 1 in 23)", () => {
  const b = batchSummary(samples, records, DEFAULT_SURFACE_QC_SETTINGS, []);
  const a = b.find((x) => x.batch === "VA23178295"), c = b.find((x) => x.batch === "VA23242348");
  assert.deepEqual([a.samples, a.duplicate, Math.round(a.rate.duplicate)], [214, 9, 24]);
  assert.deepEqual([c.samples, c.duplicate, Math.round(c.rate.duplicate)], [248, 11, 23]);
  assert.ok(!b.some((x) => x.batch === "(no certificate)"));
});

test("no source file holds a control character (backspace, form feed...)", () => {
  const bad = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|jsx|mjs|cjs)$/.test(f) && /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(readFileSync(p, "utf8"))) bad.push(p); } };
  walk(fileURLToPath(new URL("../src", import.meta.url)));
  walk(fileURLToPath(new URL("../electron", import.meta.url)));
  assert.deepEqual(bad, []);
});

test("#1798 rocks and soils naming the column differently: each sample uses the first certificate column it fills", () => {
  const rocks = Array.from({ length: 5 }, (_, i) => ({ medium: "rock chip", values: {}, attrs: { Certificate: "VA23110414" } }));
  const soils = Array.from({ length: 30 }, (_, i) => ({ medium: "soil", values: {}, attrs: { "Cu ppm AuME-ST43 certificate": "VA23178295" } }));
  const b = batchSummary([...rocks, ...soils], [], DEFAULT_SURFACE_QC_SETTINGS, []);
  assert.deepEqual(b.map((x) => [x.batch, x.samples]), [["VA23110414", 5], ["VA23178295", 30]]);
});
