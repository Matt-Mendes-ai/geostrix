import { useEffect, useRef, useState } from "react";

// TASKS.csv #1203 — a module stays mounted across project tabs, so one notices list served them all: a Perk-Rocky tab listed Woodjam's IP warnings. Each tab keeps its own.
// onSwitch: for what else the switch resets. A pure pair for the test: tabNotices.
export function tabNoticesSwitch(stash, from, to, current) {
  stash.set(from, current);
  const back = stash.get(to) || [];
  stash.delete(to);
  return back;
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
  return [notices, setNotices];
}
