import { useRef } from "react";

// TASKS.csv #2769 (follow-up, the heap check) — a callback whose identity never changes and which always runs the latest render's function.
// Why not useCallback(fn, deps): V8 keeps ONE scope object per call of a component function for every variable any closure made in that
// call uses, so a memoized callback keeps alive everything its render's closures captured — in StoreProvider that is every project field
// of that render. A callback memoized on deps that stayed the same while a big map layer, raster or block model came and went
// (switchToTab: activeTabDirty, workspaceTabs, activeTabId) kept the removed 50 MB layer alive until the next Save or tab change. Here the
// stable function is made once, in this hook's own scope (it sees only `ref`), and each render replaces ref.current, so only the current
// render's scope is held. Like the liveRef pattern in store.jsx, ref.current is assigned during render: current by the time a handler runs.
export function useLatestCallback(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  const stable = useRef(null);
  if (!stable.current) stable.current = (...args) => ref.current(...args);
  return stable.current;
}
