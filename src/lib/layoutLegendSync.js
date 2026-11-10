// TASKS.csv #2471 (review #2325, WA uranium) — a legend bound to a viewport kept "U (ppm)" and U's classes after its viewport
// was refreshed onto Th, with no word on the sheet. A refreshed viewport carries capturedAt (store.jsx); a legend loaded from it
// remembers which capture (loadedCapturedAt) and the rows it got (loadedItems). After a refresh, a legend whose rows are still
// the loaded ones reloads by itself; one edited by hand is flagged instead, so the edit is never thrown away.

const itemKey = (it) => JSON.stringify(it ?? null); // a row is [label, colour, options?] (legendGroupsToItems)
export const sameLegendItems = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((it, i) => itemKey(it) === itemKey(b[i]));

// "current": in step with its viewport; "reload": the viewport was re-captured and the rows were not edited, so it can reload;
// "stale": the viewport was re-captured and the rows differ from what was loaded (edited by hand, or loaded before #2471);
// null: not bound to a captured viewport (nothing to compare)
export function legendSyncState(legend, vp) {
  if (!legend || legend.type !== "legend" || !legend.boundViewportId || !vp || vp.type !== "viewport" || vp.refreshing) return null;
  if (!vp.capturedAt) return null; // captured before #2471: nothing to compare with
  if (legend.loadedCapturedAt === vp.capturedAt) return "current";
  if (!legend.loadedCapturedAt) return legend.items?.length ? "stale" : null; // never loaded from a capture
  return sameLegendItems(legend.items, legend.loadedItems) ? "reload" : "stale";
}

// every bound legend out of step with its viewport, across pages: [{ legend, vp, page }]
export function staleBoundLegends(pages) {
  const out = [];
  for (const p of pages || []) {
    const els = p?.elements || [];
    const byId = new Map(els.map((e) => [e.id, e]));
    for (const e of els) {
      const vp = e.type === "legend" ? byId.get(e.boundViewportId) : null;
      if (legendSyncState(e, vp) === "stale") out.push({ legend: e, vp, page: p });
    }
  }
  return out;
}
