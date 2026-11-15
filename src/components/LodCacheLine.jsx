// TASKS.csv #3252 phase 1 (Matt's decision 1) — the detail tiles kept on this computer: how much they take against the 2 GB cap, and a Clear
// button. Shown in the raster pane when a raster has detail tiles, or tiles are on disk.
import React, { useEffect, useState } from "react";
import { t as tr } from "../lib/i18n.js";
import { DISK_CAP_BYTES } from "../lib/lodTiles.js";
import LodOfflineDownload from "./LodOfflineDownload.jsx"; // TASKS.csv #3252 phase 4

const mb = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${Math.round(b / 1024 ** 2).toLocaleString()} MB` : `${Math.round(b / 1024).toLocaleString()} KB`);

export default function LodCacheLine({ hasLod, rasters = [] }) { // rasters: TASKS.csv #3252 phase 4 (Download for offline use)
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => import("../lib/lodTileStore.js").then((m) => m.lodTileStats()).then(setStats).catch(() => {});
  useEffect(() => { refresh(); const id = setInterval(refresh, 15000); return () => clearInterval(id); }, []);
  if (!hasLod && !(stats?.count > 0)) return null;
  const clear = async () => {
    setBusy(true);
    try {
      const [s, l] = await Promise.all([import("../lib/lodTileStore.js"), import("../lib/lodTileLoader.js")]);
      await s.clearLodTiles(); l.forgetLodTiles();
    } finally { setBusy(false); refresh(); }
  };
  return (
    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "6px 0", lineHeight: 1.4, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}
      title={tr("Imagery fetched with a source (NAIP) shows finer detail where the Maps plan looks. The detail read is kept on this computer, up to 2 GB, so it shows again without a connection; the project file keeps only the fetched picture.")}>
      <span>{tr("Detail tiles on this computer: {size} of {cap} ({n} tiles)", { size: mb(stats?.bytes || 0), cap: mb(DISK_CAP_BYTES), n: (stats?.count || 0).toLocaleString() })}</span>
      <button type="button" onClick={clear} disabled={busy || !(stats?.count > 0)} style={{ fontSize: "var(--font-size-xs)", background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: 0 }}>{tr("Clear")}</button>
      {hasLod && <LodOfflineDownload rasters={rasters} usedBytes={stats?.bytes || 0} onDone={refresh} />}
    </div>
  );
}
