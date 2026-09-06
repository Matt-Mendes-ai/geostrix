import React, { useEffect, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { BASE_LAYERS } from "../lib/baseLayers.js";
import { getCacheStats, clearTileCache, formatCacheBytes } from "../lib/tileCache.js";

// Small base-layer switcher — the "layers" stack icon openstreetmap.org itself shows to switch
// between Standard/Cycle/Transport/Tracestrack Topo — reused by both LocatorMap.jsx (small corner
// mosaic) and BasemapView.jsx (full map / SRTM picker) so the two stay in sync (same localStorage-
// persisted choice, see baseLayers.js).
export default function LayerPicker({ layerId, onSelectLayer, tracestrackKey, onSaveKey, onClose, openUpward = false }) {
  const [keyDraft, setKeyDraft] = useState(tracestrackKey || "");
  // TASKS.csv #237 sub-item (5) — offline tile cache stats/clear, shown here since this is the one
  // panel every basemap-showing view (LocatorMap, BasemapView) already opens to touch layer settings.
  const [cacheStats, setCacheStats] = useState(null);
  useEffect(() => { getCacheStats().then(setCacheStats); }, []);
  const clearCache = () => { clearTileCache().then(() => getCacheStats().then(setCacheStats)); };
  return (
    <div style={{ ...panelStyle, ...(openUpward ? { top: "auto", bottom: "100%", marginTop: 0, marginBottom: 6 } : {}) }} onClick={(e) => e.stopPropagation()}>
      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Base layer</div>
      {BASE_LAYERS.map((l) => (
        <div key={l.id} onClick={() => onSelectLayer(l.id)} style={{ ...rowStyle, ...(layerId === l.id ? rowActiveStyle : {}) }}>
          <span style={{ width: 14, display: "inline-flex" }}>{layerId === l.id && <Check size={12} />}</span>
          <span style={{ flex: 1 }}>{l.label}</span>
          {l.needsKey && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>key</span>}
        </div>
      ))}
      {layerId === "tracestrack" && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--color-border-subtle)" }}>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 5, lineHeight: 1.4 }}>
            Tracestrack Topo needs a free personal API key (non-commercial tier) —{" "}
            <a href="https://tracestrack.com/" target="_blank" rel="noreferrer" style={{ color: "#4a7fd6" }}>get one here</a>.
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <input
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="Paste API key…"
              style={{ flex: 1, fontSize: "var(--font-size-sm)", padding: "4px 6px", border: "1px solid var(--color-border)", borderRadius: 4 }}
            />
            <button onClick={() => onSaveKey(keyDraft)} style={saveBtnStyle}>Save</button>
          </div>
          {!tracestrackKey && <div style={{ fontSize: "var(--font-size-xs)", color: "#a95a3a", marginTop: 4 }}>No key saved yet — showing Standard until one is set.</div>}
        </div>
      )}
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--color-border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }} title="Map tiles saved for offline use — see the download button on the full map view">
          Offline cache: {cacheStats ? `${cacheStats.count} tile${cacheStats.count === 1 ? "" : "s"} (${formatCacheBytes(cacheStats.bytes)})` : "…"}
        </span>
        {cacheStats && cacheStats.count > 0 && (
          <button onClick={clearCache} title="Clear the offline tile cache" style={{ ...iconOnlyBtnStyle }}><Trash2 size={12} /></button>
        )}
      </div>
    </div>
  );
}

const panelStyle = {
  position: "absolute", top: "100%", marginTop: 6, right: 0, width: 220,
  background: "var(--color-bg)", border: "1px solid var(--color-border-light)", borderRadius: 8,
  boxShadow: "0 6px 18px rgba(0,0,0,0.22)", padding: 10, zIndex: 20,
};
const rowStyle = {
  display: "flex", alignItems: "center", gap: 6, padding: "5px 6px", borderRadius: 5,
  fontSize: "var(--font-size-base)", color: "#3a4048", cursor: "pointer",
};
const rowActiveStyle = { background: "#eef3fb", color: "var(--color-text)", fontWeight: 600 };
const saveBtnStyle = {
  padding: "4px 8px", fontSize: "var(--font-size-sm)", borderRadius: 4, border: "1px solid var(--color-primary)",
  background: "var(--color-primary)", color: "var(--color-bg)", cursor: "pointer",
};
const iconOnlyBtnStyle = {
  width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
  borderRadius: 4, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-danger-icon)", cursor: "pointer", flexShrink: 0,
};
