// TASKS.csv #565 — menu / shortcut actions that a MODULE carries out (open its import dialog, start drawing a
// section). App switches to the right tab and calls requestModuleAction; the module handles it with
// useModuleAction. The request is remembered for a few seconds, so a module that mounts lazily after the switch
// still gets it. (A file dialog needs a user gesture: Electron delivers these menu items with one, see main.js.)
import { useEffect, useRef } from "react";

// TASKS.csv #917 — `payload`: data the action carries (a database table handed from the 3D View to Geochem)
let pending = null; // { action, payload, at }
const EVENT = "geostrix-module-action";

export function requestModuleAction(action, payload = null) {
  pending = { action, payload, at: Date.now() };
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { action, payload } }));
}

export function useModuleAction(actions, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  const key = actions.join("|");
  useEffect(() => {
    const list = key.split("|");
    const run = (a, payload) => { if (!list.includes(a)) return; pending = null; ref.current(a, payload); };
    // TASKS.csv #995 — an action that carries data (a database table, #917) waits up to 2 minutes for its lazily loaded
    // module, not 5 s: a cold Geochem chunk on a slow laptop could arrive after the window and the rows were lost
    if (pending && Date.now() - pending.at < (pending.payload != null ? 120000 : 5000)) run(pending.action, pending.payload);
    const on = (e) => run(e.detail.action, e.detail.payload);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [key]);
}
