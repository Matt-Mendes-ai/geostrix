import React, { useState } from "react";
import { Check } from "lucide-react";
import { BASE_LAYERS } from "../lib/baseLayers.js";

// Small base-layer switcher — the "layers" stack icon openstreetmap.org itself shows to switch
// between Standard/Cycle/Transport/Tracestrack Topo — reused by both LocatorMap.jsx (small corner
// mosaic) and BasemapView.jsx (full map / SRTM picker) so the two stay in sync (same localStorage-
// persisted choice, see baseLayers.js).
export default function LayerPicker({ layerId, onSelectLayer, tracestrackKey, onSaveKey, onClose, openUpward = false }) {
  const [keyDraft, setKeyDraft] = useState(tracestrackKey || "");
  return (
    <div style={{ ...panelStyle, ...(openUpward ? { top: "auto", bottom: "100%", marginTop: 0, marginBottom: 6 } : {}) }} onClick={(e) => e.stopPropagation()}>
      <div style={{ fontSize: 10.5, color: "#94a1b0", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Base layer</div>
      {BASE_LAYERS.map((l) => (
        <div key={l.id} onClick={() => onSelectLayer(l.id)} style={{ ...rowStyle, ...(layerId === l.id ? rowActiveStyle : {}) }}>
          <span style={{ width: 14, display: "inline-flex" }}>{layerId === l.id && <Check size={12} />}</span>
          <span style={{ flex: 1 }}>{l.label}</span>
          {l.needsKey && <span style={{ fontSize: 9, color: "#94a1b0" }}>key</span>}
        </div>
      ))}
      {layerId === "tracestrack" && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e6e8eb" }}>
          <div style={{ fontSize: 10, color: "#94a1b0", marginBottom: 5, lineHeight: 1.4 }}>
            Tracestrack Topo needs a free personal API key (non-commercial tier) —{" "}
            <a href="https://tracestrack.com/" target="_blank" rel="noreferrer" style={{ color: "#4a7fd6" }}>get one here</a>.
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <input
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="Paste API key…"
              style={{ flex: 1, fontSize: 11, padding: "4px 6px", border: "1px solid #d9dce1", borderRadius: 4 }}
            />
            <button onClick={() => onSaveKey(keyDraft)} style={saveBtnStyle}>Save</button>
          </div>
          {!tracestrackKey && <div style={{ fontSize: 9.5, color: "#a95a3a", marginTop: 4 }}>No key saved yet — showing Standard until one is set.</div>}
        </div>
      )}
    </div>
  );
}

const panelStyle = {
  position: "absolute", top: "100%", marginTop: 6, right: 0, width: 220,
  background: "#ffffff", border: "1px solid #c7ccd3", borderRadius: 8,
  boxShadow: "0 6px 18px rgba(0,0,0,0.22)", padding: 10, zIndex: 20,
};
const rowStyle = {
  display: "flex", alignItems: "center", gap: 6, padding: "5px 6px", borderRadius: 5,
  fontSize: 11.5, color: "#3a4048", cursor: "pointer",
};
const rowActiveStyle = { background: "#eef3fb", color: "#1a2028", fontWeight: 600 };
const saveBtnStyle = {
  padding: "4px 8px", fontSize: 11, borderRadius: 4, border: "1px solid #2f6fe0",
  background: "#2f6fe0", color: "#ffffff", cursor: "pointer",
};
