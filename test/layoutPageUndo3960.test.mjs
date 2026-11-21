// TASKS.csv #3960 (Matt's first-time test) — 'ctrl Z won't undo deleted layout': deleting the page shown brought Page 1 forward, and LayoutModule
// refitted Page 1's starter credit box (#3657, the credit had grown while it was hidden) as an undo step of its own, on top of the delete. Ctrl+Z
// undid the refit ('Undone: Layout pages.') and the page stayed deleted. The app's own Layout refreshes are no steps now. Made-up pages.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isQuietRefresh } from "../src/lib/layoutPageUndo.js";

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const pg = (id, elements) => ({ id, name: id, elements });

test("only the app's own refresh, with nothing else and no step under way, is quiet", () => {
  const pages = [pg("p1", [])], quiet = [pg("p1", [{ id: "credit", w: 300 }])];
  const prev = { layoutPages: pages, collars: [] }, cur = { layoutPages: quiet, collars: prev.collars };
  assert.equal(isQuietRefresh(cur, prev, quiet), true);
  assert.equal(isQuietRefresh(cur, prev, null), false, "no quiet refresh made");
  assert.equal(isQuietRefresh({ layoutPages: [pg("p1", [])], collars: prev.collars }, prev, quiet), false, "another pages list (the user's)");
  assert.equal(isQuietRefresh({ ...cur, collars: [{ hole_id: "X-1" }] }, prev, quiet), false, "something else changed too");
  assert.equal(isQuietRefresh(cur, prev, quiet, { burst: true }), false, "an edit under way: it joins it");
  assert.equal(isQuietRefresh(cur, prev, quiet, { ownStep: true }), false, "a page step waiting: it is recorded");
});

// the history as the store keeps it (#3935's model): past / future snapshots of { layoutPages }; a change is a step unless it is quiet
function history(start) {
  const h = { live: start, past: [], future: [] };
  h.change = (next, { quietPages = null } = {}) => { if (!isQuietRefresh(next, h.live, quietPages)) { h.past.push(h.live); h.future.length = 0; } h.live = next; };
  h.undo = () => { if (!h.past.length) return false; h.future.push(h.live); h.live = h.past.pop(); return true; };
  h.redo = () => { if (!h.future.length) return false; h.past.push(h.live); h.live = h.future.pop(); return true; };
  return h;
}
const names = (s) => s.layoutPages.map((p) => p.name);
const refit = (s) => { const quiet = s.layoutPages.map((p) => (p.id === "Page 1" ? { ...p, elements: p.elements.map((e) => (e.id === "credit" ? { ...e, w: 420 } : e)) } : p)); return { next: { layoutPages: quiet }, quiet }; };

test("delete a page, its neighbour refitted as it comes forward: Ctrl+Z brings the page back with all its elements, Redo deletes it again", () => {
  const p1 = pg("Page 1", [{ id: "title" }, { id: "credit", w: 300 }]), snap = pg("Snapshot 2", [{ id: "img", type: "image" }, { id: "leg", type: "legend", boundViewportId: "img" }]);
  const h = history({ layoutPages: [p1, snap] });
  h.change({ layoutPages: [p1] }); // the delete (its own step, #3935)
  const r = refit(h.live); h.change(r.next, { quietPages: r.quiet }); // Page 1 comes forward and its credit box is refitted
  assert.equal(h.past.length, 1, "the refit is not a step");
  assert.ok(h.undo());
  assert.deepEqual(names(h.live), ["Page 1", "Snapshot 2"], "the page is back, in its place");
  assert.deepEqual(h.live.layoutPages[1].elements.map((e) => e.id), ["img", "leg"], "with every element");
  assert.ok(h.redo());
  assert.deepEqual(names(h.live), ["Page 1"], "Redo deletes it again");
});

test("before the fix (the refit a step of its own): Ctrl+Z undid the refit and the page stayed deleted", () => {
  const p1 = pg("Page 1", [{ id: "credit", w: 300 }]), snap = pg("Snapshot 2", [{ id: "img" }]);
  const h = history({ layoutPages: [p1, snap] });
  h.change({ layoutPages: [p1] });
  h.change(refit(h.live).next); // not marked quiet
  h.undo();
  assert.deepEqual(names(h.live), ["Page 1"], "Matt's 'Undone: Layout pages.' with no page back");
});

test("add, rename: each one step, undone and redone", () => {
  const h = history({ layoutPages: [pg("Page 1", [])] });
  h.change({ layoutPages: [...h.live.layoutPages, pg("Page 2", [{ id: "a" }])] }); // Add page
  h.change({ layoutPages: h.live.layoutPages.map((p) => (p.id === "Page 2" ? { ...p, name: "Plan" } : p)) }); // rename
  h.undo(); assert.deepEqual(names(h.live), ["Page 1", "Page 2"]);
  h.undo(); assert.deepEqual(names(h.live), ["Page 1"]);
  h.redo(); h.redo(); assert.deepEqual(names(h.live), ["Page 1", "Plan"]);
});

test("wired: the store's quiet setter and the watcher's check; LayoutModule's three own refreshes use it", () => {
  const s = read("lib/store.jsx");
  assert.match(s, /const setLayoutElementsQuietly = useLatestCallback\(\(updater\) => \{/);
  assert.match(s, /if \(!changed\) return pages;\n {6}sysLayoutPagesRef\.current = next;/, "a refresh that changes nothing changes no state");
  assert.match(s, /if \(isQuietRefresh\(current, prevSnap, sysLayoutPagesRef\.current, \{ burst: !!undoBeforeBurst\.current, ownStep: undoOwnStep\.current \}\)\) \{\n {6}sysLayoutPagesRef\.current = null; setActiveTabDirty\(true\); undoPrevSnapshot\.current = current; return;/);
  // the check comes after the 'no change' return and before a burst is started
  const w = s.indexOf("if (isQuietRefresh(current, prevSnap"), noChange = s.indexOf("current[k] === prevSnap[k])) return; // no real change"), burst = s.indexOf("if (!undoBeforeBurst.current) { undoBeforeBurst.current = undoPrevSnapshot.current;");
  assert.ok(noChange > 0 && noChange < w && w < burst);
  // a frame's new picture, arriving by itself after the user's last step, is quiet too (on its own page or the active one); a NEW frame stays a step
  assert.match(s, /const applyEls = targetPageId \? \(fn\) => setLayoutPagesQuietly\(\(pages\) => pages\.map\(\(p\) => \(p\.id === targetPageId \? \{ \.\.\.p, elements: fn\(p\.elements\) \} : p\)\)\) : setLayoutElementsQuietly;/);
  assert.match(s, /\} else setLayoutElements\(\(els\) => addViewportToPage\(els, mkView\(freeSpot\(els, w, h, paper\)\)\)\);/, "a new frame: an ordinary step");
  const l = read("modules/LayoutModule.jsx");
  assert.match(l, /setLayoutElementsQuietly: setElementsQuietly,/);
  assert.match(l, /setElementsQuietly\(\(prev\) => refitStarterOf\(prev \|\| \[\], f, f, credits, ""\)\);/, "#3657's refit");
  assert.match(l, /setElementsQuietly\(\(els\) => els\.map\(\(el\) => \(fixed\.has\(el\.id\) \? \{ \.\.\.el, numbersChecked: true,/, "#2603's rounding");
  assert.match(l, /setElementsQuietly\(\(els\) => els\.map\(\(el\) => \(due\.some\(\(d\) => d\.id === el\.id\) \? \{ \.\.\.el, fitAzimuth: undefined/, "#3018's flags");
});
