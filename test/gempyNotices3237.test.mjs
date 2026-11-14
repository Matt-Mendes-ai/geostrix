// TASKS.csv #3237 / #3238 / #3121 — the 'Not run' notice says the time and memory the question gave; a surface that comes back with vertices but
// no triangles is named in 'GemPy returned no mesh for'; Grade x thickness has a Help page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PAGES, pageById } from "../src/help/content.js";
import { helpIdForPane } from "../src/lib/help.js";

const runs = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3237 the Not run notice carries the question's words: minutes, how, memory", () => {
  assert.ok(runs.includes('notice("Not run: about {x} times the work of a run sized for a few minutes ({p} contact points, {o} orientations, {s} surfaces, a block of {b} cells): about {m} minutes {how}, and about {g} GB of memory{warn}. Fewer units'));
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    const k = Object.keys(j).find((x) => x.startsWith("Not run: about {x} times the work"));
    assert.ok(k && k.includes("{m}") && k.includes("{g}") && j[k].includes("{m}") && j[k].includes("{g}") && j[k].includes("{how}") && j[k].includes("{warn}"), l);
    assert.equal(Object.keys(j).filter((x) => x.startsWith("Not run: about {x} times the work")).length, 1, `${l}: the old key is gone`);
  }
});

test("#3238 a surface with vertices and no triangles is said, not added", () => {
  const i = runs.indexOf("if (!surf || !surf.vertices?.length) { missing.push(spec.label); return; }");
  assert.ok(i > 0);
  assert.ok(runs.slice(i, i + 400).includes("if (!surf.faces?.length) { missing.push(`${spec.label} (GemPy returned vertices but no triangles)`); return; }"));
});

test("#3121 Grade x thickness has a Help page, found by its words", () => {
  assert.equal(helpIdForPane("Grade × thickness"), "grade-thickness");
  const p = pageById("grade-thickness");
  assert.ok(p && p.area === "3D Modelling" && p.title === "Grade × thickness");
  const text = JSON.stringify(p);
  for (const w of ["Plan", "Long section", "best-fit plane", "true (normal", "pierce points", "GT cut-off", "Export per-hole totals (CSV)", "Not a resource estimate"]) assert.ok(text.toLowerCase().includes(w.toLowerCase().replace("true (normal", "true")), w);
  assert.ok(p.howto.steps.some((s) => /Open Sample Project > WA lode gold/.test(s)));
  assert.ok(PAGES.some((x) => x.related.includes("grade-estimation") && x.id === "grade-thickness"));
});
