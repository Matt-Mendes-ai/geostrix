// TASKS.csv #807 — the Spectral index dialog's "Hyperspectral (EMIT)" tab: a multiband GeoTIFF cut from an EMIT L2A
// reflectance granule (or any hyperspectral cube), its band wavelengths (from the file's GDAL metadata, else an ENVI
// .hdr or a pasted list), a feature, and the continuum-removed depth / wavelength maps as value rasters
// (lib/hyperspectral.js). Only the bands inside the feature's window are decoded.
import React, { useRef, useState } from "react";
import { Upload } from "./icons.js";
import { label, sel, btn } from "../lib/modalStyles.js";
import { buildRasterImport } from "../lib/raster.js";
import { FEATURES, parseWavelengths, wavelengthsFromGdalMetadata, featureBands, featureMap } from "../lib/hyperspectral.js";
import { t as tr } from "../lib/i18n.js";

export default function HyperspectralTab({ epsg, defaultElevation, sourceEpsg, onImport, onClose }) {
  const fileInput = useRef(null), hdrInput = useRef(null);
  const [file, setFile] = useState(null); // { file, bands, width, height }
  const [wl, setWl] = useState(null); // nm per band, or null
  const [wlSource, setWlSource] = useState("");
  const [wlText, setWlText] = useState("");
  const [feature, setFeature] = useState("aloh2200");
  const [products, setProducts] = useState({ depth: true, wavelength: true });
  const [minDepth, setMinDepth] = useState("0.02");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const small = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };

  const pickFile = async (f) => {
    setError(null); setWl(null); setWlSource("");
    try {
      const { fromArrayBuffer } = await import("geotiff");
      const tiff = await fromArrayBuffer(await f.arrayBuffer());
      const image = await tiff.getImage();
      const bands = image.getSamplesPerPixel() || 1;
      if (bands < 10) { setError(tr("\"{name}\" has {bands} bands: a hyperspectral cube has dozens to hundreds. For multispectral files use the other tabs.", { name: f.name, bands })); setFile(null); return; }
      setFile({ file: f, bands, width: image.getWidth(), height: image.getHeight() });
      const meta = [];
      for (let b = 0; b < bands; b++) { let m = null; try { m = await image.getGDALMetadata(b); } catch { /* none */ } meta.push(m); }
      const w = wavelengthsFromGdalMetadata(meta);
      if (w) { setWl(w); setWlSource(tr("from the file's band metadata")); }
    } catch (e) { setError(tr("Not a readable GeoTIFF ({message}).", { message: e.message })); setFile(null); }
  };
  const applyList = (text, source) => {
    const w = parseWavelengths(text);
    if (!file) return;
    if (w.length !== file.bands) { setError(tr("{n} wavelengths found, but the file has {bands} bands.", { n: w.length, bands: file.bands })); return; }
    setError(null); setWl(w); setWlSource(source);
  };

  const f = FEATURES[feature];
  const win = wl ? featureBands(wl, feature) : [];
  const canRun = !!file && !!wl && win.length >= 5 && (products.depth || products.wavelength) && !busy;
  const run = async () => {
    setBusy(true); setError(null);
    try {
      const wlSel = win.map((i) => wl[i]);
      const md = Math.max(0, Number(minDepth) || 0);
      const made = [];
      let stats = null;
      for (const kind of ["depth", "wavelength"].filter((k) => products[k])) {
        const what = kind === "depth" ? "depth" : "wavelength of the minimum (nm)";
        const { raster, msg } = await buildRasterImport(file.file, {
          epsg, defaultElevation, sourceEpsg, samples: win, name: `${f.label.split(" (")[0]} ${what} — ${file.file.name}`,
          bandFn: (bands, isNoData) => { const r = featureMap(bands, wlSel, { isNoData, minDepth: md }); stats = r; return kind === "depth" ? r.depth : r.wavelength; },
        });
        made.push({ raster: { ...raster, spectralIndex: { hyperspectral: true, feature, product: kind, bands: win.length, window: [Math.round(wlSel[0]), Math.round(wlSel[wlSel.length - 1])], minDepth: md } }, msg });
      }
      const note = tr(" Continuum removed over {lo}-{hi} nm ({n} bands): depth = 1 - the lowest continuum-removed value; the wavelength is blank where the depth is under {min} ({none} of {valid} pixels). {what} A feature map is a surface signal: vegetation, water, shadow and the sensor's 60 m pixel all shape it.", { lo: Math.round(wlSel[0]), hi: Math.round(wlSel[wlSel.length - 1]), n: win.length, min: md, none: (stats?.noFeature || 0).toLocaleString(), valid: (stats?.valid || 0).toLocaleString(), what: tr(f.what) });
      onImport(made.map((m) => m.raster), made.map((m) => m.msg).join(" ") + note);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div>
        <div style={label}>{tr("1. Hyperspectral GeoTIFF")}</div>
        <button onClick={() => fileInput.current.click()} style={{ ...btn(false), padding: "7px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}><Upload size={14} /> {file ? tr("Choose another file…") : tr("Choose a file…")}</button>
        <input ref={fileInput} type="file" accept=".tif,.tiff" style={{ display: "none" }} onChange={(e) => { const x = e.target.files?.[0]; if (x) pickFile(x); e.target.value = ""; }} />
        {file && <div style={{ ...small, marginTop: 6 }}>{tr("{name}: {bands} bands, {width} × {height} px.", { name: file.file.name, bands: file.bands, width: file.width.toLocaleString(), height: file.height.toLocaleString() })}</div>}
        <div style={{ ...small, marginTop: 6 }}>{tr("NASA EMIT L2A surface reflectance (free with an Earthdata login), cut to your area and saved as a multiband GeoTIFF with NASA's EMIT tools or QGIS / GDAL. Keep it small: a few hundred pixels across is plenty at EMIT's 60 m.")}</div>
      </div>
      {file && (
        <div>
          <div style={label}>{tr("2. Band wavelengths")}</div>
          {wl ? <div style={small}>{tr("{n} wavelengths, {lo}-{hi} nm, {source}.", { n: wl.length, lo: Math.round(Math.min(...wl)), hi: Math.round(Math.max(...wl)), source: wlSource })}</div> : (
            <>
              <div style={small}>{tr("The file does not say its band wavelengths. Load the ENVI header (.hdr) that came with the data, or paste the list (nm or µm).")}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "flex-start" }}>
                <button onClick={() => hdrInput.current.click()} style={{ ...btn(false), padding: "6px 10px" }}>{tr("Load .hdr…")}</button>
                <input ref={hdrInput} type="file" accept=".hdr,.txt,.csv" style={{ display: "none" }} onChange={async (e) => { const x = e.target.files?.[0]; e.target.value = ""; if (x) applyList(await x.text(), tr("from {name}", { name: x.name })); }} />
                <textarea value={wlText} onChange={(e) => setWlText(e.target.value)} rows={2} style={{ ...sel, flex: 1, fontFamily: "monospace" }} aria-label={tr("Band wavelengths")} placeholder="381.0, 388.4, 395.8, …" />
                <button onClick={() => applyList(wlText, tr("pasted"))} disabled={!wlText.trim()} style={{ ...btn(false), padding: "6px 10px" }}>{tr("Use")}</button>
              </div>
            </>
          )}
        </div>
      )}
      <div>
        <div style={label}>{tr("3. Feature")}</div>
        <select value={feature} onChange={(e) => setFeature(e.target.value)} style={sel} aria-label={tr("Absorption feature")}>
          {Object.entries(FEATURES).map(([k, x]) => <option key={k} value={k}>{tr(x.label)}</option>)}
        </select>
        <div style={{ ...small, marginTop: 6 }}>{tr(f.what)}</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, ...small }}>
          <label style={{ display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={products.depth} onChange={(e) => setProducts((p) => ({ ...p, depth: e.target.checked }))} />{tr("Depth map")}</label>
          <label style={{ display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={products.wavelength} onChange={(e) => setProducts((p) => ({ ...p, wavelength: e.target.checked }))} />{tr("Wavelength map")}</label>
          <label style={{ display: "flex", alignItems: "center", gap: 5 }} title={tr("Below this depth there is no real feature: the wavelength is left blank there.")}>{tr("Minimum depth")}<input type="number" min="0" step="0.01" value={minDepth} onChange={(e) => setMinDepth(e.target.value)} style={{ ...sel, width: 64 }} aria-label={tr("Minimum depth")} /></label>
        </div>
        {wl && win.length < 5 && <div style={{ ...small, marginTop: 4, color: "var(--color-danger-fg)" }}>{tr("Only {n} band(s) between {lo} and {hi} nm in this file: this feature cannot be mapped from it.", { n: win.length, lo: f.lo, hi: f.hi })}</div>}
      </div>
      {error && <div role="alert" style={{ ...small, color: "var(--color-danger-fg)" }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ ...btn(false), padding: "7px 14px" }}>{tr("Cancel")}</button>
        <button onClick={run} disabled={!canRun} style={{ ...btn(true), padding: "7px 14px", opacity: canRun ? 1 : 0.5 }}>{busy ? tr("Computing…") : tr("Make the feature maps")}</button>
      </div>
    </>
  );
}
