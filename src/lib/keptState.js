// TASKS.csv #1284, #1174 — App mounts Geochem, Geophysics, Maps and Layout only while their tab is active, so a panel's useState was thrown
// away on every tab switch: the diagram and colour mode, a filled-in inversion form, a DC/IP result. A panel's choices now live here,
// per project: a new or reopened project starts clean, and a project tab gets its own back when it returns.
import { useEffect, useRef, useState } from "react";

const MAX_SCOPES = 8; // open project tabs and recent projects; the oldest is forgotten
const scopes = new Map();

export function keptIn(scope) {
  let s = scopes.get(scope);
  if (!s) {
    s = new Map();
    scopes.set(scope, s);
    if (scopes.size > MAX_SCOPES) scopes.delete(scopes.keys().next().value);
  }
  return s;
}

const start = (scope, key, initial) => {
  const s = keptIn(scope);
  return s.has(key) ? s.get(key) : (typeof initial === "function" ? initial() : initial);
};

// useState that survives the panel's unmount. scope: the project (see scopeOf); key: unique across panels
export function useKeptState(scope, key, initial) {
  const [value, setValue] = useState(() => start(scope, key, initial));
  const was = useRef(scope);
  if (was.current !== scope) { // a different project in a panel that stayed open
    was.current = scope;
    const next = start(scope, key, initial);
    setValue(next);
  }
  useEffect(() => { keptIn(scope).set(key, value); }, [scope, key, value]);
  return [value, setValue];
}

// The store's getProjectToken() -> the scope of the project now in this tab
export const scopeOf = (token) => `${token?.tabId}:${token?.seq}`;
