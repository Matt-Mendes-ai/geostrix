// TASKS.csv #783 — a spectral index from a multiband GeoTIFF: pick the file, the sensor and the index (or write one), say
// which file band is which, and the index comes in as a value raster (stretch, ramp and kept values like any grid).
// The maths is in lib/spectralIndices.js; the reading, stretch and reprojection are the normal raster importer's.
import React, { useMemo, useRef, useState } from "react";
import { X, Upload, Rainbow } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, panel, header, label, sel, btn } from "../lib/modalStyles.js";
import { SENSORS, INDEX_PRESETS, compileExpression, evaluateIndex } from "../lib/spectralIndices.js";
import { buildRasterImport } from "../lib/raster.js";

const CUSTOM = "custom";

export default function SpectralIndexModal({ epsg, defaultElevation, sourceEpsg, onImport, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const fileInput = useRef(null);
  const [file, setFile] = useState(null); // { file, bands, width, height }
  const [sensor, setSensor] = useState("aster_tir");
  const [presetId, setPresetId] = useState("aster_qi");
  const [custom, setCustom] = useState("b1/b2");
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const presets = INDEX_PRESETS.filter((p) => p.sensor === sensor);
  const preset = INDEX_PRESETS.find((p) => p.id === presetId);
  const isCustom = presetId === CUSTOM;
  const roles = isCustom ? Array.from({ length: file?.bands || 0 }, (_, k) => `b${k + 1}`) : SENSORS[sensor].roles;
  const expr = isCustom ? custom : preset?.expr || "";
  // the roles this expression uses, each mapped to a file band (custom: bK is band K)
  const parsed = useMemo(() => { try { return { ...compileExpression(expr, roles), error: null }; } catch (e) { return { uses: [], error: e.message }; } }, [expr, roles.join(",")]); // roles is rebuilt each render: keyed by its content
  const bandOf = (r) => (isCustom ? Number(r.slice(1)) : Number(mapping[r] ?? SENSORS[sensor].defaultBands[r] ?? NaN));
  const unmapped = parsed.uses.filter((r) => !(bandOf(r) >= 1 && bandOf(r) <= (file?.bands || 0)));

  const pickFile = async (f) => {
    setError(null);
    try {
      const { fromArrayBuffer } = await import("geotiff");
      const tiff = await fromArrayBuffer(await f.arrayBuffer());
      const image = await tiff.getImage();
      const bands = image.getSamplesPerPixel() || 1;
      if (bands < 2) { setError(`"${f.name}" has a single band: an index needs two or more. Import it as an ordinary raster instead.`); setFile(null); return; }
      setFile({ file: f, bands, width: image.getWidth(), height: image.getHeight() });
      if (bands === 5 && sensor !== "aster_tir") { setSensor("aster_tir"); setPresetId("aster_qi"); }
    } catch (e) {
      setError(`Not a readable GeoTIFF (${e.message}).`); setFile(null);
    }
  };

  const run = async () => {
    if (!file || parsed.error || unmapped.length) return;
    setBusy(true); setError(null);
    const map = Object.fromEntries(parsed.uses.map((r) => [r, bandOf(r)]));
    let blank = 0, total = 0;
    try {
      const title = isCustom ? `Index ${expr}` : `${preset.label}, ${SENSORS[sensor].label.split(" (")[0]}`;
      const { raster, msg } = await buildRasterImport(file.file, {
        epsg, defaultElevation, sourceEpsg, name: `${title} — ${file.file.name}`,
        bandFn: (bands, isNoData) => { const r = evaluateIndex(bands, map, expr, { isNoData }); blank = r.blank; total = r.values.length; return r.values; },
      });
      const note = ` Index ${expr} with ${parsed.uses.map((r) => `${r} = band ${map[r]}`).join(", ")}.${blank ? ` ${blank.toLocaleString()} pixel${blank === 1 ? " is" : "s are"} blank (${((100 * blank) / Math.max(1, total)).toPrecision(2)}%: a band at 0 / nodata / negative, or a division by zero).` : ""}${isCustom ? "" : ` ${preset.what} Pixel size of the source: ${SENSORS[sensor].pixel}.`} An index is a ratio of surface signals, not a mineral map: vegetation, snow, water and shadow change it, and only exposed rock or soil means anything.`;
      onImport({ ...raster, spectralIndex: { expr, bands: map, sensor: isCustom ? null : sensor, preset: isCustom ? null : preset.id } }, msg + note);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  const small = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };
  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel({ width: 520, maxHeight: "88vh" })} role="dialog" aria-modal="true" aria-label="Spectral index" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-text)", fontSize: "var(--font-size-lg)" }}><Rainbow size={16} /> Spectral index</span>
          <X role="button" tabIndex={0} size={16} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} aria-label="Close" />
        </div>
        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={label}>1. Multiband GeoTIFF</div>
            <button onClick={() => fileInput.current.click()} style={{ ...btn(false), padding: "7px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}><Upload size={14} /> {file ? "Choose another file…" : "Choose a file…"}</button>
            <input ref={fileInput} type="file" accept=".tif,.tiff" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ""; }} />
            {file && <div style={{ ...small, marginTop: 6 }}>{file.file.name}: {file.bands} bands, {file.width.toLocaleString()} × {file.height.toLocaleString()} px.</div>}
            <div style={{ ...small, marginTop: 6 }}>ASTER thermal emissivity: NASA's AST_05 product (free with an Earthdata login), 5 bands in order 10-14. Sentinel-2 or Landsat: a surface-reflectance GeoTIFF with the bands stacked, then say below which band is which.</div>
          </div>
          <div>
            <div style={label}>2. Index</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select value={sensor} onChange={(e) => { setSensor(e.target.value); setPresetId(INDEX_PRESETS.find((p) => p.sensor === e.target.value)?.id || CUSTOM); setMapping({}); }} style={sel} aria-label="Sensor">
                {Object.entries(SENSORS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
              </select>
              <select value={presetId} onChange={(e) => setPresetId(e.target.value)} style={sel} aria-label="Index">
                {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                <option value={CUSTOM}>Custom expression…</option>
              </select>
            </div>
            {isCustom
              ? <input value={custom} onChange={(e) => setCustom(e.target.value)} style={{ ...sel, width: "100%", marginTop: 8, boxSizing: "border-box", fontFamily: "monospace" }} aria-label="Expression" placeholder="e.g. (b4 - b3) / (b4 + b3)" />
              : <div style={{ ...small, marginTop: 8 }}><code>{expr}</code> — {preset?.what}</div>}
            {isCustom && <div style={{ ...small, marginTop: 4 }}>Bands are b1 … b{file?.bands || "n"}; + − × / ^ and brackets.</div>}
            {parsed.error && <div role="alert" style={{ ...small, color: "var(--color-danger-fg)", marginTop: 4 }}>{parsed.error}</div>}
          </div>
          {!isCustom && file && (
            <div>
              <div style={label}>3. Which file band is which</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6 }}>
                {parsed.uses.map((r) => (
                  <label key={r} style={{ ...small, display: "flex", alignItems: "center", gap: 6 }}>{r}
                    <select value={Number.isFinite(bandOf(r)) ? bandOf(r) : ""} onChange={(e) => setMapping((m) => ({ ...m, [r]: Number(e.target.value) }))} style={sel} aria-label={`File band for ${r}`}>
                      <option value="">—</option>
                      {Array.from({ length: file.bands }, (_, k) => <option key={k} value={k + 1}>band {k + 1}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {unmapped.length > 0 && <div style={{ ...small, marginTop: 4 }}>Say which file band holds {unmapped.join(", ")}.</div>}
            </div>
          )}
          {error && <div role="alert" style={{ ...small, color: "var(--color-danger-fg)" }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{ ...btn(false), padding: "7px 14px" }}>Cancel</button>
            <button onClick={run} disabled={!file || !!parsed.error || unmapped.length > 0 || busy} style={{ ...btn(true), padding: "7px 14px", opacity: !file || parsed.error || unmapped.length || busy ? 0.5 : 1 }}>{busy ? "Computing…" : "Make the index raster"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
