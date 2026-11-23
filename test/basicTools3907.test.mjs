// TASKS.csv #3907 (redesign P3) — the Basic tools lists: Maps is a Basic (green) tab, so Basic tools mode shows nine tools at most, and exactly the
// approved list; Geochem (an Advanced tab) gets a short list. Flags only: every other button stays, in All tools.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// the buttons Basic tools mode shows: not flagged advanced, in a group not flagged advanced
function basicTools(src, ribbonLabel) {
  const at = src.indexOf(`<Ribbon label="${ribbonLabel}">`);
  assert.ok(at > 0, ribbonLabel);
  const ribbon = src.slice(at, src.indexOf("</Ribbon>", at));
  const out = [];
  for (const g of ribbon.matchAll(/<RibbonGroup ([^>]*)>([\s\S]*?)<\/RibbonGroup>/g)) {
    if (/\badvanced\b/.test(g[1].replace(/label="[^"]*"/, ""))) continue;
    for (const b of g[2].matchAll(/<RibbonButton ([^\n]*?)label="([^"]+)"/g)) if (!/\badvanced\b/.test(b[1])) out.push(b[2]);
  }
  return out;
}

test("#3907 Maps (a Basic tab): nine Basic tools at most, exactly the approved five", () => {
  const list = basicTools(read("../src/modules/MapsModule.jsx"), "Map tools");
  assert.ok(list.length <= 9, `${list.length} Basic tools`);
  assert.deepEqual(list, ["GeoTIFF / GXF", "Satellite", "Terrain", "Boundaries", "Project CRS"]);
});

test("#3907 Geochem: the short Basic tools list, whatever the data", () => {
  // TASKS.csv #4042 (approved by Matt): Plan survey joins them, so the stream-site planner can be found (a user asked for it, not knowing it existed)
  assert.deepEqual(basicTools(read("../src/modules/GeochemModule.jsx"), "Geochem tools"), ["Assays", "Surface samples", "Grade stats", "Plan survey", "Best intercepts", "Plot PNG"]);
});
