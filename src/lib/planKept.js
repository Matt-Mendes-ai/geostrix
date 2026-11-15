// TASKS.csv #3604 (Fireweed rehearsal, Macpass) — the Maps plan forgot its set-up on every tab switch: the collar colouring, the hole ids and the
// zoom were back to 'One colour', no labels and the whole project after a visit to Layout (the tab unmounts the plan). The choices are kept for
// the session, per project (its name and its collar count), outside the component; not saved in the project file (a view preference, like the
// 3D view's own camera). useKept(scope, name, initial) is useState that starts from the kept value.
import { useCallback, useState } from "react";

const kept = new Map();
export const planScope = (project, collars) => `${project?.name || ""}|${collars?.length || 0}`;
export const keptGet = (scope, name) => kept.get(`${scope}|${name}`);
export const keptSet = (scope, name, v) => { kept.set(`${scope}|${name}`, v); if (kept.size > 400) kept.delete(kept.keys().next().value); };
export function useKept(scope, name, initial) {
  const [v, setV] = useState(() => { const k = keptGet(scope, name); return k !== undefined ? k : typeof initial === "function" ? initial() : initial; });
  const set = useCallback((next) => setV((p) => { const n = typeof next === "function" ? next(p) : next; keptSet(scope, name, n); return n; }), [scope, name]);
  return [v, set];
}
