// TASKS.csv #2043 / #2213 (reviews #2013 Woodjam, #2174 WA gold) — a right-button drag did not pan: the view stayed put and the context
// menu opened where the button went down, then swallowed the next clicks. Geologists coming from Leapfrog / Micromine / QGIS 3D pan with
// a right-drag. Now a right-drag pans, and the menu opens only on a clean right-click (the pointer moved no more than `threshold` px).
//
// The browser's contextmenu event comes AFTER the release on Windows and BEFORE it (on the press) on macOS / Linux, so the tracker
// answers the menu event with: "open" (a clean click already released, or no right drag at all), "skip" (a right drag just ended), or
// "defer" (the button is still down: decide on release; up() then says whether the deferred menu should open). Pure: no DOM.
export function rightDragTracker(threshold = 4, windowMs = 600) {
  let s = null, last = null;
  return {
    down(x, y) { s = { x, y, moved: 0, pending: null }; },
    move(x, y) { if (s) s.moved = Math.max(s.moved, Math.hypot(x - s.x, y - s.y)); },
    active: () => !!s,
    // the contextmenu event: -> "open" | "skip" | "defer" (with `at`, the event's client point, kept for the release)
    onMenu(now, at = null) {
      if (s) { s.pending = at; return "defer"; }
      const l = last; last = null;
      return l && now - l.at < windowMs && l.moved > threshold ? "skip" : "open";
    },
    // the release: -> the deferred menu point to open now ({ clientX, clientY }), or null
    up(now) {
      const r = s; s = null;
      if (!r) return null;
      last = { moved: r.moved, at: now };
      return r.pending && r.moved <= threshold ? r.pending : null;
    },
  };
}
