// TASKS.csv #2419 (review #2325, WA uranium; Matt's decision 2026-11-11: every deposit style) — Grade x thickness in plan. Per hole, the
// mineralized thickness and GT (metres x grade over the sampled metres) from Best intercepts' rules (cut-off, minimum length, internal
// dilution), optionally within one logged unit and reported as the element's oxide (offered, stated, never applied by itself: #2721);
// the holes as graduated circles on a plan; then a 2D estimate of GT and thickness, a contour at a GT cut-off the user types, and
// area x GT x density = metal, with the same honesty as Estimation. No default cut-off reads as a fact (#264): every cut-off is typed.
import React, { useMemo, useState } from "react";
import { X, Download } from "./icons.js";
import { t as tr } from "../lib/i18n.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { useStore } from "../lib/store.jsx";
import { desurveyHole } from "../lib/desurvey.js";
import { computeBestIntercepts, gradeUnitLabel } from "../lib/geochem.js";
import { excludeQAQC } from "../lib/qaqc.js";
import { holeTotals, clipAssaysToUnit, planSpacing, planGrid, planSummary, contourSegments, oxideOffer, gtUnitLabel } from "../lib/accumulation.js";
import { saveFile } from "../lib/desktop.js";
import { gridPanels } from "../lib/flatPanels.js"; // TASKS.csv #2650 — the plan grid cut into panels
import { toCsv, FORMULA_LEAD } from "../lib/tabular.js";

export default function GradeThicknessModal({ assays, assayElements, collars, survey, layers, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const { desurveyMethod } = useStore();
  const symbols = (assayElements || []).map((e) => e.symbol);
  const [symbol, setSymbol] = useState(symbols[0] || "");
  const unit = (assayElements || []).find((e) => e.symbol === symbol)?.unit || "ppm";
  const [cutoff, setCutoff] = useState(""); // the intercepts' grade cut-off: typed (#264)
  const [minLength, setMinLength] = useState(0);
  const [dilution, setDilution] = useState(2); // Best intercepts' own default
  const [unitCode, setUnitCode] = useState("");
  const offer = oxideOffer(symbol, unit);
  const [asOxide, setAsOxide] = useState(false);
  const ox = asOxide && offer ? offer : null, f = ox ? ox.factor : 1;
  const gradeLabel = gradeUnitLabel(symbol, unit), shownGrade = ox ? `${gradeLabel} ${ox.oxide}` : gradeLabel, gtLabel = gtUnitLabel(gradeLabel, ox?.oxide);
  const codes = useMemo(() => [...new Set((layers?.litho || []).map((r) => String(r.value ?? "")).filter(Boolean))].sort(), [layers]);

  const lab = useMemo(() => excludeQAQC(assays || []), [assays]);
  const positionAt = useMemo(() => {
    const byHole = new Map(); for (const s of survey || []) (byHole.get(s.hole_id) || byHole.set(s.hole_id, []).get(s.hole_id)).push(s);
    const cache = new Map(), col = new Map((collars || []).map((c) => [c.hole_id, c]));
    return (h, md) => {
      if (!cache.has(h)) { const c = col.get(h); let t = []; try { t = c ? desurveyHole(c, byHole.get(h) || [], desurveyMethod) || [] : []; } catch { t = []; } cache.set(h, t); }
      const t = cache.get(h); if (!t.length) return null;
      let k = 1; while (k < t.length - 1 && t[k].md < md) k++;
      const a = t[k - 1] || t[0], b = t[k] || a, w = b.md > a.md ? Math.min(1, Math.max(0, (md - a.md) / (b.md - a.md))) : 0;
      return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, z: a.z + (b.z - a.z) * w };
    };
  }, [collars, survey, desurveyMethod]);
  const cut = cutoff === "" ? NaN : Number(cutoff);
  const totals = useMemo(() => {
    if (!symbol || !Number.isFinite(cut)) return null;
    const src = unitCode ? clipAssaysToUnit(lab, layers?.litho || [], unitCode) : lab;
    const rows = computeBestIntercepts(src, symbol, unit, Object.fromEntries((assayElements || []).map((e) => [e.symbol, e.unit])), { cutoff: cut / f, maxInternalDilution: Number(dilution) || 0, minLength: Number(minLength) || 0 });
    const hs = holeTotals(rows, positionAt).map((h) => ({ ...h, gt: h.gt * f, meanGrade: h.meanGrade == null ? null : h.meanGrade * f }));
    // drilled and assayed for the element but no intercept: a 0 (the estimate closes against it), placed at the hole's middle sample
    const withEl = new Map();
    for (const a of src) if (Number.isFinite(a.values?.[symbol])) { const m = (Number(a.from) + Number(a.to)) / 2, cur = withEl.get(a.hole_id); if (!cur) withEl.set(a.hole_id, [m, m]); else { cur[0] = Math.min(cur[0], m); cur[1] = Math.max(cur[1], m); } }
    const hit = new Set(hs.map((h) => h.hole_id)), zeros = [];
    for (const [h, [a, b]] of withEl) if (!hit.has(h)) { const p = positionAt(h, (a + b) / 2); if (p) zeros.push({ hole_id: h, x: p.x, y: p.y, gt: 0, thicknessM: 0 }); }
    return { holes: hs, zeros };
  }, [symbol, unit, cut, f, minLength, dilution, unitCode, lab, layers, assayElements, positionAt]);

  // the plan estimate
  const pts = useMemo(() => (totals ? [...totals.holes.filter((h) => Number.isFinite(h.x)), ...totals.zeros] : []), [totals]);
  const spacing = useMemo(() => planSpacing(pts), [pts]);
  const [cell, setCell] = useState(""), [radius, setRadius] = useState(""), [gtCut, setGtCut] = useState(""), [density, setDensity] = useState("");
  const cellM = Number(cell) > 0 ? Number(cell) : spacing ? Math.max(1, Math.round(spacing / 4)) : null;
  const radiusM = Number(radius) > 0 ? Number(radius) : spacing ? Math.round(spacing * 2.5) : null; // #2420's rule: a block between two holes reaches both
  const [run, setRun] = useState(0);
  const grid = useMemo(() => (run && pts.length >= 2 && cellM && radiusM ? planGrid(pts, { cell: cellM, radius: radiusM, pad: radiusM / 2 }) : null), [run]); // computed on Run only (the inputs above are read then)
  const gtc = gtCut === "" ? NaN : Number(gtCut);
  const summary = useMemo(() => (grid && Number.isFinite(gtc) ? planSummary(grid, gtc, density, unit) : null), [grid, gtc, density, unit]);
  // TASKS.csv #2650 — the same grid in square panels (a strip, an in-situ recovery pattern): a panel counts when its mean GT reaches the cut-off
  const [panelText, setPanelText] = useState("");
  const panels = useMemo(() => (grid && Number.isFinite(gtc) && Number(panelText) > 0 && Number(density) > 0 ? gridPanels(grid, { panelM: Number(panelText), gtCut: gtc, density: Number(density) }) : null), [grid, gtc, panelText, density]);
  const contour = useMemo(() => (grid && Number.isFinite(gtc) ? contourSegments(grid, grid.gt, gtc) : []), [grid, gtc]);

  // plan drawing
  const W = 520, H = 360;
  const view = useMemo(() => {
    const P = pts.length ? pts : [];
    if (!P.length) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of P) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const pad = Math.max(10, 0.05 * Math.max(x1 - x0, y1 - y0)); x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const s = Math.min((W - 20) / Math.max(1, x1 - x0), (H - 20) / Math.max(1, y1 - y0));
    const gmax = Math.max(1e-9, ...P.map((p) => p.gt || 0));
    return { X: (x) => 10 + (x - x0) * s, Y: (y) => H - 10 - (y - y0) * s, R: (g) => (g > 0 ? 3 + 11 * Math.sqrt(g / gmax) : 2.5) };
  }, [pts]);
  const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: d }));
  const exportCsv = () => {
    if (!totals) return;
    const rows = totals.holes.map((h) => ({ hole_id: h.hole_id, from_m: +h.from.toFixed(2), to_m: +h.to.toFixed(2), thickness_m: +h.thicknessM.toFixed(2), sampled_m: +h.sampledM.toFixed(2), [`gt_${gtLabel.replace(/[^\w%]+/g, "_")}`]: +h.gt.toPrecision(5), [`mean_grade_${shownGrade.replace(/[^\w%]+/g, "_")}`]: h.meanGrade == null ? "" : +h.meanGrade.toPrecision(4), top_rl: h.topRL == null ? "" : +h.topRL.toFixed(1), base_rl: h.baseRL == null ? "" : +h.baseRL.toFixed(1), x: h.x == null ? "" : +h.x.toFixed(1), y: h.y == null ? "" : +h.y.toFixed(1) }));
    const header = [`# Grade x thickness per hole (GeoStrix): ${symbol}${ox ? ` reported as ${ox.oxide} (x ${ox.factor})` : ""}, intercepts at ${cut} ${shownGrade}, min length ${Number(minLength) || 0} m, internal dilution ${Number(dilution) || 0} m${unitCode ? `, within ${unitCode}` : ""}; thickness in downhole metres; GT over the sampled metres`];
    saveFile({ suggestedName: `grade_thickness_${symbol}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: [...header, toCsv(rows, { escapeFormulae: FORMULA_LEAD })].join("\n"), encoding: "text" });
  };

  const field = { display: "flex", flexDirection: "column", gap: 3, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
  const inp = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)", width: 90 };
  const th = { textAlign: "start", padding: "5px 7px", background: "var(--color-bg-subtle)", borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", fontWeight: 600 };
  const td = { padding: "4px 7px", borderBottom: "1px solid var(--color-border-light)", whiteSpace: "nowrap", fontSize: "var(--font-size-sm)" };
  const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.5 };
  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div role="dialog" aria-modal="true" aria-label={tr("Grade × thickness in plan")} onClick={(e) => e.stopPropagation()} style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 16, width: 900, maxWidth: "95vw", maxHeight: "94vh", overflow: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text)" }}>{tr("Grade × thickness in plan")}</div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>
        <div style={note}>{tr("For a thin, flat body: per hole, the mineralized thickness and grade × thickness (GT) from the intercepts, with the same rules as Best intercepts; then GT and thickness are interpolated in plan and contoured at a GT cut-off you choose. Thickness is in downhole metres (true thickness for vertical holes through flat ore).")}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={field}>{tr("Element")}<select value={symbol} onChange={(e) => { setSymbol(e.target.value); setCutoff(""); setGtCut(""); setAsOxide(false); }} style={inp} aria-label={tr("Element")}>{symbols.map((s) => <option key={s} value={s}>{s} ({gradeUnitLabel(s, (assayElements || []).find((e) => e.symbol === s)?.unit)})</option>)}</select></label>
          {offer && <label style={{ ...field, flexDirection: "row", alignItems: "center", gap: 5 }}><input type="checkbox" checked={asOxide} onChange={(e) => { setAsOxide(e.target.checked); setCutoff(""); setGtCut(""); }} />{tr("Report as {oxide} (× {f})", { oxide: offer.oxide, f: offer.factor })}</label>}
          <label style={field}>{tr("Intercept cut-off ({unit})", { unit: shownGrade })}<input type="number" min="0" step="any" value={cutoff} placeholder={tr("cut-off")} onChange={(e) => setCutoff(e.target.value)} style={inp} aria-label={tr("Intercept cut-off")} /></label>
          <label style={field}>{tr("Minimum length (m)")}<input type="number" min="0" step="any" value={minLength} onChange={(e) => setMinLength(e.target.value)} style={inp} /></label>
          <label style={field}>{tr("Max internal dilution (m)")}<input type="number" min="0" step="any" value={dilution} onChange={(e) => setDilution(e.target.value)} style={inp} /></label>
          {codes.length > 0 && <label style={field}>{tr("Within a logged unit")}<select value={unitCode} onChange={(e) => setUnitCode(e.target.value)} style={inp} aria-label={tr("Within a logged unit")}><option value="">{tr("(any)")}</option>{codes.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>}
        </div>
        {!Number.isFinite(cut) && <div style={note}>{tr("Type the intercepts' cut-off: none is chosen for you.")}</div>}
        {totals && (
          <>
            <div role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("{n} hole(s) with an intercept at {c} {u}; {z} hole(s) assayed for {el} with none (read as 0 in the plan estimate). GT in {gt}.", { n: totals.holes.length, c: cut, u: shownGrade, z: totals.zeros.length, el: symbol, gt: gtLabel })}{ox ? " " + tr("Grades and GT are {oxide}: {el} × {f}, the stoichiometric factor (Calc. element's preset).", { oxide: ox.oxide, el: symbol, f: ox.factor }) : ""}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ overflow: "auto", maxHeight: 360, flex: "1 1 330px", border: "1px solid var(--color-border)", borderRadius: 6 }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr>{[tr("Hole"), tr("Thickness (m)"), tr("GT ({u})", { u: gtLabel }), tr("Grade ({u})", { u: shownGrade }), tr("Top RL"), tr("Base RL")].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>{totals.holes.slice(0, 300).map((h) => <tr key={h.hole_id}><td style={{ ...td, fontWeight: 600 }}>{h.hole_id}</td><td style={td}>{fmt(h.thicknessM, 2)}</td><td style={td}>{fmt(h.gt, 3)}</td><td style={td}>{fmt(h.meanGrade, 3)}</td><td style={td}>{fmt(h.topRL, 1)}</td><td style={td}>{fmt(h.baseRL, 1)}</td></tr>)}</tbody>
                </table>
              </div>
              {view && (
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr("Plan of grade × thickness per hole")} style={{ border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)", direction: "ltr" }}>
                  {contour.map((s, k) => <line key={`c${k}`} x1={view.X(s[0])} y1={view.Y(s[1])} x2={view.X(s[2])} y2={view.Y(s[3])} stroke="#c2410c" strokeWidth={1.5} />)}
                  {totals.zeros.map((p) => <circle key={`z${p.hole_id}`} cx={view.X(p.x)} cy={view.Y(p.y)} r={view.R(0)} fill="none" stroke="#8a94a3" strokeWidth={1}><title>{`${p.hole_id}: 0`}</title></circle>)}
                  {totals.holes.filter((h) => Number.isFinite(h.x)).map((h) => <circle key={h.hole_id} cx={view.X(h.x)} cy={view.Y(h.y)} r={view.R(h.gt)} fill="#2563eb" fillOpacity={0.45} stroke="#1e3a8a" strokeWidth={0.8}><title>{`${h.hole_id}: ${fmt(h.gt, 3)} ${gtLabel}, ${fmt(h.thicknessM, 2)} m`}</title></circle>)}
                </svg>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}><button type="button" onClick={exportCsv} style={{ ...inp, width: "auto", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}><Download size={14} />{tr("Export per-hole totals (CSV)")}</button></div>
            <div className="ge-section-label" style={{ marginTop: 4 }}>{tr("Estimate in plan")}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={field}>{tr("Cell (m)")}<input type="number" min="0" step="any" value={cell} placeholder={cellM ? String(cellM) : ""} onChange={(e) => setCell(e.target.value)} style={inp} aria-label={tr("Plan cell (m)")} /></label>
              <label style={field} title={tr("No hole within this distance of a node leaves it unestimated (not barren). Blank = 2.5 times the typical hole spacing.")}>{tr("Search radius (m)")}<input type="number" min="0" step="any" value={radius} placeholder={radiusM ? String(radiusM) : ""} onChange={(e) => setRadius(e.target.value)} style={inp} aria-label={tr("Plan search radius (m)")} /></label>
              <label style={field}>{tr("GT cut-off ({u})", { u: gtLabel })}<input type="number" min="0" step="any" value={gtCut} placeholder={tr("cut-off")} onChange={(e) => setGtCut(e.target.value)} style={inp} aria-label={tr("GT cut-off")} /></label>
              <label style={field}>{tr("Density (t/m³)")}<input type="number" min="0" step="any" value={density} onChange={(e) => setDensity(e.target.value)} style={inp} aria-label={tr("Density (t/m³)")} /></label>
              <label style={field} title={tr("Optional: the side of a square panel (a strip, an in-situ recovery pattern); each panel counts when its mean GT reaches the GT cut-off.")}>{tr("Panel side (m)")}<input type="number" min="0" step="any" value={panelText} placeholder={tr("optional")} onChange={(e) => setPanelText(e.target.value)} style={inp} aria-label={tr("Panel side (m)")} /></label>{/* #2650 */}
              <button type="button" disabled={pts.length < 2 || !cellM || !radiusM} onClick={() => setRun((n) => n + 1)} style={{ ...inp, width: "auto", cursor: "pointer" }}>{tr("Estimate GT and thickness")}</button>
            </div>
            {spacing && <div style={note}>{tr("Holes typically {s} m apart in plan: blank cell = a quarter of that, blank search = 2.5 times it.", { s: Math.round(spacing) })}</div>}
            {grid && (
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                <div>{tr("{n} of {t} nodes estimated ({c} m cells{v}, {r} m search, inverse distance squared).", { n: grid.estimated.toLocaleString(), t: (grid.nx * grid.ny).toLocaleString(), c: +grid.cell.toFixed(1), v: grid.cell !== grid.cellAsked ? tr(", coarsened to stay under the node limit") : "", r: grid.radius })}</div>
                {!Number.isFinite(gtc) ? <div>{tr("Type the GT cut-off for the contour and the totals: none is chosen for you.")}</div> : summary && (
                  <div>{tr("At GT ≥ {c} {u}: {a} km² ({n} nodes), mean thickness {th} m, mean grade {g} {gu}{v}.", { c: gtc, u: gtLabel, a: fmt(summary.areaM2 / 1e6, 3), n: summary.nodes.toLocaleString(), th: fmt(summary.meanThicknessM, 2), g: fmt(summary.meanGrade == null ? null : summary.meanGrade, 3), gu: shownGrade, v: summary.tonnes != null ? tr("; {t} t at {d} t/m³, {m} {mu} of {el}", { t: fmt(summary.tonnes, 0), d: Number(density), m: fmt(summary.metalUnit === "g" && summary.metal >= 1e6 ? summary.metal / 1e6 : summary.metal, summary.metalUnit === "g" && summary.metal >= 1e6 ? 1 : 0), mu: summary.metalUnit === "g" && summary.metal >= 1e6 ? "t" : summary.metalUnit || "", /* a million grams and over: tonnes */ el: ox ? ox.oxide : symbol }) : tr("; type a density for tonnes and metal") })}</div>
                )}
                {panels && <div>{panels.totals.orePanels ? tr("In {p} m panels: {n} of {m} reach GT ≥ {c} {u}: {a} km², {t} t at {g} {gu}, mean thickness {th} m.", { p: Number(panelText), n: panels.totals.orePanels, m: panels.totals.panels, c: gtc, u: gtLabel, a: fmt(panels.totals.area / 1e6, 3), t: fmt(panels.totals.tonnes, 0), g: fmt(panels.totals.grade, 3), gu: shownGrade, th: fmt(panels.totals.thick, 2) }) : tr("In {p} m panels: none of {m} reaches GT ≥ {c} {u}.", { p: Number(panelText), m: panels.totals.panels, c: gtc, u: gtLabel })}</div>}{/* #2650 */}
                <div style={{ ...note, marginTop: 4 }}><b>{tr("Not a resource estimate.")}</b>{" "}{tr("Inverse-distance interpolation of the holes' GT and thickness in plan: no declustering, no variogram, no classification. Between holes the numbers are the method's, not the data's; a node farther than the search radius from every hole is left out, not counted as barren. Holes assayed for the element with no intercept count as 0, so the contour closes against them; undrilled ground is not estimated.")}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
