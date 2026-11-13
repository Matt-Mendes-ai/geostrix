// TASKS.csv #3089 — Grade x thickness on a long section (the 'Long section' view of Grade x thickness): the plane, the thickness, the
// cell and search, a contour interval per panel; then the three stacked panels as one figure, shown here and exported as PNG / PDF, added
// to the Layout, and the pierce points as CSV. The holes' totals come from the modal (Best intercepts' rules at the user's cut-off).
import { useMemo, useState } from "react";
import { t as tr } from "../lib/i18n.js";
import { useStore } from "../lib/store.jsx";
import { saveFile } from "../lib/desktop.js";
import { toCsv, FORMULA_LEAD } from "../lib/tabular.js";
import { sectionFrame, projectPierces, sectionGrids, sectionSpacing, contourLevels, pierceRows } from "../lib/longSection.js";
import { layoutLongSection, drawLongSection } from "../lib/longSectionFigure.js";
import { imagePdf, dataUrlBytes } from "../lib/imagePdf.js";

const KIND_WORD = { true: "true", horizontal: "horizontal", downhole: "downhole" }; // in the figure (English, as every export)

export default function LongSectionGT({ holes, zeros, symbol, shownGrade, gtLabel, cut, field, inp, note }) {
  const { addLayoutImage, goToModule } = useStore();
  const pierces = useMemo(() => [...(holes || []), ...(zeros || []).map((z) => ({ ...z, thicknessM: 0, meanGrade: 0, dir: null }))].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z)), [holes, zeros]);
  const fitFrame = useMemo(() => sectionFrame(pierces, { mode: "fit" }), [pierces]);
  const [mode, setMode] = useState(() => (fitFrame.error ? "azimuth" : "fit"));
  const [azText, setAzText] = useState("");
  const [kind, setKind] = useState("true");
  const frame = useMemo(() => (mode === "fit" ? fitFrame : sectionFrame(pierces, { mode: "azimuth", azimuthDeg: azText === "" ? NaN : Number(azText) })), [mode, fitFrame, pierces, azText]);
  const points = useMemo(() => (frame.error ? [] : projectPierces(pierces, frame, kind)), [frame, pierces, kind]);
  const spacing = useMemo(() => (points.length >= 2 ? sectionSpacing(points) : null), [points]);
  const [cell, setCell] = useState(""), [radius, setRadius] = useState("");
  const cellM = Number(cell) > 0 ? Number(cell) : spacing ? Math.max(1, Math.round(spacing / 4)) : null;
  const radiusM = Number(radius) > 0 ? Number(radius) : spacing ? Math.round(spacing * 2.5) : null;
  const [steps, setSteps] = useState(["", "", ""]);
  const [fig, setFig] = useState(null), [msg, setMsg] = useState(null);

  const kindLabel = { true: tr("true (normal to the plane)"), horizontal: tr("horizontal (level, across strike)"), downhole: tr("downhole (as logged)") };
  const draw = () => {
    const grid = sectionGrids(points, { cell: cellM, radius: radiusM });
    if (!grid) { setFig(null); setMsg(tr("Nothing to grid: at least two pierce points and a cell and search are needed.")); return; }
    const vals = [grid.thickness, grid.grade, grid.gt];
    const levels = vals.map((v, k) => contourLevels(v, { step: steps[k] }));
    const kw = KIND_WORD[kind];
    const panels = [
      { title: `(a) Thickness, ${kw} (m)`, values: grid.thickness, levels: levels[0], unit: "m" },
      { title: `(b) Grade (${shownGrade})`, values: grid.grade, levels: levels[1], unit: shownGrade },
      { title: `(c) Grade × thickness (${gtLabel})`, values: grid.gt, levels: levels[2], unit: gtLabel },
    ];
    const L = layoutLongSection(grid, { width: 1600 });
    const c = document.createElement("canvas"); c.width = L.width; c.height = L.height;
    drawLongSection(c.getContext("2d"), L, grid, panels, { points, azimuth: frame.strikeAz,
      method: `${symbol}: intercepts at ${cut} ${shownGrade}; ${points.length} pierce points, inverse distance (${+grid.cell.toFixed(1)} m cells, ${grid.radius} m search).`,
      note: `Long section along ${Math.round(frame.strikeAz)}°${mode === "fit" ? ` (strike of the intercepts' best-fit plane, dip ${Math.round(frame.dip)}°)` : ""}; contours stop at the pierce points' outline (dashed). Not a resource estimate.` });
    setFig({ png: c.toDataURL("image/png"), jpeg: c.toDataURL("image/jpeg", 0.92), w: c.width, h: c.height, grid, levels });
    setMsg(null);
  };
  const base = `gt_long_section_${symbol}`;
  const savePng = () => fig && saveFile({ suggestedName: `${base}.png`, filters: [{ name: "PNG", extensions: ["png"] }], content: dataUrlBytes(fig.png) });
  const savePdf = () => fig && saveFile({ suggestedName: `${base}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }], content: imagePdf(dataUrlBytes(fig.jpeg), fig.w, fig.h, { title: `Grade x thickness long section, ${symbol}` }) });
  const toLayout = () => { if (!fig) return; addLayoutImage({ label: `GT long section, ${symbol} (${Math.round(frame.strikeAz)}°)`, src: fig.png, naturalW: fig.w, naturalH: fig.h }); goToModule("layout"); };
  const saveCsv = () => {
    if (!points.length) return;
    const header = `# Grade x thickness long-section pierce points (GeoStrix): ${symbol}, intercepts at ${cut} ${shownGrade}; section along ${Math.round(frame.strikeAz)} deg${mode === "fit" ? `, the intercepts' best-fit plane dipping ${Math.round(frame.dip)} deg` : ""}; thickness used: ${KIND_WORD[kind]}; GT = grade x that thickness; a hole assayed with no intercept is a 0`;
    saveFile({ suggestedName: `${base}_pierce_points.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: [header, toCsv(pierceRows(points, { gradeLabel: shownGrade, gtLabel, kind }), { escapeFormulae: FORMULA_LEAD })].join("\n"), encoding: "text" });
  };
  const btn = { ...inp, width: "auto", cursor: "pointer" };

  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={field}>{tr("Section plane")}<select value={mode} onChange={(e) => { setMode(e.target.value); setFig(null); }} style={{ ...inp, width: "auto" }} aria-label={tr("Section plane")}>
          <option value="fit" disabled={!!fitFrame.error}>{fitFrame.error ? tr("Along the intercepts' best-fit plane (they do not define one)") : tr("Along the intercepts' best-fit plane (strike {s}°, dip {d}°)", { s: Math.round(fitFrame.strikeAz), d: Math.round(fitFrame.dip) })}</option>
          <option value="azimuth">{tr("A vertical plane at a typed azimuth")}</option>
        </select></label>
        {mode === "azimuth" && <label style={field} title={tr("The direction along strike, read left to right on the section (degrees from grid north).")}>{tr("Azimuth along strike (°)")}<input type="number" step="any" value={azText} placeholder={fitFrame.error ? tr("azimuth") : String(Math.round(fitFrame.strikeAz))} onChange={(e) => { setAzText(e.target.value); setFig(null); }} style={inp} aria-label={tr("Azimuth along strike (°)")} /></label>}
        <label style={field}>{tr("Thickness")}<select value={kind} onChange={(e) => { setKind(e.target.value); setFig(null); }} style={{ ...inp, width: "auto" }} aria-label={tr("Long section thickness")}>
          {Object.entries(kindLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></label>
        <label style={field}>{tr("Cell (m)")}<input type="number" min="0" step="any" value={cell} placeholder={cellM ? String(cellM) : ""} onChange={(e) => setCell(e.target.value)} style={inp} aria-label={tr("Long section cell (m)")} /></label>
        <label style={field} title={tr("No pierce point within this distance of a node leaves it out. Blank = 2.5 times their typical spacing on the section.")}>{tr("Search radius (m)")}<input type="number" min="0" step="any" value={radius} placeholder={radiusM ? String(radiusM) : ""} onChange={(e) => setRadius(e.target.value)} style={inp} aria-label={tr("Long section search radius (m)")} /></label>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        {[tr("Thickness interval (m)"), tr("Grade interval ({u})", { u: shownGrade }), tr("GT interval ({u})", { u: gtLabel })].map((l, k) => (
          <label key={k} style={field} title={tr("Blank: a round interval (1, 2 or 5 x 10^n) giving about six bands.")}>{l}<input type="number" min="0" step="any" value={steps[k]} placeholder={tr("round")} onChange={(e) => setSteps((p) => p.map((v, q) => (q === k ? e.target.value : v)))} style={inp} aria-label={l} /></label>
        ))}
        <button type="button" disabled={frame.error || points.length < 2 || !cellM || !radiusM} onClick={draw} style={btn}>{tr("Draw the long section")}</button>
      </div>
      {frame.error === "azimuth" && <div style={note}>{tr("Type the azimuth along strike: none is chosen for you.")}</div>}
      {!frame.error && (
        <div style={note}>
          {tr("{n} pierce point(s) on the section ({z} hole(s) assayed with no intercept, read as 0). Each is the intercepts' mid-point, weighted by length, projected on the vertical plane along {s}°.", { n: points.length, z: (zeros || []).length, s: Math.round(frame.strikeAz) })}
          {" "}{tr("Thickness: {k}; GT is the grade times that thickness.", { k: kindLabel[kind] })}
          {mode === "azimuth" && kind !== "downhole" ? " " + tr("Against a typed vertical plane, the thickness is measured across that plane: for a dipping lode it is not the lode's true thickness, which the best-fit plane gives.") : ""}
          {points.noDir > 0 && kind !== "downhole" ? " " + tr("{n} hole(s) have no direction across their intercept (no survey): their downhole thickness is used.", { n: points.noDir }) : ""}
          {spacing ? " " + tr("Pierce points typically {s} m apart on the section: blank cell = a quarter of that, blank search = 2.5 times it.", { s: Math.round(spacing) }) : ""}
        </div>
      )}
      {msg && <div role="status" style={note}>{msg}</div>}
      {fig && (
        <>
          <div role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("{n} of {t} nodes estimated, inside the pierce points' outline. Intervals: thickness {a} m, grade {b} {gu}, GT {c} {tu}.", { n: fig.grid.estimated.toLocaleString(), t: (fig.grid.nx * fig.grid.ny).toLocaleString(), a: fig.levels[0][0] ?? "—", b: fig.levels[1][0] ?? "—", gu: shownGrade, c: fig.levels[2][0] ?? "—", tu: gtLabel })}</div>
          <img src={fig.png} alt={tr("Grade × thickness long section: thickness, grade and GT")} style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: 6, background: "#fff" }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={savePng} style={btn}>{tr("Export PNG")}</button>
            <button type="button" onClick={savePdf} style={btn}>{tr("Export PDF")}</button>
            <button type="button" onClick={toLayout} style={btn}>{tr("Add to Layout")}</button>
            <button type="button" onClick={saveCsv} style={btn}>{tr("Export the pierce points (CSV)")}</button>
          </div>
          <div style={note}><b>{tr("Not a resource estimate.")}</b>{" "}{tr("Inverse-distance interpolation of the pierce points' thickness and GT on the section, grade as GT over thickness: no declustering, no variogram, no classification. Between pierce points the numbers are the method's; the panels stop at the outline of the pierce points (dashed), and a hole assayed with no intercept counts as 0.")}</div>
        </>
      )}
    </>
  );
}
