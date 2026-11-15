// TASKS.csv #3549 (QC links step 2, option D) — assays with no sample ids: two rows over one hole and interval are SUGGESTED as a duplicate pair by hole and depth and marked only for the pairs the user confirms
// (the later row takes the sample type 'field duplicate' and the earlier row's sample id as its parent; ids are made when there are none). SYNTHETIC rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { suggestPairs, applyPairs } from "../src/lib/qcPairSuggest.js";
import { duplicatePairs } from "../src/lib/qaqc.js";

const row = (hole_id, from, to, Au, extra = {}) => ({ hole_id, from, to, values: { Au }, ...extra });
const assays = [row("H1", 0, 1, 1.0), row("H1", 1, 2, 2.0), row("H1", 1, 2, 2.2), row("H2", 0, 1, 0.5), row("H2", 0, 1, 0.5), row("H3", 0, 1, 1), row("H3", 0, 1, 2), row("H3", 0, 1, 3), row("STD-1", 0, 1, 3, { sample_type: "standard" })];

test("suggestions: pairs of two, identical values flagged, three or more left out, QC rows skipped; nothing changes", () => {
  const before = JSON.stringify(assays);
  const { pairs, ambiguous } = suggestPairs(assays);
  assert.deepEqual(pairs.map((p) => [p.hole_id, p.from, p.to, p.original, p.duplicate, p.identical]), [["H1", 1, 2, 1, 2, false], ["H2", 0, 1, 3, 4, true]]);
  assert.equal(ambiguous, 3, "H3's interval is met three times: not suggested");
  assert.equal(JSON.stringify(assays), before, "the input is not changed");
});
test("with sample ids the lower id is the original; a row that is already a duplicate is not offered", () => {
  const a = [row("H1", 0, 1, 1, { sample_id: "S10" }), row("H1", 0, 1, 1.1, { sample_id: "S9" }), row("H4", 0, 1, 1, { sample_type: "field duplicate" }), row("H4", 0, 1, 1)];
  const { pairs } = suggestPairs(a);
  assert.deepEqual(pairs.map((p) => [p.original, p.duplicate, p.ids]), [[1, 0, true]]);
});
test("only the confirmed pairs are marked: the repeat gets the type and the parent, ids are made, the rest are the same objects; the QC duplicate tool then reads the pair", () => {
  const { pairs } = suggestPairs(assays);
  const { rows, marked } = applyPairs(assays, [pairs[0]]);
  assert.equal(marked, 1);
  assert.equal(rows[1].sample_id, "H1_1-2"); assert.equal(rows[2].parent_id, "H1_1-2"); assert.equal(rows[2].sample_type, "field duplicate"); assert.equal(rows[2].sample_id, "H1_1-2_DUP");
  assert.equal(rows[3], assays[3], "an unconfirmed pair is untouched"); assert.equal(rows[0], assays[0]);
  const dp = duplicatePairs(rows, "Au", { Au: "ppm" });
  assert.equal(dp.length, 1); assert.deepEqual([dp[0].v1, dp[0].v2], [2, 2.2]);
  assert.equal(applyPairs(assays, []).marked, 0);
  assert.equal(suggestPairs(rows).pairs.length, 1, "the marked pair is no longer offered (only H2's remains)");
});
test("wired: the Duplicates tab offers the review, the apply goes through setAssays, and the strings are in four languages", () => {
  const q = fs.readFileSync(new URL("../src/components/QAQCPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(q, /dups\.repeatedRows > 0 && \(/); assert.match(q, /onApply=\{\(rows, marked\) => \{ setAssays\?\.\(rows\);/);
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(fs.readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")); for (const k of ["Repeated intervals: which are duplicates?", "Mark {n} as duplicates", "Review {n} repeated interval(s) and mark duplicates…"]) assert.ok(d[k], `${l}: ${k}`); }
});

// the review component, rendered: nothing is ticked at first; ticking one and pressing Mark applies exactly that pair
import { buildSync } from "esbuild";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
test("QcPairReview: nothing ticked at first, the button is off; ticking one pair and pressing Mark applies only that pair", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.window = globalThis; globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const here = path.dirname(fileURLToPath(import.meta.url));
  mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
  const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-qcpair3549-"));
  try {
    const out = path.join(dir, "c.mjs");
    writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", "src", "components", "QcPairReview.jsx")], bundle: true, write: false, format: "esm", platform: "node", jsx: "transform", external: ["react"], loader: { ".js": "jsx" }, logLevel: "silent" }).outputFiles[0].text);
    const { default: QcPairReview } = await import(pathToFileURL(out).href);
    let applied = null; let r;
    await act(async () => { r = TestRenderer.create(React.createElement(QcPairReview, { assays, symbol: "Au", unit: "ppm", elementUnits: { Au: "ppm" }, unitLabel: "ppm", onApply: (rows, n) => { applied = { rows, n }; }, onClose: () => {} })); });
    const buttons = () => r.root.findAllByType("button"), boxes = () => r.root.findAllByType("input");
    assert.equal(boxes().length, 2); assert.ok(boxes().every((b) => b.props.checked === false));
    const mark = () => buttons().find((b) => /^Mark \d+ as duplicates$/.test(b.children.join("")));
    assert.equal(mark().props.disabled, true);
    await act(async () => { boxes()[0].props.onChange(); });
    assert.equal(mark().props.disabled, false);
    await act(async () => { mark().props.onClick(); });
    assert.equal(applied.n, 1); assert.equal(applied.rows[2].sample_type, "field duplicate"); assert.equal(applied.rows[4].sample_type, undefined, "the unticked H2 pair is untouched");
    await act(async () => { r.unmount(); });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
