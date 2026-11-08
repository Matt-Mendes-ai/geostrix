// TASKS.csv #1444 (review #1352, Silvertip) — the rose diagram: Source in both plots, a minimum dip for the rose (near-flat bedding swamped
// the strike rose), ring labels off the N, no type colour key under a one-colour rose; the export says the dip filter.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync as readRaw } from "node:fs";
// v0.1.103 release CI: the Windows runner checks the sources out with CRLF, so the text pins compare LF text
const readFileSync = (p, enc) => readRaw(p, enc).replace(/\r\n/g, "\n");
import { stereonetFurniture } from "../src/lib/figureFurniture.js";

const s = readFileSync(new URL("../src/components/StereonetModal.jsx", import.meta.url), "utf8");

test("rose controls and drawing", () => {
  const i = s.indexOf('aria-label={tr("Measurement source")}'), j = s.indexOf('{view === "stereonet" && (\n              <label style={rowLabel}>{tr("Projection")}');
  assert.ok(i > 0 && j > i, "Source before, outside the stereonet-only Projection");
  assert.ok(s.includes("roseMinDip > 0 ? filtered.filter((p) => Number(p.dip) >= roseMinDip) : filtered"));
  assert.ok(s.includes("x={pt(15, R * f).x + 3} y={pt(15, R * f).y - 2}"), "ring labels on the 15° radial");
  assert.ok(s.includes('{view !== "rose" && (types.length > 1 || both) && ('));
});

test("the export caption says the dip filter", () => {
  const base = { view: "rose", roseMode: "strike", roseBin: 10, plotted: 5, filtered: 5, total: 5, source: "surface", typeFilter: "all", stats: null, roseN: 5, date: "2026-11-07" };
  const f = stereonetFurniture({ ...base, roseMinDip: 30 });
  assert.ok(f.caption.some((c) => c.includes("planes dipping 30° or more only")), JSON.stringify(f.caption));
  assert.ok(!stereonetFurniture({ ...base, roseMinDip: 0 }).caption.some((c) => /planes dipping/.test(c)));
});
