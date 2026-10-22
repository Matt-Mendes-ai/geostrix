// TASKS.csv #783 — a spectral index from a multiband GeoTIFF: pick the file, the sensor and the index (or write one), say
// which file band is which, and the index comes in as a value raster (stretch, ramp and kept values like any grid).
// The maths is in lib/spectralIndices.js; the reading, stretch and reprojection are the normal raster importer's.
// TASKS.csv #784 — or FETCH the bands in the app: pick an area and a scene (Sentinel-2 from Earth Search, ASTER from the
// Planetary Computer, no account), only that area's window of the bands the index uses is read (lib/imageryFetch.js),
// and the same importer takes it from there.
import React, { useMemo, useRef, useState } from "react";
import { X, Upload, Rainbow, Search } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, panel, header, label, sel, btn } from "../lib/modalStyles.js";
import { SENSORS, INDEX_PRESETS, compileExpression, evaluateIndex, VEG_NDVI_MAX } from "../lib/spectralIndices.js";
import { buildRasterImport } from "../lib/raster.js";
import { IMAGERY_SOURCES, searchScenes, fetchSceneStack } from "../lib/imageryFetch.js";
import BasemapView from "./BasemapView.jsx";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

const CUSTOM = "custom";
const lastSummer = () => { const y = new Date().getFullYear() - (new Date().getMonth() < 9 ? 1 : 0); return { from: `${y}-07-01`, to: `${y}-09-15` }; };

export default function SpectralIndexModal({ epsg, defaultElevation, sourceEpsg, areaOptions = [], onImport, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const fileInput = useRef(null);
  const [mode, setMode] = useState("fetch"); // "fetch" (#784) | "file" (#783)
  const [file, setFile] = useState(null); // { file, bands, width, height }
  const [sensor, setSensor] = useState("sentinel2");
  const [presetId, setPresetId] = useState("s2_clay");
  const [custom, setCustom] = useState("b1/b2");
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // #784 — fetch state
  const [source, setSource] = useState("sentinel2");
  const [areaId, setAreaId] = useState(areaOptions[0]?.id || "");
  const [drawn, setDrawn] = useState(null); // a bbox drawn on the map
  const [drawing, setDrawing] = useState(false);
  const [dates, setDates] = useState(lastSummer);
  const [maxCloud, setMaxCloud] = useState(20);
  const [scenes, setScenes] = useState(null);
  const [sceneId, setSceneId] = useState("");
  const [progress, setProgress] = useState(null);
  const [maskVeg, setMaskVeg] = useState(false); // #789: opt-in (blanks forest, adds the NIR band to the download)

  const fetchMode = mode === "fetch";
  const activeSensor = fetchMode ? IMAGERY_SOURCES[source].sensor : sensor;
  const presets = INDEX_PRESETS.filter((p) => p.sensor === activeSensor);
  const preset = INDEX_PRESETS.find((p) => p.id === presetId);
  const isCustom = presetId === CUSTOM;
  // custom: b1..bN on a file; the sensor's band names (B4, B11 ...) on fetched imagery
  const roles = isCustom && !fetchMode ? Array.from({ length: file?.bands || 0 }, (_, k) => `b${k + 1}`) : SENSORS[activeSensor].roles;
  const expr = isCustom ? custom : preset?.expr || "";
  const parsed = useMemo(() => { try { return { ...compileExpression(expr, roles), error: null }; } catch (e) { return { uses: [], error: e.message }; } }, [expr, roles.join(",")]); // roles is rebuilt each render: keyed by its content
  const bandOf = (r) => (isCustom ? Number(r.slice(1)) : Number(mapping[r] ?? SENSORS[sensor].defaultBands[r] ?? NaN));
  const unmapped = fetchMode ? [] : parsed.uses.filter((r) => !(bandOf(r) >= 1 && bandOf(r) <= (file?.bands || 0)));
  const area = drawn && areaId === "drawn" ? { id: "drawn", label: "the area drawn on the map", bboxLonLat: drawn } : areaOptions.find((o) => o.id === areaId);
  const scene = scenes?.find((s) => s.id === sceneId) || null;
  // TASKS.csv #789 — reflectance ratios: blank near-zero (dark) pixels, and optionally vegetation (NDVI from the sensor's
  // NIR and red). A custom b1..bN expression on a file has unknown units, so neither applies there.
  const sens = SENSORS[activeSensor];
  const reflective = !!sens.reflectance && !(isCustom && !fetchMode);
  const vegRoles = reflective && maskVeg && sens.nir ? [sens.nir, sens.red] : [];
  const mapRoles = [...new Set([...parsed.uses, ...vegRoles])];
  const vegUnmapped = fetchMode ? [] : vegRoles.filter((r) => !(bandOf(r) >= 1 && bandOf(r) <= (file?.bands || 0)));

  const pickSensor = (s) => { setSensor(s); setPresetId(INDEX_PRESETS.find((p) => p.sensor === s)?.id || CUSTOM); setMapping({}); };
  const pickSource = (s) => { setSource(s); setScenes(null); setSceneId(""); const sen = IMAGERY_SOURCES[s].sensor; setPresetId(INDEX_PRESETS.find((p) => p.sensor === sen)?.id || CUSTOM); if (isCustom) setCustom(sen === "aster_tir" ? "B11/B13" : "B11/B12"); };

  const pickFile = async (f) => {
    setError(null);
    try {
      const { fromArrayBuffer } = await import("geotiff");
      const tiff = await fromArrayBuffer(await f.arrayBuffer());
      const image = await tiff.getImage();
      const bands = image.getSamplesPerPixel() || 1;
      if (bands < 2) { setError(tr("\"{name}\" has a single band: an index needs two or more. Import it as an ordinary raster instead.", { name: f.name })); setFile(null); return; }
      setFile({ file: f, bands, width: image.getWidth(), height: image.getHeight() });
      if (bands === 5 && sensor !== "aster_tir") pickSensor("aster_tir");
    } catch (e) {
      setError(tr("Not a readable GeoTIFF ({message}).", { message: e.message })); setFile(null);
    }
  };

  const search = async () => {
    if (!area) return;
    setBusy(true); setError(null); setScenes(null); setSceneId("");
    try {
      const list = await searchScenes(source, area.bboxLonLat, { ...dates, maxCloud: Number(maxCloud) || 20 });
      setScenes(list);
      if (list.length) setSceneId(list[0].id);
      else setError(tr("No {v} scene{v2} under {maxCloud}% cloud covers this area. Widen the dates or allow more cloud.", { v: IMAGERY_SOURCES[source].label.split(" (")[0], v2: source === "sentinel2" ? tr(" in those dates") : "", maxCloud }));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  // the index on a multiband File with `map` (role -> 1-based band), then into the project
  const makeIndex = async (theFile, map, sensorKey, sourceNote, vegOn) => {
    let blank = 0, total = 0, dark = 0, vegetated = 0;
    const title = isCustom ? `Index ${expr}` : `${preset.label}, ${(fetchMode ? IMAGERY_SOURCES[source].label : SENSORS[sensorKey].label).split(" (")[0]}`; // fetched ASTER is radiance, not emissivity
    const { raster, msg } = await buildRasterImport(theFile, {
      epsg, defaultElevation, sourceEpsg: fetchMode ? "" : sourceEpsg, name: `${title} — ${fetchMode ? `${scene.date} ${scene.id.split("_").slice(0, 2).join("_")}` : theFile.name}`,
      bandFn: (bands, isNoData) => { const r = evaluateIndex(bands, map, expr, { isNoData, floor: reflective ? "auto" : 0, veg: vegOn ? { nir: sens.nir, red: sens.red } : null, dnScale: sens.dnScale || 10000 }); ({ blank, dark, vegetated } = r); total = r.values.length; return r.values; },
    });
    const masks = (dark ? tr(" Of those, {dark} had a band under 1% reflectance (dark forest, shadow): a ratio there is noise and would take over the colour scale.", { dark: dark.toLocaleString() }) : "")
      + (vegetated ? tr(vegetated === 1 ? " {vegetated} vegetated pixel (NDVI above {max}) was left out." : " {vegetated} vegetated pixels (NDVI above {max}) were left out.", { vegetated: vegetated.toLocaleString(), max: VEG_NDVI_MAX }) : "")
      + (reflective && maskVeg && !vegOn ? tr(" Vegetation was not masked: {v} not mapped to a file band.", { v: vegRoles.join(" / ") }) : "");
    const note = tr(" Index {expr}{v}.{v2}{v3}{v4} An index is a ratio of surface signals, not a mineral map: vegetation, snow, water and shadow change it, and only exposed rock or soil means anything.", { expr, v: fetchMode ? "" : tr(" with {v}", { v: parsed.uses.map((r) => `${r} = band ${map[r]}`).join(", ") }), v2: sourceNote || "", v3: blank ? tr(blank === 1 ? " {blank} pixel is blank ({v2}%: masked, at 0 / nodata / negative, or a division by zero)." : " {blank} pixels are blank ({v2}%: masked, at 0 / nodata / negative, or a division by zero).", { blank: blank.toLocaleString(), v2: ((100 * blank) / Math.max(1, total)).toPrecision(2) }) + masks : masks, v4: isCustom ? "" : tr(" {what} Pixel size of the source: {pixel}.", { what: tr(preset.what), pixel: SENSORS[sensorKey].pixel }) });
    onImport({ ...raster, spectralIndex: { expr, bands: map, sensor: isCustom ? null : sensorKey, preset: isCustom ? null : preset.id, ...(fetchMode ? { scene: scene.id, date: scene.date } : {}) } }, msg + note);
  };

  const run = async () => {
    if (parsed.error) return;
    setBusy(true); setError(null);
    try {
      if (fetchMode) {
        if (!scene) return;
        const stack = await fetchSceneStack(scene, area.bboxLonLat, mapRoles, { onProgress: (d, n) => setProgress({ d, n }), targetEpsg: epsg });
        await makeIndex(stack.file, Object.fromEntries(mapRoles.map((r) => [r, stack.mapping[r]])), activeSensor, stack.note, vegRoles.length > 0);
      } else {
        if (!file || unmapped.length) return;
        const vegOn = vegRoles.length > 0 && !vegUnmapped.length;
        await makeIndex(file.file, Object.fromEntries((vegOn ? mapRoles : parsed.uses).map((r) => [r, bandOf(r)])), sensor, "", vegOn);
      }
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); setProgress(null); }
  };

  const small = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };
  const tab = (m, text) => <button onClick={() => { setMode(m); setError(null); if (m === "file") pickSensor(sensor); else pickSource(source); }} style={{ ...btn(mode === m), padding: "6px 12px", flex: 1 }} aria-pressed={mode === m}>{text}</button>;
  const canRun = !parsed.error && !busy && (fetchMode ? !!scene : !!file && !unmapped.length);
  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel({ width: 560, maxHeight: "90vh" })} role="dialog" aria-modal="true" aria-label={tr("Spectral index")} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-text)", fontSize: "var(--font-size-lg)" }}><Rainbow size={16} />{" "}{tr("Spectral index")}</span>
          <X role="button" tabIndex={0} size={16} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} aria-label={tr("Close")} />
        </div>
        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>{tab("fetch", tr("Fetch imagery"))}{tab("file", tr("Use a GeoTIFF file"))}</div>

          {fetchMode ? (
            <div>
              <div style={label}>{tr("1. Imagery")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select value={source} onChange={(e) => pickSource(e.target.value)} style={sel} aria-label={tr("Imagery source")}>
                  {Object.entries(IMAGERY_SOURCES).map(([k, s]) => <option key={k} value={k}>{tr(s.label)}</option>)}
                </select>
                <select value={areaId} onChange={(e) => { if (e.target.value === "__draw") { setDrawing(true); return; } setAreaId(e.target.value); setScenes(null); }} style={{ ...sel, maxWidth: 240 }} aria-label={tr("Area")}>
                  {areaOptions.map((o) => <option key={o.id} value={o.id}>{tr(o.label)}</option>)}
                  {drawn && <option value="drawn">{tr("The area drawn on the map")}</option>}
                  <option value="__draw">{tr("Draw an area on a map…")}</option>
                </select>
              </div>
              {source === "sentinel2" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8, ...small }}>{tr("From")}{" "}<input type="date" value={dates.from} onChange={(e) => setDates((d) => ({ ...d, from: e.target.value }))} style={sel} aria-label={tr("From date")} />{tr("to")}{" "}<input type="date" value={dates.to} onChange={(e) => setDates((d) => ({ ...d, to: e.target.value }))} style={sel} aria-label={tr("To date")} />{tr("cloud under")}{" "}<input type="number" min={0} max={100} value={maxCloud} onChange={(e) => setMaxCloud(e.target.value)} style={{ ...sel, width: 56 }} aria-label={tr("Maximum cloud cover")} />%
                </div>
              )}
              <button onClick={search} disabled={!area || busy} style={{ ...btn(false), padding: "7px 12px", marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, opacity: !area || busy ? 0.5 : 1 }}><Search size={14} />{" "}{tr("Find scenes")}</button>
              {scenes && scenes.length > 0 && (
                <select value={sceneId} onChange={(e) => setSceneId(e.target.value)} style={{ ...sel, width: "100%", marginTop: 8 }} aria-label={tr("Scene")} size={Math.min(6, scenes.length)}>
                  {scenes.map((s) => <option key={s.id} value={s.id}>{tr("{date} — {v}% cloud, covers {v2}% of the area", { date: s.date, v: Number(s.cloud).toFixed(s.cloud < 10 ? 1 : 0), v2: Math.round(100 * s.coverage) })}</option>)}
                </select>
              )}
              <div style={{ ...small, marginTop: 6 }}>{source === "sentinel2"
                ? tr("Copernicus Sentinel-2 surface reflectance from Element 84's Earth Search (AWS Open Data), free, no account. Summer dates keep snow off the ground; cloud, shadow, snow and water are masked with the scene's own classification. Only the area's window of the bands the index uses is downloaded.")
                : tr("ASTER L1T from Microsoft's Planetary Computer, free, no account: the 2000-2006 archive, thermal bands 10-14 at 90 m as at-sensor radiance (not emissivity: compare values within one scene). Only the area's window is downloaded.")}</div>
            </div>
          ) : (
            <div>
              <div style={label}>{tr("1. Multiband GeoTIFF")}</div>
              <button onClick={() => fileInput.current.click()} style={{ ...btn(false), padding: "7px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}><Upload size={14} /> {file ? tr("Choose another file…") : tr("Choose a file…")}</button>
              <input ref={fileInput} type="file" accept=".tif,.tiff" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ""; }} />
              {file && <div style={{ ...small, marginTop: 6 }}>{tr("{name}: {bands} bands, {width} × {height} px.", { name: file.file.name, bands: file.bands, width: file.width.toLocaleString(), height: file.height.toLocaleString() })}</div>}
              <div style={{ ...small, marginTop: 6 }}>{tr("ASTER thermal emissivity: NASA's AST_05 product (free with an Earthdata login), 5 bands in order 10-14. ASTER VNIR + SWIR: AST_07XT surface reflectance, the 3 VNIR and 6 SWIR bands stacked in order 1-9 at one pixel size (SWIR only exists for 2000-2008 scenes). Sentinel-2 or Landsat: a surface-reflectance GeoTIFF with the bands stacked, then say below which band is which.")}</div>
            </div>
          )}

          <div>
            <div style={label}>{tr("2. Index")}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!fetchMode && (
                <select value={sensor} onChange={(e) => pickSensor(e.target.value)} style={sel} aria-label={tr("Sensor")}>
                  {Object.entries(SENSORS).map(([k, s]) => <option key={k} value={k}>{tr(s.label)}</option>)}
                </select>
              )}
              <select value={presetId} onChange={(e) => setPresetId(e.target.value)} style={sel} aria-label={tr("Index")}>
                {presets.map((p) => <option key={p.id} value={p.id}>{tr(p.label)}</option>)}
                <option value={CUSTOM}>{tr("Custom expression…")}</option>
              </select>
            </div>
            {isCustom
              ? <input value={custom} onChange={(e) => setCustom(e.target.value)} style={{ ...sel, width: "100%", marginTop: 8, boxSizing: "border-box", fontFamily: "monospace" }} aria-label={tr("Expression")} placeholder={fetchMode ? "e.g. (B8 - B4) / (B8 + B4)" : "e.g. (b4 - b3) / (b4 + b3)"} />
              : <div style={{ ...small, marginTop: 8 }}><code>{expr}</code> — {tr(preset?.what)}</div>}
            {isCustom && <div style={{ ...small, marginTop: 4 }}>{tr("{v}; + − × / ^ and brackets.", { v: fetchMode ? tr("Bands: {roles}", { roles: roles.join(", ") }) : tr("Bands are b1 … b{v}", { v: file?.bands || "n" }) })}</div>}
            {parsed.error && <div role="alert" style={{ ...small, color: "var(--color-danger-fg)", marginTop: 4 }}>{parsed.error}</div>}
            {reflective && sens.nir && (
              <label style={{ ...small, display: "flex", alignItems: "flex-start", gap: 6, marginTop: 8 }}>
                <input type="checkbox" checked={maskVeg} onChange={(e) => setMaskVeg(e.target.checked)} style={{ marginTop: 2 }} />
                <span>{tr("Leave out vegetation (NDVI above {max}, from {nir} and {red}): iron and clay ratios only mean something on exposed rock and soil, so the colours then compare rock with rock. Downloads one more band.", { max: VEG_NDVI_MAX, nir: sens.nir, red: sens.red })}</span>
              </label>
            )}
          </div>
          {!fetchMode && !isCustom && file && (
            <div>
              <div style={label}>{tr("3. Which file band is which")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6 }}>
                {mapRoles.map((r) => (
                  <label key={r} style={{ ...small, display: "flex", alignItems: "center", gap: 6 }}>{r}
                    <select value={Number.isFinite(bandOf(r)) ? bandOf(r) : ""} onChange={(e) => setMapping((m) => ({ ...m, [r]: Number(e.target.value) }))} style={sel} aria-label={tr("File band for {r}", { r })}>
                      <option value="">—</option>
                      {Array.from({ length: file.bands }, (_, k) => <option key={k} value={k + 1}>{tr("band {v}", { v: k + 1 })}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {unmapped.length > 0 && <div style={{ ...small, marginTop: 4 }}>{tr("Say which file band holds {unmapped}.", { unmapped: unmapped.join(", ") })}</div>}
              {vegUnmapped.length > 0 && <div style={{ ...small, marginTop: 4 }}>{tr("Map {v} for the vegetation mask, or untick it.", { v: vegUnmapped.join(", ") })}</div>}
            </div>
          )}
          {error && <div role="alert" style={{ ...small, color: "var(--color-danger-fg)" }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
            {progress && <span style={small}>{tr("Reading band {v} of {n}…", { v: Math.min(progress.d + 1, progress.n), n: progress.n })}</span>}
            <button onClick={onClose} style={{ ...btn(false), padding: "7px 14px" }}>{tr("Cancel")}</button>
            <button onClick={run} disabled={!canRun} style={{ ...btn(true), padding: "7px 14px", opacity: canRun ? 1 : 0.5 }}>{busy ? (fetchMode ? tr("Fetching…") : tr("Computing…")) : fetchMode ? tr("Fetch and make the index") : tr("Make the index raster")}</button>
          </div>
        </div>
      </div>
      {drawing && (
        <BasemapView mode="draw" title={tr("Draw the area to fetch imagery for")} confirmLabel="Use this area" initialBboxLonLat={area?.bboxLonLat || null}
          lon={area ? (area.bboxLonLat[0] + area.bboxLonLat[2]) / 2 : undefined} lat={area ? (area.bboxLonLat[1] + area.bboxLonLat[3]) / 2 : undefined}
          onClose={() => setDrawing(false)} onConfirm={(b) => { setDrawn(b); setAreaId("drawn"); setScenes(null); setDrawing(false); }} />
      )}
    </div>
  );
}
