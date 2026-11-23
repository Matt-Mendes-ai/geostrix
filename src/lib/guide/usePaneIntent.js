// TASKS.csv #4033 — the hook a modelling pane uses to read its intent (lib/guide/paneIntent.js): on opening, and when one arrives while it is open.
// pane: the pane's id, or null to take none; apply(intent) runs at most once per intent.
import { useEffect, useRef, useState } from "react";
import { takePaneIntent, subscribePaneIntent } from "./paneIntent.js";

export function usePaneIntent(pane, apply) {
  const latest = useRef(apply);
  latest.current = apply;
  const [arrived, setArrived] = useState(0);
  useEffect(() => subscribePaneIntent(() => setArrived((n) => n + 1)), []);
  useEffect(() => {
    if (!pane) return;
    const intent = takePaneIntent(pane);
    if (intent) latest.current(intent);
  }, [pane, arrived]);
}
