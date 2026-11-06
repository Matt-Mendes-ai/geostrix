// TASKS.csv #1500 (Lawyers' open) — the 3D scene was built twice on every project open, ~1 s each on Lawyers. The effects that
// restore a project's view state (the viewer UI state: numeric ranges, symbology; the custom-layer groups) run in the same commit
// as the big geometry build, BEFORE it, and only SCHEDULE their state: the build then ran on the stale values and ran again on the
// next render. mark() is called by such an effect when it has scheduled a state change the build depends on; skip() in the build
// effect is true only within that same commit, so that build is skipped and the next render's (with every restored value) is the
// one that runs. A mark never outlives its commit: the next render bumps the counter, so a mark left by an effect whose commit had
// no build cannot swallow a later one.
// TASKS.csv #1980 — the big build is also what sets the scene origin, and the effects that place objects by that origin (block
// models, drapes, terrain, map layers, planned holes ...) ran in the deferred commit with the PREVIOUS origin and were never run
// again (their own inputs had not changed), so a project's block models were built kilometres off screen. `round` goes up in the
// render after a marked commit: those effects skip the marked commit and list `round` in their dependencies, so they run once,
// after the big build, with the new origin. mark() also schedules a render, so that next render always comes.
import { useMemo, useRef, useState } from "react";

export function useBuildDefer() {
  const seq = useRef(0), marked = useRef(-1), rounds = useRef(0);
  const [, poke] = useState(0);
  if (marked.current === seq.current) rounds.current++; // the commit before this render was marked
  seq.current++; // once per render: every effect of one commit reads the same value
  return useMemo(() => ({
    mark: () => { if (marked.current !== seq.current) poke((n) => n + 1); marked.current = seq.current; },
    skip: () => marked.current === seq.current,
    get round() { return rounds.current; },
  }), []);
}

// the same rule without React, for the tests: render() starts a new commit
export function buildDeferModel() {
  let seq = 0, marked = -1, rounds = 0;
  return { render: () => { if (marked === seq) rounds++; seq++; }, mark: () => { marked = seq; }, skip: () => marked === seq, get round() { return rounds; } };
}
