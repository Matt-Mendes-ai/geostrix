// TASKS.csv #3619 (Fireweed rehearsal) — autosave ran and survived a kill, but nothing on screen said so: the time of the last autosave beside the project name in the status bar, gone when nothing is unsaved.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const loc = (lang) => JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));

test("the store announces each autosave (and the clearing of it) and the status bar shows the time", () => {
  const s = read("../src/lib/store.jsx");
  assert.match(s, /if \(r\?\.ok\) \{ autosaveSentRef\.current = new Map\(parts\); try \{ window\.dispatchEvent\(new CustomEvent\("geostrix:autosaved", \{ detail: \{ at: Date\.now\(\) \} \}\)\); \}/);
  assert.match(s, /autosaveClear\(\); lastAutosaveSigRef\.current = null; autosaveSentRef\.current = new Map\(\); try \{ window\.dispatchEvent\(new CustomEvent\("geostrix:autosaved", \{ detail: \{ at: null \} \}\)\)/);
  const a = read("../src/App.jsx");
  assert.match(a, /const h = \(e\) => setAutosavedAt\(e\.detail && "at" in e\.detail \? e\.detail\.at : Date\.now\(\)\);/);
  assert.match(a, /\{autosavedAt && <span title=\{tr\("Save the project to keep it: the unsaved work was copied for recovery at \{time\}/); // #3899: shorter, the action first
  assert.match(a, /tr\("Autosaved \{time\}", \{ time: new Date\(autosavedAt\)\.toLocaleTimeString\(\[\], \{ hour: "2-digit", minute: "2-digit" \}\) \}\)/);
  for (const lang of ["es", "pt", "fr", "ar"]) { const d = loc(lang); for (const k of ["Autosaved {time}", "Save the project to keep it: the unsaved work was copied for recovery at {time}, offered back after a crash."]) assert.ok(d[k], `${lang}: ${k.slice(0, 30)}`); }
});
