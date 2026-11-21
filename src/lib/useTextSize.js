// TASKS.csv #3900 — the text size setting as a hook: [size, setSize], and every component using it re-renders when it changes
// (the status bar's "Aa" control, the ribbon and the top row's fit, the hole list's row height). The state is lib/textSize.js.
import { useSyncExternalStore } from "react";
import { textSize, setTextSize, subscribeTextSize } from "./textSize.js";

export function useTextSize() {
  return [useSyncExternalStore(subscribeTextSize, textSize, textSize), setTextSize];
}
