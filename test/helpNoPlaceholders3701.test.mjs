// TASKS.csv #3701 (Fireweed rehearsal, round 3; follow-up of #3693) — 'Messages you may see' (and a few field names) on 48 Help pages printed the app's raw
// placeholders ('{n} station(s) have no latitude ...'). Every message is written as the user sees it now, with example numbers and names; this keeps it so.
// The only braces left are the Layout tokens a user types into a text block ({scale}, {page}, ...), named on the two Layout pages and, as the data credit, on the first-project page.
import test from "node:test";
import assert from "node:assert/strict";
import { PAGES } from "../src/help/content.js";

const TOKENS = new Set(["credits", "scale", "page", "pages", "pagename", "project", "date", "crs", "north", "convergence"]); // lib/layoutTokens: what a text block fills in
const LAYOUT_PAGES = new Set(["layout", "layout-title-block"]);
const strings = (p) => [["summary", p.summary], ...(p.notFor || []).map((t) => ["notFor", t]), ...(p.fields || []).flatMap((f) => ["name", "what", "choose"].map((k) => [`field ${k}`, f[k]])),
  ...(p.warnings || []).flatMap((w) => ["says", "means", "do"].map((k) => [`warning ${k}`, w[k]])), ...(p.howto?.steps || []).map((t) => ["step", t])].filter(([, v]) => typeof v === "string");

test("#3701 no Help page prints a raw {placeholder}: messages carry their example values; only the Layout tokens remain", () => {
  const bad = [];
  for (const p of PAGES) for (const [where, v] of strings(p)) for (const m of v.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
    if (TOKENS.has(m[1]) && (LAYOUT_PAGES.has(p.id) || m[1] === "credits")) continue;
    bad.push(`${p.id} ${where}: {${m[1]}}`);
  }
  assert.deepEqual(bad, [], `raw placeholders left: ${bad.slice(0, 8).join("; ")}`);
});

test("#3701 a message with an example is still a message: no message is empty or carries an unfilled value", () => {
  for (const p of PAGES) for (const w of p.warnings || []) {
    assert.ok(w.says && w.says.trim().length > 0, `${p.id}: an empty message`);
    assert.doesNotMatch(w.says, /\bundefined\b|\bNaN\b|\[object/, `${p.id}: ${w.says.slice(0, 60)}`);
  }
});

test("#3701 silver is in g/t in the Help examples (side 3's #3698)", () => {
  const first = PAGES.find((p) => p.id === "first-project");
  assert.ok(first.howto.steps.some((s) => /Silver is in g\/t/.test(s)));
  for (const p of PAGES) for (const [where, v] of strings(p)) assert.doesNotMatch(v, /Silver is in ppm/, `${p.id} ${where}`);
});
