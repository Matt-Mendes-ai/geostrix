// TASKS.csv #3668 — the interval tubes' size choice in the Figure overlay popover, saved with the view (figureOverlay.tubeSize { mode, px }): Auto (never thinner than 1.5 px:
// the look since #3643), the true radius, at least N px, or a fixed N px (lib/viewer/tubeShader.js tubeSizeUniforms). One choice for every hole layer (the tubes share one shader).
// TASKS.csv #3876 (#3668's open point) — and per hole layer: a Layer list (All hole layers, then each interval layer with data and each custom layer); a
// layer's own choice is kept in tubeSize.byLayer[key] ('Same as all layers' removes it). The tubes of each layer use that layer's uniforms (tubeShader.js).
import React, { useMemo, useState } from "react";
import { t as tr } from "../../lib/i18n.js";
import { useStore } from "../../lib/store.jsx";
import { LAYER_META } from "../../lib/layers.js";
import NumberInput from "../../components/NumberInput.jsx"; // TASKS.csv #3926
// TASKS.csv #3926 — NumberInput hands back a number (null when emptied); the handlers here read e.target.value, so it goes back to them as text
const asEvent = (fn) => (v) => fn({ target: { value: v == null ? "" : String(v) } });

export default function TubeSizeControl({ figureOverlay, setFigureOverlay }) {
  const all = figureOverlay.tubeSize || { mode: "auto" };
  const store = useStore() || {};
  const [layer, setLayer] = useState("");
  const layerList = useMemo(() => [
    ...Object.entries(LAYER_META).filter(([k, m]) => m.kind === "interval" && (store.layers?.[k] || []).length > 0).map(([k, m]) => ({ key: k, name: tr(m.label) })),
    ...(store.customLayers || []).filter((c) => c?.id != null).map((c) => ({ key: String(c.id), name: c.name || String(c.id) })),
  ], [store.layers, store.customLayers]);
  const ts = layer ? all.byLayer?.[layer] || { mode: "same" } : all;
  const set = (v) => setFigureOverlay((f) => {
    const cur = f.tubeSize || { mode: "auto" };
    if (!layer) return { ...f, tubeSize: { ...v, ...(cur.byLayer ? { byLayer: cur.byLayer } : {}) } };
    const byLayer = { ...(cur.byLayer || {}) };
    if (v.mode === "same") delete byLayer[layer]; else byLayer[layer] = v;
    const { byLayer: _old, ...rest } = cur;
    return { ...f, tubeSize: Object.keys(byLayer).length ? { ...rest, byLayer } : rest };
  });
  const needsPx = ts.mode === "atLeast" || ts.mode === "fixed";
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", marginBottom: 8 }} title={tr("How the drilled intervals' tubes are drawn from far out. Auto never draws them thinner than 1.5 px; True radius draws them as thin as they really are; At least keeps a pixel floor you choose; Fixed draws every tube the same width on screen.")}>
      {tr("Interval tubes")}
      {layerList.length > 1 && <select aria-label={tr("Hole layer for the tube size")} value={layer} onChange={(e) => setLayer(e.target.value)} style={{ fontSize: "var(--font-size-sm)", padding: "2px 4px", maxWidth: 120 }}>
        <option value="">{tr("All hole layers")}</option>
        {layerList.map((l) => <option key={l.key} value={l.key}>{all.byLayer?.[l.key] ? tr("{layer} (its own)", { layer: l.name }) : l.name}</option>)}
      </select>}
      <select aria-label={tr("Interval tube size")} value={ts.mode || "auto"} onChange={(e) => set(e.target.value === "atLeast" || e.target.value === "fixed" ? { mode: e.target.value, px: ts.px > 0 ? ts.px : 3 } : { mode: e.target.value })} style={{ fontSize: "var(--font-size-sm)", padding: "2px 4px" }}>
        {layer && <option value="same">{tr("Same as all layers")}</option>}
        <option value="auto">{tr("Auto")}</option><option value="true">{tr("True radius")}</option><option value="atLeast">{tr("At least (px)")}</option><option value="fixed">{tr("Fixed (px)")}</option>
      </select>
      {needsPx && <NumberInput min={0.5} step={0.5} aria-label={tr("Tube width in pixels")} value={ts.px} onChange={asEvent((e) => { const v = Number(e.target.value); if (v > 0) set({ mode: ts.mode, px: v }); })} style={{ width: 56, fontSize: "var(--font-size-sm)" }} />}
    </label>
  );
}
