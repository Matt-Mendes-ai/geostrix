import React, { useEffect, useState } from "react";
import { getCachedTile, fetchAndCacheTile } from "../lib/tileCache.js";

// TASKS.csv #237 sub-item (5) — drop-in replacement for a plain `<img src={tileUrlFor(...)}>` tile,
// used by both LocatorMap.jsx and BasemapView.jsx. Cache-first, network-fallback, and — the key part —
// never SLOWER than the plain <img> it replaces on the common online path: an IndexedDB miss sets the
// network URL immediately (same as before), then fetches+caches in the background for next time. Only
// an actual cache HIT (a tile already seen, or pre-downloaded via BasemapView's offline-area button)
// changes anything the user can see, by working the same when the network request would otherwise fail.
export default function CachedTile({ layerId, z, x, y, url, style, ...imgProps }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    setSrc(null);
    if (!url) return undefined;
    (async () => {
      const cached = await getCachedTile(layerId, z, x, y);
      if (cancelled) return;
      if (cached) {
        objectUrl = URL.createObjectURL(cached);
        setSrc(objectUrl);
        return;
      }
      // Not cached yet: show the live network URL right away (identical to the old plain <img>
      // behavior — no extra delay), and separately fetch+cache a copy in the background so this
      // tile is available offline next time. The two requests aren't shared (the <img> uses the
      // browser's own HTTP cache for its request, this uses fetch()) but both hit the same CDN URL,
      // so in practice the second one is usually a cheap HTTP-cache hit, not a full re-download.
      setSrc(url);
      fetchAndCacheTile(layerId, z, x, y, url);
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [layerId, z, x, y, url]);

  return <img src={src || undefined} style={style} {...imgProps} />;
}
