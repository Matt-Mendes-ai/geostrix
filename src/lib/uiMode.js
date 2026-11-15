// TASKS.csv #748 — Simple / Advanced switch. A GeoStrix user: the interface "feels like an expensive software package
// ... and is overwhelming"; Matt chose a global switch. In Simple mode each ribbon shows only its basic tools (those
// not marked `advanced`); the ribbon then ends with "N more tools", which switches to Advanced, so nothing is out of
// reach. Remembered on this computer. A fresh install starts Simple; a computer that has used GeoStrix before (any
// GeoStrix key in local storage) starts Advanced, so an update never hides tools someone already uses.
import { createContext, useContext } from "react";

export const UI_MODE_KEY = "geostrix.uiMode";
export const UiModeContext = createContext({ mode: "advanced", setMode: () => {} });
export const useUiMode = () => useContext(UiModeContext);

export function initialUiMode(storage = typeof localStorage !== "undefined" ? localStorage : null) {
  try {
    const v = storage?.getItem(UI_MODE_KEY);
    if (v === "simple" || v === "advanced") return v;
    const keys = [];
    for (let i = 0; i < (storage?.length || 0); i++) keys.push(storage.key(i));
    const mode = keys.some((k) => /^(geostrix|geox)/i.test(k || "")) ? "advanced" : "simple";
    // TASKS.csv #3618 (Fireweed rehearsal) — the default, once applied, is the saved choice: the Simple default was never stored, so the first thing the app
    // itself wrote (a section fit, a language, a sidebar width) was a 'geostrix' key that turned the next start into Advanced for someone who never touched the switch
    try { storage?.setItem(UI_MODE_KEY, mode); } catch { /* private window: per session only */ }
    return mode;
  } catch { return "advanced"; }
}
export function saveUiMode(mode, storage = typeof localStorage !== "undefined" ? localStorage : null) {
  try { storage?.setItem(UI_MODE_KEY, mode); } catch { /* private window: per session only */ }
}
