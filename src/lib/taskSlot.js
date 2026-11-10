// TASKS.csv #2379 (review #2325, WA uranium) — the status bar has one task slot. A halo built during an 11-unit GemPy stack replaced the
// stack's progress and Cancel ({ label, pct: 20 }, then null): the stack ran nine more minutes with no way to stop it. A tool's own entry:
// its progress never covers another task that can be cancelled, and it clears only itself (as the GemPy run already did). Pure.
// TASKS.csv #2383 — a GemPy run's progress: a ramp toward 90 % for the first 10 s, then an indeterminate bar with the time elapsed (the
// solver reports nothing in between, so a percentage after that is invented). -> the next { ...cur }
export function rampProgress(cur, elapsedS) {
  if (elapsedS < 10) return { ...cur, pct: Math.min(90, (cur.pct || 0) + 6 + Math.random() * 8) };
  return { ...cur, indeterminate: true, elapsedS: Math.round(elapsedS) };
}

export function taskSlot(setTaskProgress, label) {
  return {
    set: (pct, onCancel) => setTaskProgress?.((cur) => (cur && cur.onCancel && cur.label !== label ? cur : { label, pct, ...(onCancel ? { onCancel } : {}) })),
    clear: () => setTaskProgress?.((cur) => (cur && cur.label === label ? null : cur)),
  };
}
