// TASKS.csv #3899 (Text and Help batch, T3) — the wordiness ratchet: no surface (Help seen first, a Help page, tooltips, info pop-ups, notices, the other interface
// strings and each working area) may grow past the number recorded in test/wordcount-baseline.json, so the rewording of #3899 can only make GeoStrix shorter.
//   - A surface that shrank passes. Lower its ceiling:  node scripts/word-count.mjs --update-baseline   (it refuses a surface that grew).
//   - A new feature adds words and fails this test. If the words are needed, raise the ceiling on purpose:  node scripts/word-count.mjs --update-baseline --allow-growth
//     and say in the commit which surface grew and why. A tool that adds words should drop others; the point is that growth is a decision, not an accident.
// The counting rules are the header of scripts/word-count.mjs; the "before" report is "Review data/Text and Help batch/wordcount_before.md".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { collect, surfaces, BASELINE_FILE, wordsOf } from "../scripts/word-count.mjs";

test("#3899 how a word is counted: letters and digits, a placeholder is not one", () => {
  assert.equal(wordsOf("Open the 3D view"), 4);
  assert.equal(wordsOf("{n} hole(s) of {m}: 25 % cut-off, 0.5 m"), 7); // hole, s, of, 25, cut-off, 0.5, m (the % is not a word)
  assert.equal(wordsOf("{n}"), 0);
  assert.equal(wordsOf(""), 0);
  assert.equal(wordsOf(null), 0);
});

test("#3899 no surface is wordier than its recorded ceiling", async () => {
  const base = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")).surfaces;
  const now = surfaces(await collect());
  const grew = [], missing = [];
  for (const [k, ceiling] of Object.entries(base)) {
    if (now[k] == null) { missing.push(k); continue; }
    if (now[k] > ceiling) grew.push(`${k}: ${now[k]} words, ceiling ${ceiling} (+${now[k] - ceiling})`);
  }
  assert.deepEqual(missing, [], "a recorded surface is gone (a Help page or an area renamed?): update the baseline");
  assert.deepEqual(grew, [], "a surface grew past its ceiling (see the header of this test for what to do)");
});
