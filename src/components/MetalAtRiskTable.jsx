// TASKS.csv #3746 — the metal the top samples carry, where a cap is chosen (Compositing, Estimation, Grade statistics): the top n samples and the top
// percentiles of the samples with their share of the metal (grade × length), and the share a cap at their lowest grade removes — so a cap is picked where
// the loss is seen, not after the click. Data only: no deposit-style rule. values ascending, weights aligned (lib/metalAtRisk.js).
import React, { useMemo } from "react";
import { metalAtRisk } from "../lib/metalAtRisk.js";
import { t as tr } from "../lib/i18n.js";

const fmt = (v) => (v == null || !Number.isFinite(v) ? "—" : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3));
const th = { textAlign: "right", padding: "2px 8px", fontWeight: 600, borderBottom: "1px solid var(--color-border)", whiteSpace: "nowrap" };
const td = { textAlign: "right", padding: "2px 8px", whiteSpace: "nowrap" };

export default function MetalAtRiskTable({ values, weights, unitLabel = "", toShown = (v) => v, onSetCap = null, defaultOpen = false }) {
  const t = useMemo(() => metalAtRisk(values, weights), [values, weights]);
  if (!t.rows.length) return null;
  const btn = { background: "none", border: "1px solid var(--color-border)", borderRadius: 4, padding: "0 6px", cursor: "pointer", fontSize: "var(--font-size-xs)", color: "var(--color-text)", fontFamily: "inherit" };
  return (
    <details open={defaultOpen} style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
      <summary style={{ cursor: "pointer" }} title={tr("Which samples hold the metal: pick a cap where the loss is acceptable, before applying it.")}>{tr("Metal at risk: the top {a} sample(s) hold {pct} % of the metal", { a: t.rows[Math.min(t.rows.length - 1, 3)].n, pct: t.rows[Math.min(t.rows.length - 1, 3)].pctMetal.toFixed(1) })}</summary>
      <div style={{ overflowX: "auto", marginTop: 3 }}>
        <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
          <thead><tr>
            <th style={{ ...th, textAlign: "left" }}>{tr("Top")}</th><th style={th}>{tr("Samples")}</th><th style={th}>{tr("At or above ({unit})", { unit: unitLabel })}</th><th style={th}>{tr("Metres")}</th><th style={th}>{tr("% of the metal")}</th><th style={th} title={tr("The share of the metal removed by a cap at that grade")}>{tr("A cap there removes")}</th>{onSetCap && <th style={th} />}
          </tr></thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={`${r.kind}${r.top}`}>
                <td style={{ ...td, textAlign: "left" }}>{r.kind === "n" ? tr("Top {n}", { n: r.top }) : tr("Top {p} % of samples", { p: r.top })}</td>
                <td style={td}>{r.n.toLocaleString()}</td><td style={td}>{fmt(toShown(r.grade))}</td><td style={td}>{r.metres.toFixed(1)}</td>
                <td style={{ ...td, fontWeight: 600 }}>{r.pctMetal.toFixed(1)} %</td><td style={td}>{r.capRemovesPct.toFixed(1)} %</td>
                {onSetCap && <td style={td}><button type="button" style={btn} onClick={() => onSetCap(r.grade)}>{tr("Cap here")}</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
