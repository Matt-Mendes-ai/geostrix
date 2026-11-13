// TASKS.csv #3063 — the vertical exaggeration suggested once per project on this computer (localStorage), after its holes are first built,
// while the view is at 1x: 'This project is 144 times wider than its holes are deep …'. Nothing is changed for the user (#2934's control).
import { useEffect, useRef } from "react";
import { notice } from "../../lib/notices.js";
import { veSuggestion } from "../../lib/viewer/veSuggest.js";

const key = (k) => `geostrix.veSuggested.${k}`;

export function useVeSuggestion({ tracesRef, tracesSeq, ve, projectKey, setNotices }) {
  const done = useRef(new Set());
  useEffect(() => {
    if (!projectKey || ve > 1 || !tracesRef.current?.length || done.current.has(projectKey)) return;
    done.current.add(projectKey);
    try { if (localStorage.getItem(key(projectKey))) return; } catch { /* storage off: once per session */ }
    const s = veSuggestion(tracesRef.current);
    if (!s) return;
    try { localStorage.setItem(key(projectKey), "1"); } catch { /* storage off */ }
    setNotices((p) => [...p, notice("This project is {r} times wider than its holes are deep ({e} km of holes over {d} m), so at Fit a hole is a few pixels long. A vertical exaggeration shows the logs and grades: VE {v}x in the select under Fit, at the right of the view.", { r: Math.round(s.ratio), e: (s.extentM / 1000).toFixed(1), d: Math.round(s.depthM), v: s.ve })]);
  }, [tracesSeq, projectKey]);
}
