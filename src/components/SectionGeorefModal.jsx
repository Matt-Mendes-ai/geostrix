import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Upload, Trash2 } from "./icons.js";
import ImageTiePointCanvas from "./ImageTiePointCanvas.jsx";
import { sectionLine, fitSectionTransform, sectionResiduals, sectionImageCorners, sectionFitSummary } from "../lib/sectionGeoref.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";

// TASKS.csv #630 — "can GeoStrix georeference vertical images, like a cross section?". The plan-view georeferencer
// (#129, GeoreferencerModal) does maps; this does sections: say where the section line is (a saved cross-section,
// or its two end points), click points on the image and type what the figure says there — the horizontal position
// (distance from the start, or easting / northing) and the elevation. Two opposite grid corners are enough for a
// clean figure; three or more fit a full affine for a slightly rotated scan, with a per-point error to catch typos.
// The image then stands upright in the 3D view on that line (sectionGeoref.js does the maths).
const DISPLAY_MAX = 680;
const TEXTURE_MAX = 4096; // longest side kept — sharp enough to read, and every GPU takes a 4096 texture

const H_KINDS = [
  { id: "distance", label: "Distance from the start (m)" },
  { id: "easting", label: "Easting" },
  { id: "northing", label: "Northing" },
];

export default function SectionGeorefModal({ sections = [], onImport, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const [img, setImg] = useState(null); // { bitmap, width, height, name }
  const [points, setPoints] = useState([]); // [{ id, px, py, h, z }]
  const [hKind, setHKind] = useState("distance");
  const [lineSrc, setLineSrc] = useState(sections.length ? sections[0].id : "manual");
  const [manual, setManual] = useState({ ax: "", ay: "", bx: "", by: "" });
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);
  // TASKS.csv #633 — a PDF: { doc, name, thumbs, numPages } while its page is being picked
  const [pdf, setPdf] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(null); // status text while PDF.js works
  const [pageNo, setPageNo] = useState("");
  const pdfDocRef = useRef(null);
  useEffect(() => () => { pdfDocRef.current?.destroy?.(); }, []);


  const loadPdf = async (file) => {
    setError(null); setImg(null); setPoints([]);
    setPdfBusy("Opening the PDF…");
    try {
      const { openPdf, pdfThumbnails } = await import("../lib/pdfPages.js");
      pdfDocRef.current?.destroy?.();
      const doc = await openPdf(await file.arrayBuffer());
      pdfDocRef.current = doc;
      const baseName = file.name.replace(/\.pdf$/i, "");
      if (doc.numPages === 1) { setPdf({ doc, name: baseName, thumbs: [], numPages: 1 }); await pickPdfPage(doc, 1, baseName); return; }
      setPdfBusy(`Making page previews (${Math.min(doc.numPages, 40)} of ${doc.numPages})…`);
      const thumbs = await pdfThumbnails(doc, 40);
      setPdf({ doc, name: baseName, thumbs, numPages: doc.numPages });
    } catch (err) {
      setError(`Couldn't read this PDF: ${err.message || err}`);
    } finally { setPdfBusy(null); }
  };
  const pickPdfPage = async (doc, n, baseName) => {
    setPdfBusy(`Rendering page ${n}…`); setError(null);
    try {
      const { renderPdfPage } = await import("../lib/pdfPages.js");
      const canvas = await renderPdfPage(doc, n, 4000);
      setImg({ bitmap: canvas, width: canvas.width, height: canvas.height });
      setPoints([]);
      setName((cur) => cur || `${baseName} p.${n}`);
      setPdf((p) => (p ? { ...p, page: n } : p));
    } catch (err) {
      setError(`Couldn't draw page ${n}: ${err.message || err}`);
    } finally { setPdfBusy(null); }
  };

  const loadImage = (file) => {
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") { loadPdf(file); return; }
    setError(null); setPdf(null);
    const url = URL.createObjectURL(file);
    const bitmap = new window.Image();
    bitmap.onload = () => { setImg({ bitmap, width: bitmap.naturalWidth, height: bitmap.naturalHeight }); setPoints([]); setName((n) => n || file.name.replace(/\.[^.]+$/, "")); URL.revokeObjectURL(url); };
    bitmap.onerror = () => { setError("Couldn't read this image — use a PDF, PNG or JPG."); URL.revokeObjectURL(url); };
    bitmap.src = url;
  };

  const line = useMemo(() => {
    try {
      if (lineSrc !== "manual") {
        const s = sections.find((x) => x.id === lineSrc);
        return s ? { ...sectionLine({ x: s.ax, y: s.ay }, { x: s.bx, y: s.by }), name: s.name } : null;
      }
      const v = Object.fromEntries(Object.entries(manual).map(([k, x]) => [k, x === "" ? NaN : Number(x)]));
      if (![v.ax, v.ay, v.bx, v.by].every(Number.isFinite)) return null;
      return sectionLine({ x: v.ax, y: v.ay }, { x: v.bx, y: v.by });
    } catch (err) { return { error: err.message }; }
  }, [lineSrc, manual, sections]);

  const usable = useMemo(() => points.filter((p) => p.h !== "" && p.z !== "" && Number.isFinite(Number(p.h)) && Number.isFinite(Number(p.z))), [points]);
  const { fit, fitError } = useMemo(() => {
    if (!line || line.error || usable.length < 2) return { fit: null, fitError: line?.error || null };
    try { return { fit: fitSectionTransform(usable.map((p) => ({ ...p, hKind })), line), fitError: null }; }
    catch (err) { return { fit: null, fitError: err.message }; }
  }, [line, usable, hKind]);
  const res = fit ? sectionResiduals(fit) : null;
  const rmse = res && res.length > 2 ? Math.sqrt(res.reduce((s, r) => s + r.error ** 2, 0) / res.length) : null;
  const summary = fit && img ? sectionFitSummary(fit, img.width, img.height) : null;

  const updatePoint = (id, patch) => setPoints((p) => p.map((pt) => (pt.id === id ? { ...pt, ...patch } : pt)));

  const doImport = () => {
    if (!img || !fit) return;
    setBusy(true); setError(null);
    try {
      const k = Math.min(1, TEXTURE_MAX / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); // JPEG has no transparency: white paper, as printed
      ctx.drawImage(img.bitmap, 0, 0, c.width, c.height);
      onImport({
        name: name.trim() || "Section image",
        dataUrl: c.toDataURL("image/jpeg", 0.88),
        width: c.width, height: c.height,
        corners: sectionImageCorners(fit, line, img.width, img.height),
        line: { a: { x: line.a.x, y: line.a.y }, b: { x: line.b.x, y: line.b.y } },
        rmse,
      });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const hLabel = H_KINDS.find((k) => k.id === hKind).label;
  return (
    <div style={overlay}>
      <div style={panel} role="dialog" aria-modal="true" aria-label="Georeference a section image" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>Georeference a section image</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>Put a cross-section figure (a PDF page, PNG or JPG) upright in the 3D view: choose its section line, then click points on it and type their position and elevation.</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label="Close" size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", gap: 16, flex: 1, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => fileInput.current.click()} style={btn(false)}><Upload size={14} style={{ marginRight: 6 }} /> Load section image (PDF / PNG / JPG)…</button>
            <input ref={fileInput} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) loadImage(f); e.target.value = ""; }} />
            {pdfBusy && <div style={note}>{pdfBusy}</div>}
            {pdf && pdf.numPages > 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: DISPLAY_MAX }}>
                <div style={note}>{pdf.page ? `Page ${pdf.page} of ${pdf.numPages} — pick another:` : `${pdf.name}.pdf has ${pdf.numPages} pages — click the one with the section:`}</div>
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                  {pdf.thumbs.map((t) => (
                    <button key={t.page} type="button" onClick={() => pickPdfPage(pdf.doc, t.page, pdf.name)} disabled={!!pdfBusy} title={`Page ${t.page}`} aria-label={`Use page ${t.page}`}
                      style={{ flexShrink: 0, padding: 2, background: "var(--color-bg)", border: pdf.page === t.page ? "2px solid var(--color-accent)" : "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer" }}>
                      <img src={t.dataUrl} alt="" width={Math.round(t.width * 0.6)} height={Math.round(t.height * 0.6)} style={{ display: "block" }} />
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{t.page}</div>
                    </button>
                  ))}
                </div>
                {pdf.numPages > pdf.thumbs.length && (
                  <label style={{ ...note, display: "flex", gap: 6, alignItems: "center" }}>
                    Page number <input type="number" min={1} max={pdf.numPages} value={pageNo} onChange={(e) => setPageNo(e.target.value)} style={{ ...numInput, width: 70 }} aria-label="PDF page number" />
                    <button type="button" style={{ ...btn(false), padding: "4px 10px" }} disabled={!!pdfBusy || !(Number(pageNo) >= 1 && Number(pageNo) <= pdf.numPages)} onClick={() => pickPdfPage(pdf.doc, Math.round(Number(pageNo)), pdf.name)}>Open page</button>
                    <span>(previews show the first {pdf.thumbs.length})</span>
                  </label>
                )}
              </div>
            )}
            {img ? (
              <ImageTiePointCanvas image={img} points={points} maxSize={DISPLAY_MAX} // TASKS.csv #632 — zoom / pan / drag points
                onAdd={(px, py) => setPoints((p) => [...p, { id: `sp_${Date.now()}_${p.length}`, px, py, h: "", z: "" }])}
                onMove={(id, px, py) => updatePoint(id, { px, py })} />
            ) : pdf ? null : (
              <div style={{ width: DISPLAY_MAX, maxWidth: "100%", height: 360, border: "1px dashed var(--color-border-light)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)", fontSize: "var(--font-size-base)", textAlign: "center", padding: 12 }}>
                Load the section figure — a page of a PDF report, or a PNG/JPG. Tip: points where labelled grid lines cross (an elevation line and a distance or easting tick) are the easiest to read.
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 300, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={label}>1. Section line</div>
            <select value={lineSrc} onChange={(e) => setLineSrc(e.target.value)} style={inputFull} aria-label="Section line">
              {sections.map((s) => <option key={s.id} value={s.id}>Saved section: {s.name}</option>)}
              <option value="manual">Type the start and end points…</option>
            </select>
            {lineSrc === "manual" && (
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 4, alignItems: "center", fontSize: "var(--font-size-sm)" }}>
                <span />
                <span style={{ color: "var(--color-text-muted)" }}>Easting</span><span style={{ color: "var(--color-text-muted)" }}>Northing</span>
                <span>Start (left end of the figure)</span>
                <input type="number" aria-label="Start easting" value={manual.ax} onChange={(e) => setManual((m) => ({ ...m, ax: e.target.value }))} style={numInput} />
                <input type="number" aria-label="Start northing" value={manual.ay} onChange={(e) => setManual((m) => ({ ...m, ay: e.target.value }))} style={numInput} />
                <span>End</span>
                <input type="number" aria-label="End easting" value={manual.bx} onChange={(e) => setManual((m) => ({ ...m, bx: e.target.value }))} style={numInput} />
                <input type="number" aria-label="End northing" value={manual.by} onChange={(e) => setManual((m) => ({ ...m, by: e.target.value }))} style={numInput} />
              </div>
            )}
            {line && !line.error && <div style={note}>Line {line.length.toFixed(0)} m long, azimuth {line.azimuth.toFixed(1)}° (project coordinates).</div>}

            <div style={label}>2. Control points ({points.length})</div>
            <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", gap: 6, alignItems: "center" }}>
              Horizontal values are
              <select value={hKind} onChange={(e) => setHKind(e.target.value)} style={{ ...numInput, width: "auto" }}>{H_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
            </label>
            {points.length === 0 ? (
              <div style={note}>Click the image to place a point, then type what the figure says there. Two opposite corners of the grid are enough for a clean figure; use 3 or more for a scan that's slightly rotated.</div>
            ) : (
              <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
                <thead><tr><th style={th}>#</th><th style={th}>{hLabel}</th><th style={th}>Elevation (m)</th><th style={th}>Error (m)</th><th style={th} /></tr></thead>
                <tbody>
                  {points.map((p, i) => {
                    const ui = usable.indexOf(p), r = res && ui >= 0 ? res[ui] : null;
                    return (
                      <tr key={p.id}>
                        <td style={td}>{i + 1}</td>
                        <td style={td}><input type="number" aria-label={`Point ${i + 1} horizontal`} value={p.h} onChange={(e) => updatePoint(p.id, { h: e.target.value })} style={numInput} /></td>
                        <td style={td}><input type="number" aria-label={`Point ${i + 1} elevation`} value={p.z} onChange={(e) => updatePoint(p.id, { z: e.target.value })} style={numInput} /></td>
                        <td style={{ ...td, color: r && rmse && r.error > rmse * 2 ? "var(--color-danger-alt)" : "var(--color-text)" }}>{r && usable.length > 2 ? r.error.toFixed(1) : "—"}</td>
                        <td style={td}><Trash2 aria-label="Remove this control point" title="Remove this control point" role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={() => setPoints((q) => q.filter((x) => x.id !== p.id))} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {summary && (
              <div style={note}>
                The image covers {summary.fromDist.toFixed(0)}–{summary.toDist.toFixed(0)} m along the line and elevation {summary.zBottom.toFixed(0)}–{summary.zTop.toFixed(0)} m{fit.kind === "scale" ? " (2-point fit: no rotation)" : rmse != null ? `; fit error (RMSE) ${rmse.toFixed(1)} m` : ""}.
                {summary.mirrored && " The figure's left side is at the END of the line (it's drawn looking the other way) — that's fine, it will be placed correctly."}
                {summary.upsideDown && <span style={{ color: "var(--color-danger-alt)" }}> Elevation goes DOWN towards the top of the image — check the elevations you typed.</span>}
                {rmse != null && res.some((r) => r.error > rmse * 3) && <span style={{ color: "var(--color-danger-alt)" }}> One point is much further off than the others — check its click and its numbers.</span>}
              </div>
            )}
            {fitError && <div style={{ ...note, color: "var(--color-danger-alt)" }}>{fitError}</div>}
            {!line && lineSrc === "manual" && <div style={note}>Type both end points of the section line.</div>}

            <div style={label}>3. Name</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Section 4500N (1994 report)" style={inputFull} aria-label="Name" />
            {error && <div style={{ padding: "8px 10px", background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", borderRadius: 6, fontSize: "var(--font-size-base)", color: "var(--color-danger-text)" }}>{error}</div>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>Cancel</button>
          <button onClick={doImport} disabled={!fit || busy} style={{ ...btn(true), flex: 2, opacity: fit && !busy ? 1 : 0.5, cursor: fit && !busy ? "pointer" : "not-allowed" }}>
            {busy ? "Placing…" : "Place in 3D"}
          </button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(1120px, 96vw)", maxHeight: "92vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const label = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginTop: 4 };
const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };
const btn = (primary) => ({ padding: "8px 12px", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border-light)", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "var(--color-success-text)" : "var(--color-text-secondary)", display: "flex", alignItems: "center", justifyContent: "center" });
const th = { padding: "4px 6px", color: "var(--color-text-secondary)", fontWeight: 500, textAlign: "left", borderBottom: "1px solid var(--color-border)" };
const td = { padding: "4px 6px", color: "var(--color-text)" };
const numInput = { width: 96, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" };
const inputFull = { ...numInput, width: "100%", boxSizing: "border-box", fontSize: "var(--font-size-base)" };
