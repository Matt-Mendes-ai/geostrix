// TASKS.csv #3166 — no Help how-to sends the reader to Woodjam (no build offers it since #3100); each names a sample the app offers, or
// the reader's own data
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PAGES } from "../src/help/content.js";

const menu = fs.readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");

test("no Help page names Woodjam or its ZTEM model", () => {
  for (const p of PAGES) {
    const text = JSON.stringify(p);
    assert.doesNotMatch(text, /Woodjam|ZTEM/, p.id);
  }
});

test("every how-to's sample is one File > Open Sample Project lists, or the reader's own data", () => {
  const offered = new Set(["Harry", "Silvertip", "Perk-Rocky", "WA lode gold", "WA bedded iron", "Century", "Blake River", "Mount Raymond", "Rouyn-Noranda", "WA palaeochannel uranium"]);
  for (const name of offered) assert.ok(menu.includes(`L("${name}`) || menu.includes(name), `the menu offers ${name}`);
  for (const p of PAGES) {
    // the sample field also names outside data (a USGS release, a contractor's survey): the steps the reader follows are what is checked
    for (const step of p.howto?.steps || []) {
      const m = step.match(/Open Sample Project > ([^(.,]+)/);
      if (m) assert.ok(offered.has(m[1].trim()), `${p.id}: ${m[1]}`);
    }
  }
});

test("the eight rewritten how-tos", () => {
  const byId = Object.fromEntries(PAGES.map((p) => [p.id, p]));
  for (const id of ["slice-3d", "section-by-coordinates", "slice-series", "undrilled-zones", "planned-drillholes", "voxel-ranges"]) assert.equal(byId[id]?.howto?.sample, "WA lode gold", id);
  assert.match(byId["undrilled-zones"].howto.steps[1], /Grade shell/);
  assert.match(byId["voxel-ranges"].howto.steps[1], /Estimation/);
  assert.equal(byId.dcip.howto.sample, "your own IP lines");
  assert.match(byId.dcip.howto.steps[0], /No bundled sample has IP lines/);
});
