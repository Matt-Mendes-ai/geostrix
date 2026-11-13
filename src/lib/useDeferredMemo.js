// TASKS.csv #2948 (review #2876, WA iron) — a computation of a second or more (half a million log readings paired with their codes or assays)
// froze the pane on the choice that started it, with nothing on screen to say why. With `defer` true it runs just after the next paint instead,
// so the pane can first say what it is doing; with `defer` false (small data) it is an ordinary memo and nothing flickers.
// -> { value, pending }: while pending, value is undefined (never the previous choice's answer under the new choice's label).
import { useEffect, useMemo, useState } from "react";

export const DEFER_ROWS = 50000; // below this the work takes well under a tenth of a second

export function useDeferredMemo(compute, deps, defer) {
  const token = useMemo(() => ({}), [defer, ...deps]); // a new identity whenever the inputs change
  const sync = useMemo(() => (defer ? undefined : compute()), [token]);
  const [done, setDone] = useState({ token: null, value: undefined });
  useEffect(() => {
    if (!defer) return undefined;
    const t = setTimeout(() => setDone({ token, value: compute() }), 30); // a timer, not requestAnimationFrame: a hidden window pauses rAF
    return () => clearTimeout(t);
  }, [token]);
  if (!defer) return { value: sync, pending: false };
  return done.token === token ? { value: done.value, pending: false } : { value: undefined, pending: true };
}
