// TASKS.csv #1052 (review #1016, resource geologist / QP) — the grade-tonnage table and curve of a block model, at cutoffs
// the user lists (or quantiles of the values) and a density the user enters (no default, as #264), with the
// exploration-target cautionary statement beside it and a stamped CSV. The sums are lib/gradeTonnage.js.
import React, { useMemo, useState } from "react";
import { X, Download } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { t as tr } from "../lib/i18n.js";
import { saveFile } from "../lib/desktop.js";
import { toExportCsv } from "../lib/tabular.js";
import { stampLines, withStamp, NOT_A_RESOURCE } from "../lib/provenance.js";
import { valueUnit, valueColumnName } from "../lib/blockModelExport.js";
import { metalColumns } from "../lib/gradeTonnage.js"; // TASKS.csv #1577
import { gradeTonnageTable, gradeTonnageRows, autoCutoffs, metalOf, sgSummary, EXPLORATION_TARGET_CAUTION, blocksInsideSolid, gradeTonnageByBench } from "../lib/gradeTonnage.js"; // blocksInsideSolid: #1949; gradeTonnageByBench: #1957
import { useStore } from "../lib/store.jsx"; // TASKS.csv #1216
import { isMeshClosed } from "../lib/meshQuery.js"; // TASKS.csv #2061
import { version as APP_VERSION } from "../../package.json";
import { gradeUnitLabel } from "../lib/geochem.js"; // TASKS.csv #2218

const fmt = (v, d = 0) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: d }));
const sig = (v) => (v == null || !Number.isFinite(v) ? "—" : Number(v.toPrecision(3)).toLocaleString());
const compact = (v) => (v == null || !Number.isFinite(v) ? "—" : new Intl.NumberFormat(undefined, { notation: "compact", maximumSignificantDigits: 3 }).format(v)); // axis labels

export default function GradeTonnageModal({ model, epsg, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const unit = valueUnit(model), metal = metalOf(unit);
  const element = model.params?.element || null, mcols = metalColumns(metal, element); // #1577
  const unitL = element && unit ? gradeUnitLabel(element, unit) : unit; // TASKS.csv #2218 — the label (g/t for gold in ppm); unit stays for the sums and the CSV — kg and troy oz for a precious metal, t otherwise
  const [cutoffText, setCutoffText] = useState(() => autoCutoffs(model.cells, { element, unit }).join(", "));
  const [density, setDensity] = useState("");
  const { layers, generatedSurfaces = [] } = useStore();
  // TASKS.csv #1949 (Vulcan review) — the table inside a chosen closed solid, by block centre or by the share of each block inside
  // TASKS.csv #2061 (review #2013, Woodjam) — any watertight solid, as the Estimation dialog's 'Restrict to a modelled volume' takes: only Mine
  // Design solids carry closure 'closed', so an artificially closed grade shell (1.97 Mm³, watertight) was 'no closed solid in the project'
  const solids = useMemo(() => generatedSurfaces.filter((s) => s.vertices?.length >= 12 && s.indices?.length >= 12 && (s.closure === "closed" || isMeshClosed(s.vertices, s.indices).closed)), [generatedSurfaces]);
  const closureNote = (s) => (s?.closure === "artificial" ? tr(" The solid was closed artificially at the search radius, so its volume is an assumption.") : "");
  const [solidId, setSolidId] = useState("");
  const [insideMode, setInsideMode] = useState("centre");
  const solid = solids.find((s) => s.id === solidId) || null;
  const inside = useMemo(() => (solid ? blocksInsideSolid(model.cells, solid.vertices, solid.indices, { mode: insideMode }) : null), [model.cells, solid, insideMode]);
  const cellsUsed = inside ? inside.cells : model.cells;
  // TASKS.csv #1957 (Vulcan review) — the sums bench by bench at one cutoff
  const [byBench, setByBench] = useState(false);
  const [benchH, setBenchH] = useState("");
  const [benchDatum, setBenchDatum] = useState("");
  const [benchCutoff, setBenchCutoff] = useState("");
  const sgLayer = useMemo(() => sgSummary(layers?.sg), [layers?.sg]); // #1216
  const [fromSg, setFromSg] = useState(false); // the density is the SG layer's until it is typed over
  const [interpOnly, setInterpOnly] = useState(false); // #1409 — count only blocks the estimate classed interpolated
  const hasSupport = useMemo(() => model.cells.some((c) => typeof c.support === "string"), [model.cells]);
  const cutoffs = useMemo(() => [...new Set(cutoffText.split(/[,;\s]+/).map(Number).filter(Number.isFinite))], [cutoffText]);
  const rho = Number(density) > 0 ? Number(density) : null;
  const beyondKnown = !!model.params?.beyondFlagged; // #2417 — blocks above / below every sample informing them
  const rows = useMemo(() => gradeTonnageTable(cellsUsed, { cutoffs, density: rho, unit, interpolatedOnly: interpOnly, beyondKnown }), [cellsUsed, cutoffs, rho, unit, interpOnly, beyondKnown]);
  const benchCut = cutoffs.includes(Number(benchCutoff)) ? Number(benchCutoff) : cutoffs[0];
  const benchRows = useMemo(() => (byBench && Number(benchH) > 0 && benchCut != null ? gradeTonnageByBench(cellsUsed, { cutoff: benchCut, benchH: Number(benchH), datum: Number(benchDatum) || 0, density: rho, unit, interpolatedOnly: interpOnly }) : []), [byBench, benchH, benchDatum, benchCut, cellsUsed, rho, unit, interpOnly]); // #1957
  const shown = rows.find((r) => r.blocks > 0) || null, lowSupport = shown?.interpolatedShare != null && shown.interpolatedShare < 0.5;
  const merged = model.cells.some((c) => Number.isFinite(c.coverage));

  // the curve: tonnes (or volume without a density) and mean grade against the cutoff
  const W = 460, H = 200, L = 52, R = 52, T = 12, B = 30;
  const xs = rows.map((r) => r.cutoff), qty = rows.map((r) => (rho ? r.tonnes : r.volumeM3) || 0), gr = rows.map((r) => r.meanGrade || 0);
  const x0 = Math.min(...xs, 0), xm = Math.max(...xs), x1 = xm > x0 ? xm : x0 + 1, q1 = Math.max(...qty, 1), g1 = Math.max(...gr, 1e-9);
  const sx = (v) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R), sq = (v) => T + (1 - v / q1) * (H - T - B), sg = (v) => T + (1 - v / g1) * (H - T - B);

  const exportCsv = () => {
    const vname = valueColumnName(model);
    const out = gradeTonnageRows(rows, { vname, density: rho, metal, columns: mcols }); // #1017 — rows in lib, tested; columns: #1577
    const stamp = stampLines({ tool: "Grade-tonnage table", version: APP_VERSION, epsg, params: [
      `Block model: ${model.name} (${model.cells.length} blocks, source ${model.source || "import"}) | value ${vname}${unit ? ` in ${unit}` : " (no unit stated)"}`,
      ...(solid ? [`Inside the solid: ${solid.name}${solid.closure === "artificial" ? " (closed artificially at the search radius: its volume is an assumption)" : ""} | ${insideMode === "share" ? `each block counted by the share of it inside (2 x 2 x 2 sample points): ${inside.inside} wholly inside, ${inside.partial} partly, ${inside.outside} outside` : `blocks counted whole by their centre: ${inside.inside} inside, ${inside.outside} outside`}`] : []), // #1949
      ...(byBench && benchRows.length ? [`By bench: ${benchH} m benches from a datum of ${Number(benchDatum) || 0} m, at the ${benchCut} ${unit || ""} cutoff; a block spanning two benches is split by its vertical overlap`] : []), // #1957
      `Density: ${rho ? (fromSg ? `${rho} t/m3, length-weighted mean of ${sgLayer.n} Specific gravity rows, ${sgLayer.min}-${sgLayer.max}${sgLayer.left ? `, ${sgLayer.left} outside 1-8 left out` : ""} (one value for every block)` : `${rho} t/m3, entered by the user (one value for every block)`) : "not entered: volumes only"}${merged ? " | merged blocks counted at their COVERAGE share" : ""}`,
      "Mean grade: volume-weighted over the blocks at or above the cutoff",
      ...(hasSupport ? [interpOnly ? "Blocks: only those the estimate classed interpolated" : "Blocks: every estimated block; interpolated_pct / one_hole_pct give the volume share by support"] : []), // #1409
      ...(beyondKnown ? [`beyond_samples_metal_pct: share of the metal in blocks wholly above or below every sample informing them | unsampled metres: ${model.params?.unsampledMetres || "not known (left out)"}`] : []), // #2417
      EXPLORATION_TARGET_CAUTION,
    ] });
    const benchOut = byBench && benchRows.length ? benchRows.map((r) => ({ bench_floor_rl: Math.round(r.floorRL * 100) / 100, cutoff: benchCut, blocks: r.blocks, volume_m3: Math.round(r.volumeM3), [`mean_${vname}`]: r.meanGrade == null ? "" : Number(r.meanGrade.toPrecision(5)), ...(rho ? { tonnes: Math.round(r.tonnes || 0) } : {}), ...(rho && metal ? Object.fromEntries(mcols.map((c) => [c.key, r.metal == null ? "" : Number((r.metal * c.factor).toPrecision(6))])) : {}), /* #1577 */ ...(r.interpolatedShare != null ? { interpolated_pct: Math.round(r.interpolatedShare * 100) } : {}) })) : null; // #1957
    saveFile({ suggestedName: `${String(model.name).replace(/[^a-z0-9_-]+/gi, "_")}_grade_tonnage${solid ? "_inside_solid" : ""}${benchOut ? "_by_bench" : ""}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: withStamp(toExportCsv(benchOut || out), stamp) });
  };

  const th = { textAlign: "end", padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 600, borderBottom: "1px solid var(--color-border)" };
  const td = { textAlign: "end", padding: "3px 8px", fontVariantNumeric: "tabular-nums" };
  const inp = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)", fontSize: "var(--font-size-base)" };
  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div role="dialog" aria-modal="true" aria-label={tr("Grade-tonnage")} onClick={(e) => e.stopPropagation()} style={{ width: "min(640px, 94vw)", maxHeight: "90vh", overflowY: "auto", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 16, fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600 }}>{tr("Grade-tonnage: {name}", { name: model.name })}</div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 260 }}>{tr("Cutoffs ({unit})", { unit: unitL || tr("no unit stated") })}
            <input value={cutoffText} onChange={(e) => setCutoffText(e.target.value)} style={{ ...inp, flex: 1 }} aria-label={tr("Cutoffs, separated by commas")} /></label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Density (t/m³)")}
            <input type="number" min={0} step={0.01} value={density} placeholder={tr("required for tonnes")} onChange={(e) => { setDensity(e.target.value); setFromSg(false); }} style={{ ...inp, width: 120 }} /></label>
          {sgLayer && <button type="button" style={{ ...inp, cursor: "pointer" }} title={tr("The length-weighted mean of the Specific gravity layer: {n} rows, {min} to {max}. One value for every block.", { n: sgLayer.n, min: sgLayer.min, max: sgLayer.max })} onClick={() => { setDensity(String(sgLayer.mean)); setFromSg(true); }}>{tr("Use the SG layer's mean ({v})", { v: sgLayer.mean })}</button>}
        </div>
        {/* TASKS.csv #1949 — inside a closed solid; #1957 — bench by bench */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8, fontSize: "var(--font-size-sm)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Inside the solid")}
            <select value={solidId} onChange={(e) => setSolidId(e.target.value)} style={{ ...inp, maxWidth: 220 }} aria-label={tr("Solid to report inside")}><option value="">{solids.length ? tr("— the whole model —") : tr("— no closed solid in the project —")}</option>{solids.map((s) => <option key={s.id} value={s.id}>{s.name}{s.closure === "artificial" ? ` · ${tr("closed artificially")}` : ""}</option>)}</select></label>
          {solid && <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Count")}
            <select value={insideMode} onChange={(e) => setInsideMode(e.target.value)} style={inp} aria-label={tr("How a block is counted inside")}><option value="centre">{tr("whole blocks by their centre")}</option><option value="share">{tr("the share of each block inside")}</option></select></label>}
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={byBench} onChange={(e) => setByBench(e.target.checked)} />{tr("By bench")}</label>
          {byBench && <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Bench height (m)")}<input type="number" min={0} step="any" value={benchH} onChange={(e) => setBenchH(e.target.value)} style={{ ...inp, width: 70 }} aria-label={tr("Bench height")} /></label>}
          {byBench && <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Datum (m)")}<input type="number" step="any" value={benchDatum} onChange={(e) => setBenchDatum(e.target.value)} placeholder="0" style={{ ...inp, width: 80 }} aria-label={tr("Bench datum")} /></label>}
          {byBench && cutoffs.length > 1 && <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("at cutoff")}<select value={benchCut ?? ""} onChange={(e) => setBenchCutoff(e.target.value)} style={inp} aria-label={tr("Cutoff of the bench table")}>{cutoffs.map((c) => <option key={c} value={c}>{sig(c)}</option>)}</select></label>}
        </div>
        {solid && inside && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6, lineHeight: 1.5 }}>{insideMode === "share"
          ? tr("Inside \"{name}\": {a} block(s) wholly inside, {b} partly (counted by the share of each inside, from 2 × 2 × 2 sample points), {c} outside.", { name: solid.name, a: inside.inside, b: inside.partial, c: inside.outside })
          : tr("Inside \"{name}\": {a} block(s) counted whole by their centre, {c} outside; a block the surface cuts is wholly in or wholly out here.", { name: solid.name, a: inside.inside, c: inside.outside })}{closureNote(solid)}</div>}
        {byBench && !(Number(benchH) > 0) && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6 }}>{tr("Enter the bench height: the floors sit at the datum plus whole benches.")}</div>}
        {byBench && benchRows.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
            <thead><tr>
              <th style={th}>{tr("Bench floor (m)")}</th><th style={th}>{tr("Blocks")}</th><th style={th}>{tr("Volume (m³)")}</th><th style={th}>{tr("Mean grade")}</th>
              {rho && <th style={th}>{tr("Tonnes")}</th>}{rho && mcols.map((c) => <th key={c.key} style={th}>{tr(c.label)}</th>)}
              {hasSupport && <th style={th}>{tr("Interpolated")}</th>}
            </tr></thead>
            <tbody>{benchRows.map((r) => (
              <tr key={r.floorRL}>
                <td style={td}>{fmt(r.floorRL, 1)}</td><td style={td}>{fmt(r.blocks, 1)}</td><td style={td}>{fmt(r.volumeM3)}</td><td style={td}>{sig(r.meanGrade)}</td>
                {rho && <td style={td}>{fmt(r.tonnes)}</td>}{rho && mcols.map((c) => <td key={c.key} style={td}>{r.metal == null ? "—" : fmt(r.metal * c.factor, c.factor < 1e-2 && c.key !== "metal_oz" ? 1 : 0)}</td>)}
                {hasSupport && <td style={td}>{r.interpolatedShare == null ? "—" : `${Math.round(r.interpolatedShare * 100)} %`}</td>}
              </tr>))}</tbody>
          </table>
        )}
        {byBench && benchRows.length > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6, lineHeight: 1.5 }}>{tr("Benches of {h} m from a datum of {d} m, at the {c} {unit} cutoff; a block spanning two benches is split by its vertical overlap, so the block counts carry fractions.", { h: benchH, d: Number(benchDatum) || 0, c: sig(benchCut), unit: unit || "" })}</div>}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <thead><tr>
            <th style={th}>{tr("Cutoff")}</th><th style={th}>{tr("Blocks")}</th><th style={th}>{tr("Volume (m³)")}</th><th style={th}>{tr("Mean grade")}</th>
            {rho && <th style={th}>{tr("Tonnes")}</th>}{rho && mcols.map((c) => <th key={c.key} style={th}>{tr(c.label)}</th>)}
            {hasSupport && <th style={th} title={tr("Share of the volume in blocks the estimate classed interpolated (between holes, from at least two)")}>{tr("Interpolated")}</th>}
            {beyondKnown && <th style={th} title={tr("Share of the metal in blocks lying wholly above or below every sample that informs them: grade carried up or down the holes into metres their samples do not reach")}>{tr("Beyond the samples")}</th>}
          </tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.cutoff}>
              <td style={td}>{sig(r.cutoff)}</td><td style={td}>{fmt(r.blocks)}</td><td style={td}>{fmt(r.volumeM3)}</td><td style={td}>{sig(r.meanGrade)}</td>
              {rho && <td style={td}>{fmt(r.tonnes)}</td>}{rho && mcols.map((c) => <td key={c.key} style={td}>{r.metal == null ? "—" : fmt(r.metal * c.factor, c.factor < 1e-2 && c.key !== "metal_oz" ? 1 : 0)}</td>)}
              {hasSupport && <td style={td}>{r.interpolatedShare == null ? "—" : `${Math.round(r.interpolatedShare * 100)} %`}</td>}
              {beyondKnown && <td style={td}>{r.beyondShare == null ? "—" : `${Math.round(r.beyondShare * 100)} %`}</td>}
            </tr>))}</tbody>
        </table>
        {beyondKnown && shown?.beyondShare > 0.1 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", marginBottom: 6, lineHeight: 1.5 }}>{tr("{p} % of the metal at the {c} cutoff is in blocks above or below every sample that informs them: the estimate carried grade up or down the holes past their samples (unsampled core reads as not known unless the estimate filled it).", { p: Math.round(shown.beyondShare * 100), c: sig(shown.cutoff) })}</div>}
        {hasSupport && <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", marginBottom: 6 }}><input type="checkbox" checked={interpOnly} onChange={(e) => setInterpOnly(e.target.checked)} />{tr("Only blocks classed interpolated")}</label>}
        {hasSupport && !interpOnly && lowSupport && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", marginBottom: 6, lineHeight: 1.5 }}>{tr("Most of this volume is in blocks the estimate carried outward from the holes (extrapolated or unsupported), not between them: the tonnage rests on grades the drilling does not surround.")}</div>}
        {rows.length > 1 && (
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={tr("Grade-tonnage curve")} style={{ display: "block", marginBottom: 8 }} dir="ltr">
            <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="#94a1b0" /><line x1={L} y1={T} x2={L} y2={H - B} stroke="#94a1b0" /><line x1={W - R} y1={T} x2={W - R} y2={H - B} stroke="#94a1b0" />
            <polyline fill="none" stroke="#2f6fe0" strokeWidth="2" points={rows.map((r, i) => `${sx(xs[i])},${sq(qty[i])}`).join(" ")} />
            <polyline fill="none" stroke="#c0392b" strokeWidth="2" strokeDasharray="5 3" points={rows.map((r, i) => `${sx(xs[i])},${sg(gr[i])}`).join(" ")} />
            <text x={L - 4} y={T + 8} fontSize="10" textAnchor="end" fill="#2f6fe0">{compact(q1)}</text>
            <text x={L - 4} y={H - B} fontSize="10" textAnchor="end" fill="#2f6fe0">0</text>
            <text x={W - R + 4} y={T + 8} fontSize="10" fill="#c0392b">{compact(g1)}</text>
            <text x={L} y={H - 10} fontSize="10" fill="#55606e">{sig(x0)}</text>
            <text x={W - R} y={H - 10} fontSize="10" textAnchor="end" fill="#55606e">{sig(x1)}</text>
            <text x={(L + W - R) / 2} y={H - 4} fontSize="10" textAnchor="middle" fill="#55606e">{tr("cutoff ({unit})", { unit: unitL || "?" })}</text>
            <text x={L + 6} y={T + 10} fontSize="10" fill="#2f6fe0">{rho ? tr("tonnes") : tr("volume (m³)")}</text>
            <text x={W - R - 6} y={T + 10} fontSize="10" textAnchor="end" fill="#c0392b">{tr("mean grade")}</text>
          </svg>
        )}
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5, marginBottom: 6 }}>
          {tr("Mean grade is volume-weighted over the blocks at or above each cutoff.")}{merged ? ` ${tr("Blocks merged on import count only the share of the block the model filled (COVERAGE).")}` : ""}{!rho ? ` ${tr("Enter a density to get tonnes: no default is assumed.")}` : ""}
        </div>
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 6, padding: "7px 9px", lineHeight: 1.5, marginBottom: 10 }}>
          {tr(EXPLORATION_TARGET_CAUTION)} {tr(NOT_A_RESOURCE)}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={exportCsv} disabled={!rows.length} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", cursor: "pointer" }}>
            <Download size={14} />{" "}{tr("Export CSV")}</button>
        </div>
      </div>
    </div>
  );
}
