// TASKS.csv #2961 (review #2876, WA iron) — the per-hole 'grade × thickness / metres at or above a cut-off' cards (#2653, #2781) were dropped
// whenever the Evidence overlay was reopened (and so on reopening the project): the restore looked each saved key up in the add list,
// which only has the 'gtpick:' entry that opens the cut-off form. The card's source is now rebuilt from its key, by the add form's builder.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gtRef, parseGtRef, gtlRef, parseGtlRef } from "../src/lib/evidenceSources.js";

test("#2961 a saved per-hole key gives back its element / log, measure and cut-off", () => {
  const k = `num${gtRef("Fe", "m", 55)}`;
  assert.equal(k, "numgt:Fe:m:55", "the key the review saw in the store");
  assert.deepEqual(parseGtRef(k.slice(3)), { symbol: "Fe", how: "m", cutoff: 55 });
  const kl = `num${gtlRef("custom:abc:eU3O8 ppm", "gt", 0.5)}`;
  assert.ok(kl.startsWith("numgtl:") && !kl.startsWith("numgt:"), "the two prefixes do not overlap");
  assert.deepEqual(parseGtlRef(kl.slice(3)), { ref: "custom:abc:eU3O8 ppm", how: "gt", cutoff: 0.5 });
});

test("#2961 the restore rebuilds a per-hole card the add list does not hold; the add form uses the same builder", () => {
  const s = fs.readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.ok(s.includes("const src = sources.find((x) => x.key === l.key) || perHoleFromKey(l.key);"));
  assert.ok(s.includes("const add = () => { addLayer(null, perHoleSource(gtPick, gtPick.how, cut)); setGtPick(null); };"));
  const fn = s.slice(s.indexOf("const perHoleFromKey = (key) => {"), s.indexOf("const addLayer = (key, given = null) => {"));
  assert.match(fn, /k\.startsWith\("numgt:"\) \? parseGtRef\(k\.slice\(3\)\)/);
  assert.match(fn, /labElements\.some\(\(e\) => e\.symbol === g\.symbol\)/, "only while the element still has assays");
  assert.match(fn, /k\.startsWith\("numgtl:"\) \? parseGtlRef\(k\.slice\(3\)\)/);
  assert.match(fn, /numericLayerSources\.find\(\(x\) => x\.ref === l\.ref && x\.name\)/, "only while the log is still there");
  assert.match(fn, /if \(!traces\.size\) return null;/);
  assert.equal((s.match(/Drillholes: metres at or above \{c\} \{u\} \{sym\} in each hole/g) || []).length, 1, "one label builder");
});
