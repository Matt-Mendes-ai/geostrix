import { useEffect, useRef, useState } from "react";

// TASKS.csv #1203 — a module stays mounted across project tabs, so one notices list served them all: a Perk-Rocky tab listed Woodjam's IP warnings. Each tab keeps its own.
// onSwitch: for what else the switch resets. A pure pair for the test: tabNotices.
export function tabNoticesSwitch(stash, from, to, current) {
  stash.set(from, current);
  const back = stash.get(to) || [];
  stash.delete(to);
  return back;
}
// TASKS.csv #3963 — a notice for a given tab (a job's early notices go to the project it started in, not to the tab shown when it speaks): the tab's own
// list when it is the one shown, else its stashed list (it comes back with the tab), and none for a tab that is gone. A pure step for the test.
export function noticesToTab(stash, shownTab, tab, updater, setShown) {
  if (tab == null) return; // its project is closed
  if (tab === shownTab) { setShown(updater); return; }
  const prev = stash.get(tab) || [];
  stash.set(tab, typeof updater === "function" ? updater(prev) : updater);
}
export function useTabNotices(activeTabId, onSwitch) {
  const [notices, setNotices] = useState([]);
  const tab = useRef(activeTabId), stash = useRef(new Map()), latest = useRef(notices), switched = useRef(onSwitch);
  latest.current = notices; switched.current = onSwitch;
  useEffect(() => {
    if (tab.current === activeTabId) return;
    setNotices(tabNoticesSwitch(stash.current, tab.current, activeTabId, latest.current));
    tab.current = activeTabId;
    switched.current?.();
  }, [activeTabId]);
  // the tab shown is `activeTabId` as far as the store knows (tab.current follows it one effect later): a notice for the tab just switched to waits in its stash, which the switch reads
  const setNoticesToTab = useRef((id, updater) => noticesToTab(stash.current, tab.current, id, updater, setNotices)).current;
  return [notices, setNotices, setNoticesToTab];
}
