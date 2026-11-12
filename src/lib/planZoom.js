// TASKS.csv #2657 (follow-up of #2125) — 'Zoom to' on a raster / boundary / claim card in the Maps tab: the card asks the Maps plan to frame a
// box (a layer left out of Fit, 30 km from the drilling, could not be reached on the plan). A window event, as menuRequests.js does for
// module actions; the plan listens while it is mounted.
import { useEffect, useRef } from "react";

const EVENT = "geostrix-plan-zoom";

// [x0, y0, x1, y1] of a set of polylines [[{x, y}]], or null
export function polylinesBox(polylines) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pl of polylines || []) for (const p of pl || []) {
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue;
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

// the plan's view framing a box in a w x h pixel frame, with the plan's own 8 % margin (MapsPlanView fit); a point or a line gets 200 m
export function viewForBox([x0, y0, x1, y1], w, h) {
  const bw = Math.max(x1 - x0, 200), bh = Math.max(y1 - y0, 200);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, mPerPx: Math.max(bw / Math.max(1, w), bh / Math.max(1, h)) * 1.08 };
}

// TASKS.csv #2793 — a card on another tab (Surface Geology's map layers) switches to Maps and asks at once: the plan is not mounted yet, so
// the request is kept a few seconds for the plan that mounts next
let pending = null; // { bbox, at }
const PENDING_MS = 5000;
export function requestPlanZoom(bbox) {
  if (!bbox || !bbox.every(Number.isFinite)) return;
  pending = { bbox, at: Date.now() };
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { bbox } }));
}

export function usePlanZoom(handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const on = (e) => { pending = null; ref.current(e.detail.bbox); };
    window.addEventListener(EVENT, on);
    if (pending && Date.now() - pending.at < PENDING_MS) { const b = pending.bbox; pending = null; ref.current(b); } // #2793 — asked before this plan mounted
    return () => window.removeEventListener(EVENT, on);
  }, []);
}
