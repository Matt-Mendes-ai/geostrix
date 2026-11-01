import React, { useMemo, useState } from "react";
import { RASTER_RAMPS, DEFAULT_RASTER_STYLE, rasterColourFields, rasterRange } from "../lib/rasterColour.js";
import { b64ToF32 } from "../lib/inversion.js";
import { PALETTES } from "../lib/layers.js";
import { t as tr } from "../lib/i18n.js";

// TASKS.csv #1236 — ramp, stretch, typed range and inverted ramp for a raster that kept its values, and a bar with the value range
const fmt = (v) => (v == null || !Number.isFinite(v) ? "—" : Number(v.toPrecision(4)).toLocaleString());
export default function RasterColourControls({ raster: r, onUpdate, inputStyle }) {
  const style = r.colourStyle || DEFAULT_RASTER_STYLE;
  const values = useMemo(() => b64ToF32(r.grid.values), [r.grid.values]);
  const range = r.colourRange || (() => { const { lo, hi } = rasterRange(values, style); return [lo, hi]; })();
  const [typed, setTyped] = useState({ min: "", max: "" });
  const apply = (patch) => {
    const next = { ...style, ...patch };
    onUpdate(r.id, rasterColourFields(values, r.grid.nx, r.grid.ny, next));
  };
  const row = { display: "flex", alignItems: "center", gap: 6, marginTop: 5 };
  const lbl = { color: "var(--color-text-faint)", width: 46, flexShrink: 0 };
  const commit = (key, text) => {
    const v = Number(text);
    if (text === "" || !Number.isFinite(v)) return;
    const min = key === "min" ? v : style.min ?? range[0], max = key === "max" ? v : style.max ?? range[1];
    if (max > min) apply({ stretch: "custom", min, max });
  };
  const stops = r.colourStops || [];
  return (
    <div style={{ marginTop: 7 }}>
      <div style={row}>
        <span style={lbl}>{tr("Ramp")}</span>
        <select value={style.palette} aria-label={tr("Colour ramp of \"{name}\"", { name: r.name })} onChange={(e) => apply({ palette: e.target.value })} style={inputStyle}>
          {RASTER_RAMPS.map((k) => <option key={k} value={k}>{PALETTES[k].label.split(" — ")[0]}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0, color: "var(--color-text-caption)" }}><input type="checkbox" checked={!!style.invert} onChange={(e) => apply({ invert: e.target.checked })} />{tr("Invert")}</label>
      </div>
      <div style={row}>
        <span style={lbl}>{tr("Stretch")}</span>
        <select value={style.stretch} aria-label={tr("Colour stretch of \"{name}\"", { name: r.name })} onChange={(e) => { const stretch = e.target.value; apply(stretch === "custom" ? { stretch, min: range[0], max: range[1] } : { stretch }); }} style={inputStyle}>
          <option value="p2-98">{tr("2-98% percentile clip")}</option>
          <option value="linear">{tr("Linear min-max")}</option>
          <option value="equalise">{tr("Histogram equalized")}</option>
          <option value="custom">{tr("Typed range")}</option>
        </select>
      </div>
      {style.stretch === "custom" && (
        <div style={row}>
          <span style={lbl}>{tr("Range")}</span>
          {["min", "max"].map((k) => (
            <input key={`${k}${style[k]}`} type="number" step="any" aria-label={k === "min" ? tr("Lowest value of the ramp") : tr("Highest value of the ramp")} defaultValue={style[k] ?? ""} onChange={(e) => setTyped((p) => ({ ...p, [k]: e.target.value }))}
              onBlur={() => commit(k, typed[k])} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} style={{ ...inputStyle, minWidth: 0 }} />
          ))}
        </div>
      )}
      {stops.length > 1 && (
        <div style={{ marginTop: 6 }}>
          <div aria-hidden="true" style={{ height: 8, borderRadius: 2, background: `linear-gradient(to right, ${stops.map((s) => s.color).join(", ")})` }} />
          <div dir="ltr" style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-xs)", color: "var(--color-text-caption)", marginTop: 2 }}><span>{fmt(range[0])}</span>{style.stretch === "equalise" && <span>{tr("equalized: colour does not scale with value")}</span>}<span>{fmt(range[1])}</span></div>
        </div>
      )}
      {r.grid.averagedBy > 1 && r.colourStyle && <div style={{ marginTop: 4, fontSize: "var(--font-size-xs)", color: "var(--color-text-caption)", lineHeight: 1.35 }}>{tr("Drawn from the kept values, where every {n} × {n} pixels were averaged, so this image is coarser than the imported one.", { n: r.grid.averagedBy })}</div>}
    </div>
  );
}
