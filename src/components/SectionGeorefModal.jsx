import React, { useEffect, useMemo, useRef, useState } from "react";
import { Upload, Trash2 } from "./icons.js";
import ImageTiePointCanvas from "./ImageTiePointCanvas.jsx";
import { sectionLine, fitSectionTransform, sectionResiduals, sectionImageCorners, sectionFitSummary, imagesOnLine, moveSectionImage } from "../lib/sectionGeoref.js";
import { projectExtent, detectHKind, sectionLineFor, nearestSection, flowHint } from "../lib/sectionGeorefFlow.js"; // TASKS.csv #4071
import SectionLinePlan from "./SectionLinePlan.jsx"; // TASKS.csv #3924
import { StepNumbers } from "./StepPane.jsx";
import StepDialog, { stepDialogStyles } from "./StepDialog.jsx"; // TASKS.csv #4073 — the shared step shell: header, step bar, Back / the one gold primary, the Help card
import { activateOnKey } from "../lib/a11y.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926 — '0,05' and '0.05' both read

// TASKS.csv #630 — georeferencing a VERTICAL image (a scanned or exported cross-section) so it stands in the 3D view where it belongs: click points on the
// figure and type what it says there (the horizontal position and the elevation); the image then stands upright on its section line (sectionGeoref.js does the maths).
// TASKS.csv #3924 — a figure is never placed on a line by default: the line is chosen, drawn or typed, and a figure already standing on it is said.
// TASKS.csv #4071 — users were lost between three up-front choices before they had seen their figure. Now three steps, one on screen at a time, a step bar:
//   1 Figure: load the PDF page or image;  2 Points: click labelled points and type what the figure says;  3 Place: check the placement on a small plan, Place.
// The line is no longer a choice up front: eastings alone give an east-west line at ONE typed northing (northings alone, a north-south line at one easting), an
// easting AND a northing on each point give the line itself, and only distances along the line ask for one (a saved section, two clicks, typed ends — one recommended).
// "Horizontal values are" is detected from the numbers typed (lib/sectionGeorefFlow.js) with a one-click override. The long explanations are in the Help card.
// With `moveImage` the dialog is one screen: the new line for that figure (lib moveSectionImage).
const DISPLAY_MAX = 620;
const TEXTURE_MAX = 4096; // longest side kept — sharp enough to read, and every GPU takes a 4096 texture
const KINDS = ["easting", "northing", "distance"];
const kindLabel = (k) => (k === "easting" ? tr("Easting") : k === "northing" ? tr("Northing") : tr("Distance"));

// the line of a distance figure: a saved section (the nearest the holes recommended), two clicks on the plan, or its typed ends
function LinePicker({ sections, nearest, lineSrc, setLineSrc, drawing, setDrawing, manual, setManual, showEnds, setShowEnds, collars, images, line, lineOk, size = 260 }) {
  const other = tr("Another saved section");
  const setEnd = (k) => (v) => setManual((m) => ({ ...m, [k]: v == null ? "" : String(v) }));
  const cell = (k, label) => <NumberInput allowEmpty aria-label={label} value={manual[k] === "" ? null : manual[k]} onChange={setEnd(k)} style={numInput} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={label}>{tr("Which line?")}</div>
      {nearest && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="gs-btn" aria-pressed={lineSrc === nearest.id} style={lineSrc === nearest.id ? { borderColor: "var(--color-accent)", fontWeight: 600 } : undefined} onClick={() => { setLineSrc(nearest.id); setDrawing(false); setShowEnds(false); }}>{tr("Use “{name}”", { name: nearest.name })}</button>
          <span style={note}>{tr("Recommended")}</span>
        </div>
      )}
      {sections.length > 1 && (
        <select value={sections.some((s) => s.id === lineSrc) ? lineSrc : ""} onChange={(e) => { if (e.target.value) { setLineSrc(e.target.value); setDrawing(false); setShowEnds(false); } }} style={inputFull} aria-label={other}>
          <option value="">{other}</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="gs-btn gs-btn--sm" aria-pressed={drawing} onClick={() => { setDrawing((d) => !d); setShowEnds(false); }}>{drawing ? tr("Stop drawing") : tr("Draw on the plan")}</button>
        <button type="button" className="gs-btn gs-btn--sm" aria-pressed={showEnds} onClick={() => { setShowEnds((s) => !s); setDrawing(false); setLineSrc("manual"); }}>{tr("Type the ends")}</button>
      </div>
      {drawing && <div style={note}>{tr("Click the left end, then the right end.")}</div>}
      {showEnds && (
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 4, alignItems: "center", fontSize: "var(--font-size-sm)" }}>
          <span /><span style={{ color: "var(--color-text-muted)" }}>{kindLabel("easting")}</span><span style={{ color: "var(--color-text-muted)" }}>{kindLabel("northing")}</span>
          <span>{tr("Start")}</span>{cell("ax", `${tr("Start")} ${kindLabel("easting")}`)}{cell("ay", `${tr("Start")} ${kindLabel("northing")}`)}
          <span>{tr("End")}</span>{cell("bx", `${tr("End")} ${kindLabel("easting")}`)}{cell("by", `${tr("End")} ${kindLabel("northing")}`)}
        </div>
      )}
      {(drawing || (lineOk && size > 0)) && <SectionLinePlan collars={collars} sections={sections} images={images} line={lineOk ? line : null} pickedId={lineSrc !== "manual" ? lineSrc : null}
        drawing={drawing} onPick={(id) => { setLineSrc(id); setDrawing(false); setShowEnds(false); }} onDrawn={(a, b) => { const r = (v) => String(Math.round(v * 10) / 10); setManual({ ax: r(a.x), ay: r(a.y), bx: r(b.x), by: r(b.y) }); setLineSrc("manual"); setDrawing(false); }} size={size} />}
    </div>
  );
}

export default function SectionGeorefModal({ sections = [], onImport, onClose, rlOffset = null, collars = [], images = [], moveImage = null, onMove }) { // rlOffset: TASKS.csv #3880 — the mine grid's RL datum (grid RL - elevation), when the project has one
  const [img, setImg] = useState(null); // { bitmap, width, height }
  const [points, setPoints] = useState([]); // [{ id, px, py, h, h2, z }]  h: the value typed; h2: the other horizontal axis (optional)
  const [hKindUser, setHKindUser] = useState(null); // the override; null = detected from the numbers
  const [second, setSecond] = useState(false); // the "+ Northing" / "+ Easting" column
  const [cross, setCross] = useState(""); // the one northing (or easting) of a line given by eastings (northings) alone
  const [lineSrc, setLineSrc] = useState(""); // TASKS.csv #3924 — nothing preselected: "" until the user picks, draws or types the line of a distance figure
  const [step, setStep] = useState(0); // 0 Figure, 1 Points, 2 Place
  const [drawing, setDrawing] = useState(false);
  const [showEnds, setShowEnds] = useState(false);
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
    setPdfBusy(tr("Opening the PDF…"));
    try {
      const { openPdf, pdfThumbnails } = await import("../lib/pdfPages.js");
      pdfDocRef.current?.destroy?.();
      const doc = await openPdf(await file.arrayBuffer());
      pdfDocRef.current = doc;
      const baseName = file.name.replace(/\.pdf$/i, "");
      if (doc.numPages === 1) { setPdf({ doc, name: baseName, thumbs: [], numPages: 1 }); await pickPdfPage(doc, 1, baseName); return; }
      
      const thumbs = await pdfThumbnails(doc, 40);
      setPdf({ doc, name: baseName, thumbs, numPages: doc.numPages });
    } catch (err) {
      setError(tr("Couldn't read this PDF: {v}", { v: err.message || err }));
    } finally { setPdfBusy(null); }
  };
  const pickPdfPage = async (doc, n, baseName) => {
    setPdfBusy(tr("Rendering page {n}…", { n })); setError(null);
    try {
      const { renderPdfPage } = await import("../lib/pdfPages.js");
      const canvas = await renderPdfPage(doc, n, 4000);
      setImg({ bitmap: canvas, width: canvas.width, height: canvas.height });
      setPoints([]);
      setName((cur) => cur || `${baseName} p.${n}`);
      setPdf((p) => (p ? { ...p, page: n } : p));
    } catch (err) {
      setError(tr("Couldn't draw page {n}: {v}", { n, v: err.message || err }));
    } finally { setPdfBusy(null); }
  };
  const loadImage = (file) => {
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") { loadPdf(file); return; }
    setError(null); setPdf(null);
    const url = URL.createObjectURL(file);
    const bitmap = new window.Image();
    bitmap.onload = () => { setImg({ bitmap, width: bitmap.naturalWidth, height: bitmap.naturalHeight }); setPoints([]); setName((n) => n || file.name.replace(/\.[^.]+$/, "")); URL.revokeObjectURL(url); };
    bitmap.onerror = () => { setError(tr("Not a PDF, PNG or JPG.")); URL.revokeObjectURL(url); };
    bitmap.src = url;
  };

  // what the typed numbers say
  const extent = useMemo(() => projectExtent({ collars, sections }), [collars, sections]);
  const detected = useMemo(() => detectHKind(points.map((p) => p.h), extent), [points, extent]);
  const hKind = hKindUser || detected || "distance";
  const otherKind = hKind === "easting" ? "northing" : "easting";
  const nameLabel = tr("Name");
  const zLabel = rlOffset ? tr("RL (m)") : tr("Elevation (m)");
  const crossLabel = hKind === "easting" ? tr("Line northing") : tr("Line easting");
  const title = moveImage ? tr("Move “{name}”", { name: moveImage.name }) : tr("Georeference a section");
  const farOff = (n) => tr("Point {n} is far off: fix it.", { n });
  const nearest = useMemo(() => nearestSection(sections, collars), [sections, collars]);
  const flow = useMemo(() => sectionLineFor({ hKind, points: second ? points : points.map((p) => ({ ...p, h2: "" })), cross }), [hKind, points, second, cross]);
  const picked = useMemo(() => { // a distance figure's line: a saved section, or the typed / drawn ends
    try {
      if (!lineSrc) return null;
      if (lineSrc !== "manual") { const s = sections.find((x) => x.id === lineSrc); return s ? { ...sectionLine({ x: s.ax, y: s.ay }, { x: s.bx, y: s.by }), name: s.name } : null; }
      const v = Object.fromEntries(Object.entries(manual).map(([k, x]) => [k, x === "" ? NaN : Number(x)]));
      if (![v.ax, v.ay, v.bx, v.by].every(Number.isFinite)) return null;
      return sectionLine({ x: v.ax, y: v.ay }, { x: v.bx, y: v.by });
    } catch (err) { return { error: err.message }; }
  }, [lineSrc, manual, sections]);
  const line = moveImage || hKind === "distance" ? picked : flow.line;
  const lineOk = !!line && !line.error;
  const lineError = line?.error || flow.error || null;

  const usable = useMemo(() => points.map((p, i) => ({ ...p, i })).filter((p) => p.h !== "" && p.z !== "" && Number.isFinite(Number(p.h)) && Number.isFinite(Number(p.z))), [points]);
  const { fit, fitError, rows: fitRows } = useMemo(() => {
    if (!lineOk || usable.length < 2) return { fit: null, fitError: null, rows: [] };
    try {
      const viaPoints = flow.via === "points" && hKind !== "distance"; // the line goes through the points: their distances along it
      const pts = usable.filter((p) => !viaPoints || Number.isFinite(flow.distances?.[p.i])).map((p) => ({ ...p, hKind: viaPoints ? "distance" : hKind, h: viaPoints ? flow.distances[p.i] : p.h, z: rlOffset ? Number(p.z) - rlOffset : p.z /* TASKS.csv #3880 — typed as the figure's RL, placed at the elevation the terrain and the collars use */ }));
      return { fit: fitSectionTransform(pts, line), fitError: null, rows: pts };
    } catch (err) { return { fit: null, fitError: err.message, rows: [] }; }
  }, [line, lineOk, usable, hKind, rlOffset, flow]);
  const res = fit ? sectionResiduals(fit) : null;
  const rmse = res && res.length > 2 ? Math.sqrt(res.reduce((s, r) => s + r.error ** 2, 0) / res.length) : null;
  const summary = fit && img ? sectionFitSummary(fit, img.width, img.height) : null;
  const onLine = lineOk ? imagesOnLine(images, line, moveImage?.id) : []; // #3924 — the figures already standing on this line
  const hint = moveImage ? null : flowHint({ rows: points, hKind, need: hKind === "distance" ? (lineOk ? null : "line") : flow.need, lineOk, lineError });
  const hintText = !hint || hint.id === "two" ? "" : hint.id === "value" ? tr("Point {n} needs a value.", { n: hint.n }) : hint.id === "elevation" ? tr("Point {n} needs an elevation.", { n: hint.n })
    : hint.id === "northing" || hint.id === "easting" ? tr("Fill in “{what}”.", { what: crossLabel }) : hint.id === "line" ? tr("Choose a line.") : tr(hint.text);
    const outlier = rmse != null ? res.findIndex((r) => r.error > Math.max(rmse * 2, 0.5) && r.error > rmse * 3 - 1e-9) : -1;
  const thumb = useMemo(() => { // step 3: the figure beside its plan
    if (step !== 2 || !img) return null;
    const k = Math.min(1, 320 / Math.max(img.width, img.height)), c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img.bitmap, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  }, [step, img]);

  const updatePoint = (id, patch) => setPoints((p) => p.map((pt) => (pt.id === id ? { ...pt, ...patch } : pt)));
  const doMove = () => {
    if (!moveImage || !lineOk) return;
    try { const m = moveSectionImage(moveImage, line); onMove?.(m.patch, line.name || null); } catch (err) { setError(tr(err.message)); }
  };
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
  const pickerProps = { sections, nearest, lineSrc, setLineSrc, drawing, setDrawing, manual, setManual, showEnds, setShowEnds, collars, images, line, lineOk };

  const helpBody = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-accent-dark)", marginBottom: 6, cursor: "pointer" }}>{tr("How it works")}</summary>
            <svg width="100%" viewBox="0 0 392 120" aria-hidden="true" style={{ display: "block", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 8, maxWidth: 392 }}>
              <g style={{ stroke: "var(--color-text-muted)" }} strokeWidth={1}><line x1={40} y1={16} x2={40} y2={100} /><line x1={40} y1={100} x2={370} y2={100} /></g>
              <circle cx={40} cy={100} r={6} style={{ fill: "var(--color-guide)" }} /><circle cx={360} cy={24} r={6} style={{ fill: "var(--color-guide)" }} />
              <text x={52} y={92} fontSize={11} style={{ fill: "var(--color-guide)" }}>1: 534,000 / 700</text><text x={236} y={20} fontSize={11} style={{ fill: "var(--color-guide)" }}>2: 535,200 / 1,300</text>
              <text x={120} y={62} fontSize={12} style={{ fill: "var(--color-text-secondary)" }}>{tr("Click where two labelled lines cross.")}</text>
            </svg>
            <div style={note}><b>{tr("Points")}</b> {tr("Two grid corners fit a clean figure; 3 or more fit a rotated scan.")}</div>
            <div style={note}><b>{tr("Values")}</b> {tr("Eastings or northings place the line; distances need one.")}</div>
            <div style={note}><b>{tr("Elevation")}</b> {rlOffset ? tr("Type the RL as the figure shows it.") : tr("Type it as the figure shows, above the datum.")}</div>
            <div style={note}><b>{tr("Reversed")}</b> {tr("A figure drawn looking the other way is placed correctly.")}</div>
            <div style={note}><b>{tr("Later")}</b> {tr("Section images: Move to another line, Match to terrain.")}</div>
    </details>
  );
  const steps = moveImage ? [
    { key: "move", label: title, render: () => (<>
            <div style={{ flex: 1, minWidth: 300, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={note}>{tr("“{name}” keeps its place along the line.", { name: moveImage.name })}</div>
              <SectionLinePlan collars={collars} sections={sections} images={images} line={lineOk ? line : null} pickedId={lineSrc !== "manual" ? lineSrc : null} drawing={drawing}
                onPick={(id) => { setLineSrc(id); setDrawing(false); }} onDrawn={(a, b) => { const r = (v) => String(Math.round(v * 10) / 10); setManual({ ax: r(a.x), ay: r(a.y), bx: r(b.x), by: r(b.y) }); setLineSrc("manual"); setDrawing(false); }} size={340} />
            </div>
            <div style={{ flex: 1, minWidth: 280 }}><LinePicker {...pickerProps} size={0} /></div>
    </>), primary: { label: tr("Move"), onClick: doMove, disabled: !lineOk } },
  ] : [
    { key: "figure", label: tr("Figure"), render: () => (<>
            {img ? (
              <div style={{ flex: 1.6, minWidth: 320, maxWidth: DISPLAY_MAX, border: "1px solid var(--color-border)", borderRadius: 6, overflow: "hidden", alignSelf: "flex-start" }}>
                <canvas ref={(c) => { if (c && img) { const k = Math.min(1, DISPLAY_MAX / Math.max(img.width, img.height)); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img.bitmap, 0, 0, c.width, c.height); } }} style={{ display: "block", width: "100%", background: "#fff" }} aria-label={tr("The figure")} role="img" />
              </div>
            ) : (
              <div style={{ ...dropZone }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) loadImage(f); }}>
                <Upload size={30} />
                <div style={{ fontSize: "var(--font-size-lg)" }}>{tr("Drop a PDF, PNG or JPG")}</div>
                <button type="button" className="gs-btn" onClick={() => fileInput.current.click()}>{tr("Browse…")}</button>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 8 }}>
              {img && <button type="button" className="gs-btn gs-btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => fileInput.current.click()}>{tr("Choose another…")}</button>}
              <input ref={fileInput} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: "none" }} onChange={(e) => { const f = e.target.files[0]; if (f) loadImage(f); e.target.value = ""; }} />
              {pdfBusy && <div style={note}>{pdfBusy}</div>}
              {pdf && pdf.numPages > 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={label}>{pdf.page ? tr("Page {page} of {numPages}", { page: pdf.page, numPages: pdf.numPages }) : tr("Pick the page.")}</div>
                  <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                    {pdf.thumbs.map((t) => (
                      <button key={t.page} type="button" data-btn-own onClick={() => pickPdfPage(pdf.doc, t.page, pdf.name)} disabled={!!pdfBusy} title={tr("Page {page}", { page: t.page })} aria-label={tr("Use page {page}", { page: t.page })}
                        style={{ flexShrink: 0, padding: 2, background: "var(--color-bg)", border: pdf.page === t.page ? "2px solid var(--color-accent)" : "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer" }}>
                        <img src={t.dataUrl} alt="" width={Math.round(t.width * 0.6)} height={Math.round(t.height * 0.6)} style={{ display: "block" }} />
                        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{t.page}</div>
                      </button>
                    ))}
                  </div>
                  {pdf.numPages > pdf.thumbs.length && (
                    <label style={{ ...note, display: "flex", gap: 6, alignItems: "center" }}>{tr("Page number")}{" "}<NumberInput min={1} max={pdf.numPages} step={1} value={pageNo === "" ? null : pageNo} onChange={(v) => setPageNo(String(v))} style={{ ...numInput, width: 70 }} aria-label={tr("PDF page number")} />
                      <button type="button" className="gs-btn gs-btn--sm" disabled={!!pdfBusy || !(Number(pageNo) >= 1 && Number(pageNo) <= pdf.numPages)} onClick={() => pickPdfPage(pdf.doc, Math.round(Number(pageNo)), pdf.name)}>{tr("Open page")}</button>
                    </label>
                  )}
                </div>
              )}
            </div>
    </>), primary: { label: tr("Next: points"), disabled: !img } },
    { key: "points", label: tr("Points"), render: () => (<>
            <div style={{ alignSelf: "flex-start", maxWidth: "100%" }}>
              <ImageTiePointCanvas image={img} points={points} maxSize={DISPLAY_MAX} // TASKS.csv #632 — zoom / pan / drag points
                onAdd={(px, py) => setPoints((p) => [...p, { id: `sp_${Date.now()}_${p.length}`, px, py, h: "", h2: "", z: "" }])}
                onMove={(id, px, py) => updatePoint(id, { px, py })} />
            </div>
            <div style={{ flex: 1, minWidth: 300, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={note}>{tr("Click a labelled point, then type its numbers.")}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={label}>{tr("Values")}</span>
                {KINDS.map((k) => <button key={k} type="button" data-btn-own aria-pressed={hKind === k} onClick={() => { setHKindUser(k); if (k === "distance") setSecond(false); }} style={chip(hKind === k)}>{kindLabel(k)}{hKind === k && !hKindUser && detected ? " · " + tr("detected") : ""}</button>)}
              </div>
              {points.length > 0 && (
                <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
                  <thead><tr><th style={th}>#</th><th style={th}>{kindLabel(hKind)}</th>{second && hKind !== "distance" && <th style={th}>{kindLabel(otherKind)}</th>}<th style={th}>{zLabel}</th><th style={th} /></tr></thead>
                  <tbody>
                    {points.map((p, i) => (
                      <tr key={p.id}>
                        <td style={td}>{i + 1}</td>
                        <td style={td}><NumberInput allowEmpty aria-label={`${kindLabel(hKind)} ${i + 1}`} value={p.h === "" ? null : p.h} onChange={(v) => updatePoint(p.id, { h: v == null ? "" : String(v) })} style={numInput} /></td>
                        {second && hKind !== "distance" && <td style={td}><NumberInput allowEmpty aria-label={`${kindLabel(otherKind)} ${i + 1}`} value={p.h2 === "" ? null : p.h2} onChange={(v) => updatePoint(p.id, { h2: v == null ? "" : String(v) })} style={numInput} /></td>}
                        <td style={td}><NumberInput allowEmpty aria-label={`${zLabel} ${i + 1}`} value={p.z === "" ? null : p.z} onChange={(v) => updatePoint(p.id, { z: v == null ? "" : String(v) })} style={numInput} /></td>
                        <td style={td}>{outlier >= 0 && fitRows[outlier]?.i === i && <span style={{ color: "var(--color-danger-fg)", marginInlineEnd: 6 }} title={farOff(i + 1)}>!</span>}<Trash2 aria-label={tr("Remove this control point")} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={() => setPoints((q) => q.filter((x) => x.id !== p.id))} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {hKind !== "distance" && points.length > 0 && !second && <button type="button" className="gs-btn gs-btn--sm gs-btn--quiet" style={{ alignSelf: "flex-start" }} onClick={() => setSecond(true)}>{hKind === "easting" ? tr("+ Northing") : tr("+ Easting")}</button>}
              {hKind !== "distance" && flow.via !== "points" && points.length > 0 && (
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={label}>{crossLabel}</span>
                  <NumberInput allowEmpty value={cross === "" ? null : cross} onChange={(v) => setCross(v == null ? "" : String(v))} style={inputFull} aria-label={crossLabel} /></label>
              )}
              {hKind === "distance" && points.length > 0 && <LinePicker {...pickerProps} />}
              {fitError && <div style={errBox}>{tr(fitError)}</div>}
            </div>
    </>), primary: { label: tr("Next: place"), disabled: !fit || !!hint }, hint: points.length > 0 ? hintText : "" },
    { key: "place", label: tr("Place"), render: () => (<>
            <div style={{ flex: 1.2, minWidth: 300, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={label}>{tr("On the map")}</div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <SectionLinePlan collars={collars} sections={sections} images={images} line={lineOk ? line : null} pickedId={lineSrc !== "manual" && hKind === "distance" ? lineSrc : null} extent={summary ? { from: summary.fromDist, to: summary.toDist } : null} size={300} />
                {thumb && <img src={thumb} alt="" style={{ maxWidth: 200, border: "1px solid var(--color-border)", borderRadius: 4 }} />}
              </div>
              {summary && <StepNumbers rows={[{ label: tr("Width"), value: `${Math.abs(summary.toDist - summary.fromDist).toFixed(0)} m` }, { label: tr("Height"), value: `${Math.min(summary.zBottom, summary.zTop).toFixed(0)}–${Math.max(summary.zBottom, summary.zTop).toFixed(0)} m` }, rmse != null && { label: tr("Fit error"), value: `${rmse.toFixed(1)} m` }]} />}{/* #4073 — StepPane's result rows: the same look as a pane's Result step */}
              {summary?.upsideDown && <div style={warnBox}>{tr("Elevations fall going up: check them.")}</div>}
              {outlier >= 0 && <div style={warnBox}>{farOff((fitRows[outlier]?.i ?? 0) + 1)}</div>}
            </div>
            <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={label}>{nameLabel}</div>
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputFull} aria-label={nameLabel} />
              {onLine.length > 0 && <div role="status" style={warnBox}>{tr("“{names}” already stands on this line.", { names: onLine.map((m) => m.name).join("”, “") })}</div>}
            </div>
    </>), primary: { label: busy ? tr("Placing…") : tr("Place in 3D"), onClick: doImport, disabled: !fit || busy } },
  ];
  return <StepDialog title={title} onClose={onClose} steps={steps} at={moveImage ? 0 : step} onAt={(i) => { setDrawing(false); setStep(i); }} help={helpBody} error={error} />;
}

const { label, note, warn: warnBox, error: errBox, input } = stepDialogStyles;
const dropZone = { flex: 1.6, minWidth: 320, minHeight: 320, border: "2px dashed var(--color-border-light)", borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--color-text-muted)" };
const chip = (on) => ({ padding: "3px 10px", borderRadius: 12, fontSize: "var(--font-size-sm)", cursor: "pointer", border: "1px solid " + (on ? "var(--color-selected-border)" : "var(--color-border-light)"), background: on ? "var(--color-selected-bg)" : "var(--color-bg)", color: on ? "var(--color-text)" : "var(--color-text-secondary)", fontWeight: on ? 600 : 400 });
const th = { padding: "4px 6px", color: "var(--color-text-secondary)", fontWeight: 500, textAlign: "start", borderBottom: "1px solid var(--color-border)" };
const td = { padding: "4px 6px", color: "var(--color-text)" };
const numInput = { width: 96, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" };
const inputFull = { ...input, width: "100%" };
