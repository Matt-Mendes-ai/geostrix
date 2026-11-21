// TASKS.csv #3931 — an MT (EDI) import while a project is coming forward (a tab switch expanding its tables in slices) waits for it, then reads
// the files into THAT project; it saw an empty project and asked a blocking CRS question (a native confirm) in the tab being left.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("the store says a project is loading while a switch expands, and resolves the waiters when it ends", () => {
  const s = read("lib/store.jsx");
  assert.match(s, /const whenProjectLoaded = useLatestCallback\(\(\) => \(projectLoadingRef\.current \? new Promise\(\(ok\) => \{ loadWaitersRef\.current\.push\(ok\); \}\) : Promise\.resolve\(\)\)\);/);
  assert.match(s, /startProjectLoad\(\); \/\/ #3931\r?\n\s+expandPayloadSliced\(stashed\)\.then\(/);
  assert.match(s, /\.finally\(\(\) => \{ if \(seq === switchSeqRef\.current\) setTimeout\(endProjectLoad, 0\); \}\)/);
  assert.match(s, /if \(tabId === activeTabId\) \{ endProjectLoad\(\); return; \}/); // a cancelled switch ends the wait too
  assert.match(s, /if \(!payloadHasTables\(target\.payload\)\) \{ switchNow\(tabId, null, null\); endProjectLoad\(\); return; \}/);
  assert.match(s, /projectLoading, whenProjectLoaded \/\* #3931 \*\//);
});

test("the MT pane waits for the load, then imports with the latest project (a latest-callback)", () => {
  const p = read("components/MtSoundingsPane.jsx");
  assert.match(p, /if \(projectLoading && whenProjectLoaded\) \{[\s\S]{0,260}await whenProjectLoaded\(\);[\s\S]{0,60}return importNow\(held\);/);
  assert.match(p, /const importNow = useLatestCallback\(async \(fileList\) => \{/);
  assert.match(p, /tr\("The project is still loading: the EDI files are read when it has loaded\."\)/);
});

test("the waiters' rule: resolved at once with no load; queued and released together when it ends", async () => {
  // the same three lines as the store's, outside React
  let loading = false; let waiters = [];
  const when = () => (loading ? new Promise((ok) => { waiters.push(ok); }) : Promise.resolve());
  const end = () => { if (!loading) return; loading = false; const w = waiters; waiters = []; for (const f of w) f(); };
  assert.equal(await Promise.race([when().then(() => "now"), new Promise((r) => setTimeout(() => r("late"), 20))]), "now");
  loading = true;
  const order = [];
  const a = when().then(() => order.push("a")), b = when().then(() => order.push("b"));
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(order, []); // still loading
  end();
  await Promise.all([a, b]);
  assert.deepEqual(order, ["a", "b"]);
});
