import { useEffect, useRef, useState, useCallback } from "react";

// TASKS.csv #222 (QGIS/Micromine/mineral-exploration-specialist audit finding, all three independently
// measured the same thing) — several report/results panels rendered every row's DOM unconditionally
// (Data QC: 26,762 DOM nodes at 3000 issues; report modals: 8060+ DOM nodes; the real 37-hole Harry
// property set's own QC pass: 12,819 nodes), with no cap/paging/virtualization at all. No windowing
// library is installed in this project (kept dependency-light on purpose, same reasoning as the
// hand-rolled shapefile/GeoPackage parsers already in lib/) — this is a small, dependency-free
// fixed-row-height windowing hook instead of pulling one in.
//
// Usage: const { scrollRef, startIndex, endIndex, topPad, bottomPad, onScroll } = useVirtualRows(items.length, rowHeight);
// then render only items.slice(startIndex, endIndex), with topPad/bottomPad spacer elements (or spacer
// <tr>s for a <table>) above/below them inside a scroll container carrying `ref={scrollRef}` and
// `onScroll={onScroll}`. Fixed row height only (every list this pass applies it to already renders
// each row at a uniform height) — a variable-height version would need a measurement pass this doesn't
// attempt, out of scope for what these specific panels need.
export function useVirtualRows(count, rowHeight, { overscan = 8, containerHeight = 400 } = {}) {
  const scrollRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(containerHeight);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportH(el.clientHeight || containerHeight);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect?.height;
      if (h) setViewportH(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = useCallback((e) => setScrollTop(e.target.scrollTop), []);

  // Clamp startIndex against the CURRENT count, not just 0 — if `count` shrinks (e.g. a search
  // narrowing the list) while scrolled down, the container's stale scrollTop can be well past the new,
  // shorter content's total height. Without this clamp, startIndex could land past count entirely,
  // making endIndex < startIndex and silently rendering zero rows even though real matches exist
  // (caught live: searching a 4961-row attribute table while scrolled near the bottom showed 0 results
  // for a query that actually matched several rows, until this clamp was added).
  const rawStart = Math.floor(scrollTop / rowHeight) - overscan;
  const startIndex = Math.max(0, Math.min(rawStart, Math.max(0, count - 1)));
  const visibleCount = Math.ceil(viewportH / rowHeight) + overscan * 2;
  const endIndex = Math.min(count, startIndex + visibleCount);
  const topPad = startIndex * rowHeight;
  const bottomPad = Math.max(0, (count - endIndex) * rowHeight);

  return { scrollRef, onScroll, startIndex, endIndex, topPad, bottomPad };
}
