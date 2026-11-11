// TASKS.csv #1136 — moved out of ViewerModule (loaded on first use, not at startup)
import React, { useState } from "react";
import { CLIP_KEYS, numericClip } from "../lib/numericClip.js"; // TASKS.csv #1699
import { minMax, classifyBreaks, paletteColorsHex, PALETTES, paletteShortName /* #1859 */, trimForBreaks, readableValues, classCountNote } from "../lib/layers.js"; // trimForBreaks: #1531; readableValues: #1422
import StopValueInput from "./StopValueInput.jsx"; // TASKS.csv #1422
import { activateOnKey } from "../lib/a11y.js";
import { t as tr } from "../lib/i18n.js";


// TASKS.csv #237 sub-item (3) — graduated/classed symbology editor for the numeric layers. Rendered
// inside the layer's existing expandable panel (which, for a numeric layer, previously showed only
// the sources list — `categories` is hard-coded empty for meta.numeric, so there was literally
// nothing symbology-related there before). Deliberately mirrors the geophys_pts/voxel legend editor's
// own vocabulary — class count, equal-interval vs quantile, named palettes, continuous vs discrete —
// so the two classification UIs in the app behave the same way rather than inventing a second idiom.
export default function NumericSymbologyEditor({ layerKey, rows, sym, onChange }) {
  const [classCount, setClassCount] = useState(5);
  const [classNote, setClassNote] = useState(""); // #1430
  const [method, setMethod] = useState("equal");
  // TASKS.csv #249 (colorblind-safety review) — defaults to the perceptually-uniform, colorblind-safe
  // viridis palette rather than the plain blue-red "default" ramp, so a new classification starts safe
  // without the user needing to know to pick it. "default" stays selectable (and unchanged) for anyone
  // who explicitly wants it.
  const [palette, setPalette] = useState("viridis");
  const [trim, setTrim] = useState(true); // #1531 — breaks on the 1st-99th percentiles
  const values = React.useMemo(
    () => (rows || []).map((r) => r.value).filter((v) => typeof v === "number" && !isNaN(v)),
    [rows]
  );
  const { min, max } = minMax(values);
  const trimmed = React.useMemo(() => trimForBreaks(values), [values]); // #1531
  const apply = () => {
    const breaks = classifyBreaks(trim ? trimForBreaks(values).values : values, classCount, method); // #1531
    setClassNote(classCountNote(breaks, classCount, method)); // #1430
    if (!breaks.length) return;
    const colors = paletteColorsHex(palette, breaks.length);
    onChange({ stops: breaks.map((v, i) => ({ value: v, color: colors[i] })), colorMode: "discrete" });
  };
  const stops = sym?.stops || [];
  const shown = React.useMemo(() => readableValues(stops.map((s) => s.value)), [stops]); // #1422
  // TASKS.csv #1699 — which range the default ramp spans, and the switch to minimum-maximum
  const clip = React.useMemo(() => (CLIP_KEYS.includes(layerKey) ? numericClip(rows) : null), [layerKey, rows]);
  const f3 = (v) => String(+Number(v).toPrecision(3));
  return (
    <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--color-border-subtle)" }}>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 5 }}>{tr("Symbology — {values} {v}{v2}", { values: values.length.toLocaleString(), v: tr(values.length === 1 ? "value" : "values"), v2: values.length > 0 && ` (${min.toLocaleString(undefined, { maximumFractionDigits: 2 })} – ${max.toLocaleString(undefined, { maximumFractionDigits: 2 })})` })}
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
        <input type="number" min="2" max="12" value={classCount} onChange={(e) => setClassCount(Math.max(2, Math.min(12, Number(e.target.value) || 5)))}
          title={tr("Number of classes")} style={{ width: 40, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 4px", fontSize: "var(--font-size-sm)", color: "var(--color-text)" }} />
        <select value={method} onChange={(e) => setMethod(e.target.value)} title={tr("How the class breaks are computed")}
          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 4px", fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>
          <option value="equal">{tr("Linear (equal interval)")}</option>
          <option value="log">{tr("Log-linear")}</option>
          <option value="quantile">{tr("Histogram equalization (quantile)")}</option>
          <option value="normal">{tr("Normal distribution")}</option>
            <option value="lognormal">{tr("Log-normal distribution (positive values)")}</option>{/* #1594 */}
          {/* TASKS.csv #291 — QGIS parity, see GeophysicsModule's copy of this picker. */}
          <option value="jenks">{tr("Natural breaks (Jenks)")}</option>
        </select>
        <select value={palette} onChange={(e) => setPalette(e.target.value)} title={tr("Colour ramp")}
          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 4px", fontSize: "var(--font-size-sm)", color: "var(--color-text)", maxWidth: 110 }}>
          {Object.entries(PALETTES).map(([k, p]) => <option key={k} value={k} title={p.label}>{paletteShortName(k)}</option>)}
        </select>
        <button onClick={apply} disabled={!values.length}
          style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid var(--color-selected-border)", background: values.length ? "var(--color-selected-bg)" : "var(--color-bg-subtle)", color: "var(--color-primary)", fontSize: "var(--font-size-sm)", cursor: values.length ? "pointer" : "default", opacity: values.length ? 1 : 0.5 }}
        >{tr("Classify")}</button>
        {stops.length > 0 && (
          <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onChange(null)} title={tr("Remove the custom classes and go back to the default ramp")}
            style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger-icon)", cursor: "pointer" }}>{tr("Reset")}</span>
        )}
      </div>
      {classNote && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginTop: 3 }}>{classNote}</div>} {/* #1430 */}
      {(trimmed.below > 0 || trimmed.above > 0) && ( /* TASKS.csv #1531 */
        <label style={{ display: "flex", alignItems: "flex-start", gap: 5, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, marginBottom: 5, cursor: "pointer" }}>
          <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} style={{ marginTop: 1 }} />
          <span>{tr("Place the breaks on the 1st–99th percentiles ({a} – {b}): {above} value(s) above and {below} below go in the end classes (the full range is {min} – {max}).", { a: +Number(trimmed.lo).toPrecision(3), b: +Number(trimmed.hi).toPrecision(3), above: trimmed.above.toLocaleString(), below: trimmed.below.toLocaleString(), min: +Number(min).toPrecision(3), max: +Number(max).toPrecision(3) })}</span>
        </label>
      )}
      {clip && !stops.length && (
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, marginBottom: 4 }}>
          {sym?.fullRange
            ? tr("Colours run from the minimum to the maximum ({a} – {b}).", { a: f3(clip.min), b: f3(clip.max) })
            : tr("Colours run from the 2nd to the 98th percentile ({a} – {b}); values beyond take the end colours (the full range is {min} – {max}).", { a: f3(clip.lo), b: f3(clip.hi), min: f3(clip.min), max: f3(clip.max) })}{" "}
          <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onChange(sym?.fullRange ? null : { fullRange: true })} style={{ color: "var(--color-accent)", cursor: "pointer", textDecoration: "underline" }}>{sym?.fullRange ? tr("Use the 2nd–98th percentile") : tr("Use minimum–maximum")}</span>
        </div>
      )}
      {stops.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
              <input type="checkbox" checked={sym.colorMode !== "discrete"}
                onChange={(e) => onChange({ ...sym, colorMode: e.target.checked ? "continuous" : "discrete" })} />{tr("Blend between classes")}</label>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 150, overflowY: "auto" }}>
            {stops.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--font-size-sm)" }}>
                <input type="color" value={s.color}
                  onChange={(e) => { const next = stops.map((x, j) => j === i ? { ...x, color: e.target.value } : x); onChange({ ...sym, stops: next }); }}
                  style={{ width: 22, height: 16, padding: 0, border: "1px solid var(--color-border-light)", borderRadius: 3, background: "none", cursor: "pointer", flexShrink: 0 }} />
                <StopValueInput value={s.value} shown={shown[i]}
                  onCommit={(v) => { const next = stops.map((x, j) => j === i ? { ...x, value: v } : x); onChange({ ...sym, stops: next }); }}
                  title={tr("Lower bound of this class")}
                  style={{ flex: 1, minWidth: 0, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "2px 4px", fontSize: "var(--font-size-sm)", color: "var(--color-text)" }} />
                <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>&ge;</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
