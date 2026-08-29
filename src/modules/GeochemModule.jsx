import React, { useState, useRef, useMemo, Suspense } from "react";
import Papa from "papaparse";
import { Upload, Download, FlaskConical, Beaker, Scale, Grid3x3, Ruler, ShieldCheck, TerminalSquare } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { saveFile } from "../lib/desktop.js";
import {
  DIAGRAMS, SPIDER_DIAGRAMS, GEOCHEM_METHODS, GEOCHEM_LABELS, classColor,
  isElementColumn, inferUnit, parseAssayValue, valueIn, reeProfile,
} from "../lib/geochem.js";
import GeochemPlot from "../components/GeochemPlot.jsx";
import AssayImportModal from "../components/AssayImportModal.jsx";
import IsoconTool from "../components/IsoconTool.jsx";
import CorrelationMatrix from "../components/CorrelationMatrix.jsx";
import BestIntercepts from "../components/BestIntercepts.jsx";
import CompositingModal from "../components/CompositingModal.jsx";
import GradeStatistics from "../components/GradeStatistics.jsx";
import QAQCPanel from "../components/QAQCPanel.jsx";
// TASKS.csv #224 — see ViewerModule.jsx's own comment on this same lazy import (sql.js's 658KB wasm
// was pulled in on every app launch via this static import chain, regardless of whether SQL workspace
// was ever opened).
const SQLWorkspaceModal = React.lazy(() => import("../components/SQLWorkspaceModal.jsx"));
import SidebarResizeHandle from "../components/SidebarResizeHandle.jsx";
import { useSidebarWidth } from "../lib/useSidebarWidth.js";

const ALL_DIAGRAMS = { ...DIAGRAMS, ...SPIDER_DIAGRAMS };

export default function GeochemModule() {
  const store = useStore();
  const { assays, setAssays, assayElements, setAssayElements, mergeLayer, replaceLayer, layers, collars, survey, boundaries } = store;

  const [diagramId, setDiagramId] = useState("boxplot");
  const [colorMode, setColorMode] = useState("hole"); // hole | element | uniform
  const [colorElement, setColorElement] = useState(null);
  const [assayModal, setAssayModal] = useState(null);
  const [isoconOpen, setIsoconOpen] = useState(false);
  const [corrOpen, setCorrOpen] = useState(false);
  const [bestIntOpen, setBestIntOpen] = useState(false);
  const [compositingOpen, setCompositingOpen] = useState(false);
  const [gradeStatsOpen, setGradeStatsOpen] = useState(false);
  const [qaqcOpen, setQaqcOpen] = useState(false);
  const [sqlOpen, setSqlOpen] = useState(false);
  const [notices, setNotices] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useSidebarWidth();
  const fileRef = useRef(null);
  const pxrfRef = useRef(null);
  const svgRef = useRef(null);

  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const holeColors = useMemo(() => {
    const holes = Array.from(new Set(assays.map((a) => a.hole_id)));
    const map = {};
    holes.forEach((h, i) => { map[h] = `hsl(${(i * 67) % 360}, 55%, 58%)`; });
    return map;
  }, [assays]);

  const colorBy = (sample) => {
    if (colorMode === "uniform") return "#4a9be0";
    if (colorMode === "hole") return holeColors[sample.hole_id] || "#55606e";
    if (colorMode === "element" && colorElement) {
      const v = valueIn(sample, colorElement, "ppm", elementUnits);
      if (v == null) return "#eef1f4";
      const vals = assays.map((a) => valueIn(a, colorElement, "ppm", elementUnits)).filter((x) => x != null);
      const min = Math.min(...vals), max = Math.max(...vals);
      const t = max > min ? (v - min) / (max - min) : 0.5;
      const lo = [70, 110, 190], hi = [220, 70, 60];
      return `rgb(${lo.map((x, i) => Math.round(x + (hi[i] - x) * t)).join(",")})`;
    }
    return "#4a9be0";
  };

  const diagram = ALL_DIAGRAMS[diagramId];
  const availableSymbols = new Set(assayElements.map((e) => e.symbol));
  const missingForDiagram = diagram.requires.filter((s) => !availableSymbols.has(s));

  const handleFile = (file, isPxrf) => {
    Papa.parse(file, {
      header: true, dynamicTyping: true, skipEmptyLines: true,
      complete: (res) => {
        const data = res.data;
        if (!data.length) { setNotices((p) => [...p, `${file.name}: empty file.`]); return; }
        const headers = Object.keys(data[0]);
        openAssayModal(file, headers, data, isPxrf);
      },
    });
  };

  const openAssayModal = (file, headers, data, isPxrf) => {
    const guess = (aliases) => {
      const lower = headers.map((h) => h.toLowerCase().trim());
      for (const a of aliases) { const i = lower.indexOf(a); if (i >= 0) return headers[i]; }
      for (const a of aliases) { const i = lower.findIndex((h) => h.includes(a)); if (i >= 0) return headers[i]; }
      return "";
    };
    const holeCol = guess(["hole_id", "holeid", "hole", "bhid"]);
    const fromCol = guess(["from", "from_depth", "from_m", "depth_from"]);
    const toCol = guess(["to", "to_depth", "to_m", "depth_to"]);
    const isLong = headers.some((h) => /^(analyte|element)$/i.test(h.trim())) && headers.some((h) => /^(abundance|value|result)$/i.test(h.trim()));
    if (isLong) {
      const analyteCol = guess(["analyte", "element"]);
      const valueCol = guess(["abundance", "value", "result"]);
      const methodCol = guess(["method"]);
      const methods = methodCol ? Array.from(new Set(data.map((r) => r[methodCol]).filter(Boolean))) : [];
      const analytes = Array.from(new Set(data.map((r) => r[analyteCol]).filter(Boolean)));
      const elements = analytes.filter(isElementColumn).map((sym) => ({ symbol: sym, header: sym, unit: inferUnit(sym, sym), checked: true }));
      setAssayModal({ file, fileName: file.name, format: "long", isPxrf, headers, sampleRows: data.slice(0, 5), allRows: data, mapping: { hole_id: holeCol, from: fromCol, to: toCol, analyte: analyteCol, value: valueCol, method: methodCol }, methods, selectedMethod: methods[0] || null, elements });
    } else {
      // TASKS.csv #210 — a single lab export can carry more than one column for the same element
      // (e.g. this session's real pXRF sample data has "Ag_XRF_Corrected_ppm_D", "Ag_pXRF_ppm", AND
      // "Ag_Error_pXRF_ppm" all matching isElementColumn's front-token match) — one row per matching
      // header would show duplicate "Ag" checkboxes and, if more than one got checked, silently let
      // whichever happened to be LAST in header order win in commitAssayImport's values[e.symbol]
      // assignment. Dedupe to one row per symbol, preferring the first non-"error" match (an
      // uncertainty/error-margin column is never the intended assay value) — the header dropdown in
      // AssayImportModal lets the user repoint any row at a different column, including one of the
      // other candidates this dedupe didn't pick, or a column the auto-detector missed entirely.
      const bySymbol = new Map();
      headers.filter(isElementColumn).forEach((h) => {
        const sym = isElementColumn(h);
        const existing = bySymbol.get(sym);
        if (!existing || (/error/i.test(existing) && !/error/i.test(h))) bySymbol.set(sym, h);
      });
      const elements = Array.from(bySymbol.entries()).map(([sym, h]) => ({ symbol: sym, header: h, unit: inferUnit(h, sym), checked: true }));
      setAssayModal({ file, fileName: file.name, format: "wide", isPxrf, headers, sampleRows: data.slice(0, 5), allRows: data, mapping: { hole_id: holeCol, from: fromCol, to: toCol }, methods: [], selectedMethod: null, elements });
    }
  };

  const commitAssayImport = (modal) => {
    const { format, allRows, mapping, selectedMethod, elements } = modal;
    const chosen = elements.filter((e) => e.checked);
    if (!mapping.hole_id || !mapping.from || !mapping.to) { setNotices((p) => [...p, "Map hole ID, from, and to columns."]); return; }
    let rows = [];
    if (format === "wide") {
      rows = allRows.map((r) => {
        const values = {};
        chosen.forEach((e) => { const v = parseAssayValue(r[e.header]); if (v != null) values[e.symbol] = v; });
        return { hole_id: String(r[mapping.hole_id] ?? "").trim(), from: Number(r[mapping.from]), to: Number(r[mapping.to]), values, source: modal.isPxrf ? "pXRF" : "assay" };
      }).filter((r) => r.hole_id && !isNaN(r.from));
    } else {
      const byInterval = new Map();
      allRows.filter((r) => !mapping.method || r[mapping.method] === selectedMethod).forEach((r) => {
        const sym = isElementColumn(String(r[mapping.analyte] ?? ""));
        if (!sym || !chosen.find((c) => c.symbol === sym)) return;
        const hole = String(r[mapping.hole_id] ?? "").trim(), from = Number(r[mapping.from]), to = Number(r[mapping.to]);
        const key = `${hole}|${from}|${to}`;
        if (!byInterval.has(key)) byInterval.set(key, { hole_id: hole, from, to, values: {}, source: modal.isPxrf ? "pXRF" : "assay" });
        const v = parseAssayValue(r[mapping.value]);
        if (v != null) byInterval.get(key).values[sym] = v;
      });
      rows = Array.from(byInterval.values()).filter((r) => r.hole_id && !isNaN(r.from));
    }
    setAssays((prev) => [...prev, ...rows]);
    setAssayElements((prev) => { const merged = new Map(prev.map((e) => [e.symbol, e])); chosen.forEach((e) => merged.set(e.symbol, e)); return Array.from(merged.values()); });
    if (!colorElement && chosen.length) setColorElement((chosen.find((e) => e.symbol === "Au") || chosen[0]).symbol);
    setNotices((p) => [...p, `Loaded ${rows.length} ${modal.isPxrf ? "pXRF" : "assay"} intervals (${chosen.length} elements).`]);
    setAssayModal(null);
  };

  // TASKS.csv #78 — drag-and-drop as a consistent import method across all data types. Geochem was
  // the one importer left button-only (ViewerModule's CSV importer and GeophysicsModule's CSV/GeoTIFF/
  // GXF importer both already support it) — same file/name-heuristic pattern as GeophysicsModule's
  // dem/srtm/elev heuristic for choosing terrain vs raster drape: a dropped filename containing
  // "pxrf" or "xrf" goes to the pXRF path, everything else defaults to the assay path (matching the
  // button layout's own ordering — "Import assays" is the primary action, pXRF is the secondary one).
  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.name.toLowerCase().endsWith(".csv"));
    const skipped = e.dataTransfer.files.length - files.length;
    if (!files.length) { setNotices((p) => [...p, "Only .csv files can be dropped in directly."]); return; }
    if (skipped) setNotices((p) => [...p, `${skipped} non-CSV file(s) skipped.`]);
    files.forEach((f) => handleFile(f, /pxrf|xrf/i.test(f.name)));
  };

  const runMethod = (methodKey) => {
    const method = GEOCHEM_METHODS[methodKey];
    const missing = method.requires.filter((s) => !availableSymbols.has(s));
    if (missing.length) { setNotices((p) => [...p, `${method.label}: missing ${missing.join(", ")}.`]); return; }
    const targetKey = method.target === "litho" ? "litho_gc" : "alt_gc";
    const rows = assays.map((a) => {
      const value = method.classify(a.values, elementUnits, a);
      if (!value) return null;
      return { hole_id: a.hole_id, from: a.from, to: a.to, value };
    }).filter(Boolean);
    replaceLayer(targetKey, rows);
    setNotices((p) => [...p, `Generated ${rows.length} intervals → ${method.target === "litho" ? "Lithology (geochem)" : "Alteration (geochem)"} layer. Switch to 3D View to see it.`]);
  };

  // ---------- exports ----------
  const exportPlotSVG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    saveFile({ suggestedName: `${diagramId}.svg`, filters: [{ name: "SVG", extensions: ["svg"] }], content: xml });
  };
  const exportPlotPNG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1240; canvas.height = 1120;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const b64 = canvas.toDataURL("image/png").split(",")[1];
      saveFile({ suggestedName: `${diagramId}.png`, filters: [{ name: "PNG", extensions: ["png"] }], content: b64, encoding: "base64" });
    };
    img.src = url;
  };
  const exportProjectedCSV = () => {
    let rows;
    if (diagram.spider) {
      // spider diagrams don't reduce to a single {x,y} per sample — export the full normalized
      // profile instead, one column per element, so the export still means something.
      rows = assays.map((a) => {
        const profile = reeProfile(a, elementUnits, diagram.order, diagram.norm);
        const cols = Object.fromEntries(profile.map((p) => [p.symbol, p.value ?? ""]));
        return { hole_id: a.hole_id, from: a.from, to: a.to, ...cols };
      });
    } else {
      rows = assays.map((a) => {
        const p = diagram.project(a, elementUnits);
        return { hole_id: a.hole_id, from: a.from, to: a.to, x: p?.x ?? "", y: p?.y ?? "" };
      });
    }
    const csv = Papa.unparse(rows);
    saveFile({ suggestedName: `${diagramId}_projected.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: csv });
  };
  const exportAssaysCSV = () => {
    const symbols = assayElements.map((e) => e.symbol);
    const rows = assays.map((a) => ({ hole_id: a.hole_id, from: a.from, to: a.to, source: a.source, ...Object.fromEntries(symbols.map((s) => [s, a.values[s] ?? ""])) }));
    const csv = Papa.unparse(rows);
    saveFile({ suggestedName: "assays.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: csv });
  };

  return (
    <div
      className="ge-body"
      style={{ width: "100%", border: dragOver ? "2px dashed #4a9be0" : "2px dashed transparent", borderRadius: 8 }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* left panel */}
      <div className="ge-panel" style={{ padding: "16px 14px", width: sidebarWidth }}>
        <div className="ge-section-label">Assays &amp; pXRF</div>
        <button onClick={() => fileRef.current.click()} style={panelBtn}><Upload size={13} /> Import assays</button>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) handleFile(f, false); e.target.value = ""; }} />
        <button onClick={() => pxrfRef.current.click()} style={panelBtn}><Beaker size={13} /> Import pXRF</button>
        <input ref={pxrfRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) handleFile(f, true); e.target.value = ""; }} />
        <div style={{ fontSize: 10, color: "#94a1b0", marginTop: 2, lineHeight: 1.4 }}>Or drag a CSV anywhere on this page — filenames with "pxrf"/"xrf" go to the pXRF path, everything else imports as assays.</div>

        <div style={{ fontSize: 11, color: "#94a1b0", margin: "10px 0 4px" }}>
          {assays.length ? `${assays.length} intervals · ${assayElements.length} elements` : "No assays loaded"}
        </div>

        {assayElements.length > 0 && (
          <>
            <div className="ge-section-label" style={{ marginTop: 18 }}>Generate from geochem</div>
            <button onClick={() => runMethod("alteration_boxplot")} style={genBtn}><FlaskConical size={13} /> Alteration (AI/CCPI)</button>
            <button onClick={() => runMethod("litho_winchester")} style={genBtn}>Lithology (Winchester)</button>
            <button onClick={() => runMethod("litho_jensen")} style={genBtn}>Lithology (Jensen)</button>
            <div style={{ fontSize: 10, color: "#94a1b0", marginTop: 6, lineHeight: 1.5 }}>Screening-level classifications — a first pass, not a substitute for a proper plot and petrologic review.</div>

            <div className="ge-section-label" style={{ marginTop: 18 }}>Mass balance</div>
            <button onClick={() => setIsoconOpen(true)} style={genBtn}><Scale size={13} /> Isocon / mass-change calculator</button>
            <button onClick={() => setCorrOpen(true)} style={genBtn}><Grid3x3 size={13} /> Correlation matrix</button>
            <button onClick={() => setGradeStatsOpen(true)} style={genBtn}><Beaker size={13} /> Grade statistics</button>
            <button onClick={() => setQaqcOpen(true)} style={genBtn}><ShieldCheck size={13} /> QAQC (standards/blanks/duplicates)</button>
            <button onClick={() => setSqlOpen(true)} style={genBtn}><TerminalSquare size={13} /> SQL workspace</button>

            <div className="ge-section-label" style={{ marginTop: 18 }}>Reporting</div>
            <button onClick={() => setBestIntOpen(true)} style={genBtn}><Ruler size={13} /> Best-intercept report</button>
            <button onClick={() => setCompositingOpen(true)} style={genBtn}><Ruler size={13} /> Downhole compositing</button>

            <div className="ge-section-label" style={{ marginTop: 18 }}>Export</div>
            <button onClick={exportAssaysCSV} style={panelBtn}><Download size={13} /> Assays → CSV</button>
            <button onClick={exportProjectedCSV} style={panelBtn}><Download size={13} /> Plot data → CSV</button>
            <button onClick={exportPlotPNG} style={panelBtn}><Download size={13} /> Plot → PNG</button>
            <button onClick={exportPlotSVG} style={panelBtn}><Download size={13} /> Plot → SVG</button>
          </>
        )}

        {notices.length > 0 && (
          <div style={{ marginTop: 16, padding: "8px 10px", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, fontSize: 10.5, color: "#7b8794", lineHeight: 1.5, maxHeight: 160, overflowY: "auto" }}>
            {notices.slice(-6).map((n, i) => <div key={i} style={{ marginBottom: 4 }}>{n}</div>)}
          </div>
        )}
      </div>

      <SidebarResizeHandle width={sidebarWidth} onResize={setSidebarWidth} />

      {/* main plot area */}
      <div className="ge-main" style={{ display: "flex", flexDirection: "column", padding: 20, overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <select value={diagramId} onChange={(e) => setDiagramId(e.target.value)} style={selectStyle}>
            {Object.values(ALL_DIAGRAMS).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: "#55606e" }}>
            Colour:
            <select value={colorMode} onChange={(e) => setColorMode(e.target.value)} style={{ ...selectStyle, padding: "5px 8px" }}>
              <option value="hole">by hole</option>
              <option value="element">by element</option>
              <option value="uniform">uniform</option>
            </select>
            {colorMode === "element" && (
              <select value={colorElement || ""} onChange={(e) => setColorElement(e.target.value)} style={{ ...selectStyle, padding: "5px 8px" }}>
                {assayElements.map((el) => <option key={el.symbol} value={el.symbol}>{el.symbol}</option>)}
              </select>
            )}
          </div>
        </div>

        <div style={{ fontSize: 11, color: "#94a1b0", marginBottom: 10 }}>{diagram.caption}</div>

        {missingForDiagram.length > 0 && (
          <div style={{ padding: "10px 12px", background: "#241f14", border: "1px solid #4a3d1e", borderRadius: 8, fontSize: 12, color: "#d8c080", marginBottom: 12 }}>
            This diagram needs {diagram.requires.join(", ")} — missing {missingForDiagram.join(", ")}. Points that can't be projected are dropped.
          </div>
        )}

        {assays.length === 0 ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a1b0", fontSize: 13 }}>
            Import assays or pXRF data to start plotting.
          </div>
        ) : (
          <div style={{ maxWidth: 680 }}>
            <GeochemPlot diagramId={diagramId} samples={assays} elementUnits={elementUnits} colorBy={colorBy} svgRef={svgRef} />
            <div style={{ fontSize: 10.5, color: "#94a1b0", marginTop: 8 }}>
              {diagram.spider
                ? `${assays.filter((a) => reeProfile(a, elementUnits, diagram.order, diagram.norm).some((p) => p.value != null)).length} of ${assays.length} samples have at least one plottable element.`
                : `${assays.filter((a) => diagram.project(a, elementUnits)).length} of ${assays.length} samples plotted.`}
              {" "}Below-detection values substituted at half the detection limit.
            </div>
          </div>
        )}
      </div>

      {assayModal && (
        <AssayImportModal
          modal={assayModal}
          onChange={setAssayModal}
          onCancel={() => setAssayModal(null)}
          onCommit={() => commitAssayImport(assayModal)}
        />
      )}

      {isoconOpen && (
        <IsoconTool
          assays={assays}
          assayElements={assayElements}
          onClose={() => setIsoconOpen(false)}
        />
      )}

      {corrOpen && (
        <CorrelationMatrix
          assays={assays}
          assayElements={assayElements}
          onClose={() => setCorrOpen(false)}
        />
      )}

      {bestIntOpen && (
        <BestIntercepts
          assays={assays}
          assayElements={assayElements}
          onClose={() => setBestIntOpen(false)}
        />
      )}

      {compositingOpen && (
        <CompositingModal
          assays={assays}
          assayElements={assayElements}
          layers={layers}
          onClose={() => setCompositingOpen(false)}
        />
      )}

      {gradeStatsOpen && (
        <GradeStatistics
          assays={assays}
          assayElements={assayElements}
          layers={layers}
          onClose={() => setGradeStatsOpen(false)}
        />
      )}

      {qaqcOpen && (
        <QAQCPanel
          assays={assays}
          assayElements={assayElements}
          onClose={() => setQaqcOpen(false)}
        />
      )}

      {sqlOpen && (
        <Suspense fallback={null}>
          <SQLWorkspaceModal
            collars={collars}
            survey={survey}
            layers={layers}
            assays={assays}
            assayElements={assayElements}
            boundaries={boundaries}
            onClose={() => setSqlOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

const panelBtn = { display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 10px", marginBottom: 6, background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, color: "#1a2028", fontSize: 12, cursor: "pointer" };
const genBtn = { ...panelBtn, background: "#1e3629", border: "1px solid #3d6b52", color: "#8fd9ab" };
const selectStyle = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "7px 10px", color: "#1a2028", fontSize: 12.5 };
