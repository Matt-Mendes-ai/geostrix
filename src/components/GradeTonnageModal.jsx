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
import { gradeTonnageTable, gradeTonnageRows, autoCutoffs, metalOf, EXPLORATION_TARGET_CAUTION } from "../lib/gradeTonnage.js";
import { version as APP_VERSION } from "../../package.json";

const fmt = (v, d = 0) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: d }));
const sig = (v) => (v == null || !Number.isFinite(v) ? "—" : Number(v.toPrecision(3)).toLocaleString());
const compact = (v) => (v == null || !Number.isFinite(v) ? "—" : new Intl.NumberFormat(undefined, { notation: "compact", maximumSignificantDigits: 3 }).format(v)); // axis labels

export default function GradeTonnageModal({ model, epsg, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const unit = valueUnit(model), metal = metalOf(unit);
  const [cutoffText, setCutoffText] = useState(() => autoCutoffs(model.cells).join(", "));
  const [density, setDensity] = useState("");
  const cutoffs = useMemo(() => [...new Set(cutoffText.split(/[,;\s]+/).map(Number).filter(Number.isFinite))], [cutoffText]);
  const rho = Number(density) > 0 ? Number(density) : null;
  const rows = useMemo(() => gradeTonnageTable(model.cells, { cutoffs, density: rho, unit }), [model.cells, cutoffs, rho, unit]);
  const merged = model.cells.some((c) => Number.isFinite(c.coverage));

  // the curve: tonnes (or volume without a density) and mean grade against the cutoff
  const W = 460, H = 200, L = 52, R = 52, T = 12, B = 30;
  const xs = rows.map((r) => r.cutoff), qty = rows.map((r) => (rho ? r.tonnes : r.volumeM3) || 0), gr = rows.map((r) => r.meanGrade || 0);
  const x0 = Math.min(...xs, 0), xm = Math.max(...xs), x1 = xm > x0 ? xm : x0 + 1, q1 = Math.max(...qty, 1), g1 = Math.max(...gr, 1e-9);
  const sx = (v) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R), sq = (v) => T + (1 - v / q1) * (H - T - B), sg = (v) => T + (1 - v / g1) * (H - T - B);

  const exportCsv = () => {
    const vname = valueColumnName(model);
    const out = gradeTonnageRows(rows, { vname, density: rho, metal }); // #1017 — rows in lib, tested
    const stamp = stampLines({ tool: "Grade-tonnage table", version: APP_VERSION, epsg, params: [
      `Block model: ${model.name} (${model.cells.length} blocks, source ${model.source || "import"}) | value ${vname}${unit ? ` in ${unit}` : " (no unit stated)"}`,
      `Density: ${rho ? `${rho} t/m3, entered by the user (one value for every block)` : "not entered: volumes only"}${merged ? " | merged blocks counted at their COVERAGE share" : ""}`,
      "Mean grade: volume-weighted over the blocks at or above the cutoff",
      EXPLORATION_TARGET_CAUTION,
    ] });
    saveFile({ suggestedName: `${String(model.name).replace(/[^a-z0-9_-]+/gi, "_")}_grade_tonnage.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: withStamp(toExportCsv(out), stamp) });
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
          <label style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 260 }}>{tr("Cutoffs ({unit})", { unit: unit || tr("no unit stated") })}
            <input value={cutoffText} onChange={(e) => setCutoffText(e.target.value)} style={{ ...inp, flex: 1 }} aria-label={tr("Cutoffs, separated by commas")} /></label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Density (t/m³)")}
            <input type="number" min={0} step={0.01} value={density} placeholder={tr("required for tonnes")} onChange={(e) => setDensity(e.target.value)} style={{ ...inp, width: 120 }} /></label>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <thead><tr>
            <th style={th}>{tr("Cutoff")}</th><th style={th}>{tr("Blocks")}</th><th style={th}>{tr("Volume (m³)")}</th><th style={th}>{tr("Mean grade")}</th>
            {rho && <th style={th}>{tr("Tonnes")}</th>}{rho && metal && <th style={th}>{metal.unit === "g" ? tr("Metal (g)") : tr("Metal (t)")}</th>}
          </tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.cutoff}>
              <td style={td}>{sig(r.cutoff)}</td><td style={td}>{fmt(r.blocks)}</td><td style={td}>{fmt(r.volumeM3)}</td><td style={td}>{sig(r.meanGrade)}</td>
              {rho && <td style={td}>{fmt(r.tonnes)}</td>}{rho && metal && <td style={td}>{fmt(r.metal)}</td>}
            </tr>))}</tbody>
        </table>
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
            <text x={(L + W - R) / 2} y={H - 4} fontSize="10" textAnchor="middle" fill="#55606e">{tr("cutoff ({unit})", { unit: unit || "?" })}</text>
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
