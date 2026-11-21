// TASKS.csv #3931 (Main: "so no import path is left") — the per-pane 'Import…' buttons: a file chosen in ANY file input while a project is coming
// forward (a tab switch expanding its tables, store.jsx projectLoading) acted on the tab being left: it saw an empty project, could ask the blocking
// 'this project is empty' CRS question and put its data in the wrong tab. One gate for all of them, mounted once in App: while a project loads, a
// window-level capture listener holds the file input's 'change' event (before React's own listener sees it); when the load ends the same input gets
// a fresh 'change', and React runs the pane's own handler with the CURRENT render's values — the project that came forward. An input gone meanwhile
// (its pane closed) is said, not silently dropped. -> { held: files waiting, lost: inputs closed before the load ended }
import { useEffect, useRef, useState } from "react";
import { useStore } from "./store.jsx";
import { shouldHold, releaseHeld } from "./importGateRule.js"; // the rule, outside React (tested)

export function useImportGate() {
  const { projectLoading, whenProjectLoaded } = useStore() || {};
  const loadingRef = useRef(false); loadingRef.current = !!projectLoading;
  const waitRef = useRef(whenProjectLoaded); waitRef.current = whenProjectLoaded;
  const [state, setState] = useState({ held: 0, lost: 0 });
  useEffect(() => {
    const released = new Set();
    const onChange = (e) => {
      const el = e.target;
      if (!shouldHold(el, loadingRef.current, released) || !waitRef.current) return;
      e.stopImmediatePropagation();
      setState((s) => ({ ...s, held: s.held + 1 }));
      waitRef.current().then(() => {
        const ok = releaseHeld(el, released);
        setState((s) => ({ held: Math.max(0, s.held - 1), lost: s.lost + (ok ? 0 : 1) }));
      });
    };
    window.addEventListener("change", onChange, true);
    return () => window.removeEventListener("change", onChange, true);
  }, []);
  return { ...state, clearLost: () => setState((s) => ({ ...s, lost: 0 })) };
}
