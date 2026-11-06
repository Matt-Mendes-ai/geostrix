// TASKS.csv #1500 (Lawyers' open) — the 3D scene was built twice on every project open, ~1 s each on Lawyers. The effects that
// restore a project's view state (the viewer UI state: numeric ranges, symbology; the custom-layer groups) run in the same commit
// as the big geometry build, BEFORE it, and only SCHEDULE their state: the build then ran on the stale values and ran again on the
// next render. mark() is called by such an effect when it has scheduled a state change the build depends on; skip() in the build
// effect is true only within that same commit, so that build is skipped and the next render's (with every restored value) is the
// one that runs. A mark never outlives its commit: the next render bumps the counter, so a mark left by an effect whose commit had
// no build cannot swallow a later one.
import { useMemo, useRef } from "react";

export function useBuildDefer() {
  const seq = useRef(0), marked = useRef(-1);
  seq.current++; // once per render: every effect of one commit reads the same value
  return useMemo(() => ({ mark: () => { marked.current = seq.current; }, skip: () => marked.current === seq.current }), []);
}

// the same rule without React, for the tests: render() starts a new commit
export function buildDeferModel() {
  let seq = 0, marked = -1;
  return { render: () => { seq++; }, mark: () => { marked = seq; }, skip: () => marked === seq };
}
