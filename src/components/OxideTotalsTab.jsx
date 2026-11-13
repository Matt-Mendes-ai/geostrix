// TASKS.csv #2506 (review #2486, WA lithium) — QAQC's Totals tab: with whole-rock oxides and no QC samples the analytical total is the QC.
// Each sample's major-oxide sum, its spread, the samples outside a tolerance the user types (no default), every oxide over 100 %, and an
// exclusion written on the assay rows that every tool leaving out QC inserts honours, and the diagrams. Maths in lib/oxideTotals.js.
import React, { useMemo, useState } from "react";
import { t as tr } from "../lib/i18n.js";
import { oxideTotals, outsideTolerance, totalsHistogram, setTotalExclusion } from "../lib/oxideTotals.js";

const fmt = (v) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(2));
const LIST_MAX = 50;

export default function OxideTotalsTab({ assays, majors, setAssays, sel, tabBtn }) {
  const [lo, setLo] = useState(""), [hi, setHi] = useState("");
  const live = useMemo(() => assays.filter((a) => a.excluded !== "total"), [assays]);
  const excludedN = assays.length - live.length;
  const res = useMemo(() => oxideTotals(live, majors), [live, majors]);
  const hist = useMemo(() => totalsHistogram(res), [res]);
  const out = useMemo(() => outsideTolerance(res, lo, hi), [res, lo, hi]);
  const over = res.over100;
  const flagged = useMemo(() => { const m = new Map(); for (const t of out) m.set(t.a, t.a); for (const o of over) m.set(o.a, o.a); return [...m.values()]; }, [out, over]);
  const [msg, setMsg] = useState("");
  const exclude = () => { const r = setTotalExclusion(assays, flagged, true); setAssays(r.assays); setMsg(tr("{n} sample(s) excluded from plots and statistics.", { n: r.changed })); };
  const restore = () => { const r = setTotalExclusion(assays, [], false); setAssays(r.assays); setMsg(tr("{n} sample(s) included again.", { n: r.changed })); };
  const W = 520, H = 110;
  const where = (a) => `${a.hole_id} ${a.from}-${a.to} m${a.sample_id ? ` (${a.sample_id})` : ""}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
        {tr("Sum of the major oxides ({list}) per sample, from the stored values with the import's factors, total iron as {fe}. LOI and the minor oxides are not in it: a sound sample totals about 100 less its LOI.", { list: majors.map((m) => m.oxide).join(", "), fe: majors.find((m) => m.symbol === "Fe")?.oxide || "Fe2O3" })}
      </div>
      <div style={{ fontSize: "var(--font-size-sm)" }}>
        {res.n ? tr("{n} sample(s) with every major: median {median} %, 90 % of them between {p5} and {p95} %, range {min} to {max} %.", { n: res.n.toLocaleString(), median: fmt(res.median), p5: fmt(res.p5), p95: fmt(res.p95), min: fmt(res.min), max: fmt(res.max) }) : tr("No sample holds every major oxide.")}
        {res.incomplete ? " " + tr("{n} sample(s) miss at least one major and have no total.", { n: res.incomplete.toLocaleString() }) : ""}
        {res.loi?.n ? " " + tr("With their LOI ({n} sample(s)): median {median} %, 90 % of them between {p5} and {p95} %.", { n: res.loi.n.toLocaleString(), median: fmt(res.loi.median), p5: fmt(res.loi.p5), p95: fmt(res.loi.p95) }) : ""}{/* TASKS.csv #2734 */}
        {res.loi?.over60 ? " " + tr("{n} sample(s) hold an LOI over 60 %: no rock loses that much on ignition, so these are probably empty or failed samples.", { n: res.loi.over60.toLocaleString() }) : ""}{/* #2924 */}
      </div>
      {hist && (
        <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: "100%", maxWidth: W, direction: "ltr" }} role="img" aria-label={tr("Histogram of the oxide totals")}>
          {hist.bins.map((c, i) => { const bw = W / hist.bins.length, h = hist.max ? (c / hist.max) * H : 0; const x0 = hist.lo + i * hist.w; const off = (lo !== "" && x0 + hist.w <= Number(lo)) || (hi !== "" && x0 >= Number(hi)); return <rect key={i} x={i * bw + 0.5} y={H - h} width={Math.max(1, bw - 1)} height={h} fill={off ? "#D55E00" : "#0072B2"}><title>{`${x0}–${x0 + hist.w} %: ${c}`}</title></rect>; })}
          <text x={0} y={H + 14} fontSize="10" fill="#65717e">{hist.lo} %</text>
          <text x={W} y={H + 14} fontSize="10" fill="#65717e" textAnchor="end">{hist.lo + hist.bins.length * hist.w} %</text>
        </svg>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Total below (%)")}<input type="number" step="any" value={lo} onChange={(e) => setLo(e.target.value)} placeholder={tr("none")} style={{ ...sel, display: "block", marginTop: 4, width: 90 }} /></label>
        <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Total above (%)")}<input type="number" step="any" value={hi} onChange={(e) => setHi(e.target.value)} placeholder={tr("none")} style={{ ...sel, display: "block", marginTop: 4, width: 90 }} /></label>
        <span style={{ fontSize: "var(--font-size-sm)" }}>{lo === "" && hi === "" ? tr("Type a tolerance to list the samples outside it.") : tr("{n} sample(s) outside the tolerance.", { n: out.length.toLocaleString() })}</span>
      </div>
      {over.length > 0 && <div role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)" }}>{tr("{n} oxide value(s) over 100 % (impossible as wt%): {list}.", { n: over.length, list: over.slice(0, 5).map((o) => `${where(o.a)} ${o.oxide} ${fmt(o.value)} %`).join("; ") + (over.length > 5 ? " …" : "") })}</div>}
      {out.length > 0 && (
        <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 4 }}>
          <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" }}>
            <thead><tr><th style={{ textAlign: "start", padding: "3px 6px" }}>{tr("Sample")}</th><th style={{ textAlign: "end", padding: "3px 6px" }}>{tr("Total (%)")}</th></tr></thead>
            <tbody>{out.slice(0, LIST_MAX).map((t, i) => <tr key={i}><td style={{ padding: "2px 6px" }}>{where(t.a)}</td><td style={{ padding: "2px 6px", textAlign: "end" }}>{fmt(t.total)}</td></tr>)}</tbody>
          </table>
          {out.length > LIST_MAX && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", padding: "2px 6px" }}>{tr("and {n} more", { n: (out.length - LIST_MAX).toLocaleString() })}</div>}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" disabled={!flagged.length || !setAssays} onClick={exclude} style={tabBtn} title={tr("Writes the exclusion on each sample: Grade stats, Correlation, Compositing, Best intercepts, estimation and the diagrams leave it out, as they leave out QC inserts. Saved with the project; reversible.")}>{tr("Exclude {n} sample(s) from plots and statistics", { n: flagged.length.toLocaleString() })}</button>
        {excludedN > 0 && <button type="button" onClick={restore} style={tabBtn}>{tr("Include the {n} excluded sample(s) again", { n: excludedN.toLocaleString() })}</button>}
        {msg && <span role="status" style={{ fontSize: "var(--font-size-sm)" }}>{msg}</span>}
      </div>
    </div>
  );
}
