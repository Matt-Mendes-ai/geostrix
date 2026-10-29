// TASKS.csv #842 — QA/QC for surface-sample programs (soil, stream sediment, moss mat, rock chip), from the program's own
// inserts and the lab's checks. Matt: inserts are "variable, numerous, let user decide": batches, insertion targets,
// the blank limit and the duplicate limits are the user's settings, saved with the project (surfaceQc.settings).
// Lab certificates (ALS-style "Finalized" and "QC" CSVs) are read here; QC rows of a sample file arrive at import.
// Maths in lib/surfaceQaqc.js; certified values are shared with the drillhole QA/QC (store.crmCertificates).
import React, { useMemo, useRef, useState } from "react";
import { X, Download } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { parseLabCertificate, isLabCertificateText } from "../lib/labCertificate.js";
import { emptySurfaceQc, qcSettings, qcFromCertificates, batchSummary, standardsByCode, blankResults, duplicatePairsSurface, duplicateStats, detectionLimitOf, censoredShares, methodsByElement } from "../lib/surfaceQaqc.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { saveFile } from "../lib/desktop.js";
import { overlay, backdropProps, sel, th, td, panel, header, rowBtn as btn } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { fontSizes } from "../lib/theme.js";
import { t as tr } from "../lib/i18n.js";
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped
import { surfaceQaqcRows } from "../lib/tableExports.js"; // TASKS.csv #1083

const TABS = [["batches", "Batches"], ["standards", "Standards"], ["blanks", "Blanks"], ["duplicates", "Duplicates"], ["limits", "Detection & methods"]];
const fmt = (v) => (v == null || !Number.isFinite(v) ? "—" : Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : Math.abs(v) >= 10 ? v.toFixed(1) : v.toPrecision(3));
const oneIn = (r) => (r == null ? "—" : `1:${Math.round(r)}`);

export default function SurfaceQaqcPanel({ onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const { surfaceSamples, setSurfaceSamples, surfaceElements, surfaceQc, setSurfaceQc, crmCertificates = {}, setCrmCertificate } = useStore();
  const qc = surfaceQc || emptySurfaceQc();
  const settings = qcSettings(qc);
  const records = qc.records || [];
  const units = useMemo(() => Object.fromEntries(surfaceElements.map((e) => [e.symbol, e.unit])), [surfaceElements]);
  const elementList = useMemo(() => {
    const seen = new Set(surfaceElements.map((e) => e.symbol));
    const extra = [...new Set(records.flatMap((r) => Object.keys(r.values || {})))].filter((s) => !seen.has(s)).sort();
    return [...surfaceElements.map((e) => e.symbol), ...extra];
  }, [surfaceElements, records]);
  const [symbol, setSymbol] = useState(elementList[0] || "");
  const [tab, setTab] = useState("batches");
  const [stdCode, setStdCode] = useState(null);
  const [msg, setMsg] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const fileRef = useRef(null);
  const setSettings = (patch) => setSurfaceQc((prev) => { const q = prev || emptySurfaceQc(); return { ...q, settings: { ...qcSettings(q), ...patch } }; });

  // ---- lab certificates ----
  const addCertificates = async (files) => {
    const parsed = [], skipped = [];
    for (const f of files) {
      const text = await f.text();
      if (!isLabCertificateText(text)) { skipped.push(f.name); continue; }
      parsed.push(parseLabCertificate(text, f.name));
    }
    if (!parsed.length) { setMsg({ warn: true, text: tr("None of these files is a lab certificate ({files}).", { files: skipped.join(", ") }) }); return; }
    const r = qcFromCertificates(parsed, surfaceSamples, units);
    const known = new Set(records.map((x) => `${x.batch}|${x.sample_id}|${x.kind}|${JSON.stringify(x.values)}`));
    const fresh = r.records.filter((x) => !known.has(`${x.batch}|${x.sample_id}|${x.kind}|${JSON.stringify(x.values)}`)); // re-adding a certificate adds nothing twice
    setSurfaceQc((prev) => {
      const q = prev || emptySurfaceQc();
      const certs = [...(q.certificates || []).filter((c) => !r.certificates.some((n) => n.id === c.id)), ...r.certificates];
      return { ...q, records: [...(q.records || []), ...fresh], certificates: certs };
    });
    const joinedN = Object.keys(r.joined).length;
    if (joinedN) setSurfaceSamples((prev) => prev.map((s) => (r.joined[String(s.sample_id || "").trim()] ? { ...s, cert: r.joined[String(s.sample_id || "").trim()] } : s)));
    setMsg({ warn: r.unclassified.length > 0 && !joinedN, text: tr("Read {n} certificate file(s): {std} standard, {blk} blank and {dup} duplicate results ({fresh} new); {joined} of your samples matched to their certificate; {other} certificate sample(s) are neither your surface samples nor recognisable QC names and were left out.", { n: parsed.length, std: r.counts.standard, blk: r.counts.blank, dup: r.counts.duplicate, fresh: fresh.length, joined: joinedN, other: r.unclassified.length }) + (skipped.length ? " " + tr("Not certificates: {files}.", { files: skipped.join(", ") }) : "") });
  };

  // ---- checks ----
  const batches = useMemo(() => batchSummary(surfaceSamples, records, settings, qc.certificates || []), [surfaceSamples, records, settings, qc.certificates]);
  const dl = useMemo(() => detectionLimitOf([...surfaceSamples, ...records], symbol), [surfaceSamples, records, symbol]);
  const blankLimit = dl.limit ? settings.blankMultiple * dl.limit : null;
  const stds = useMemo(() => standardsByCode(records, symbol, units, crmCertificates), [records, symbol, units, crmCertificates]);
  const std = stds.find((g) => g.code === stdCode) || stds[0] || null;
  const blanks = useMemo(() => blankResults(records, symbol, units, blankLimit), [records, symbol, units, blankLimit]);
  const pairs = useMemo(() => duplicatePairsSurface(records, surfaceSamples, symbol, units, { rpd: settings.rpd, floor: dl.limit ? settings.pairFloorMultiple * dl.limit : 0 }), [records, surfaceSamples, symbol, units, settings, dl]);
  const dupStats = useMemo(() => duplicateStats(pairs), [pairs]);
  const censored = useMemo(() => censoredShares(surfaceSamples, surfaceElements), [surfaceSamples, surfaceElements]);
  const methods = useMemo(() => methodsByElement(qc.certificates), [qc.certificates]);
  const attrCols = useMemo(() => [...new Set(surfaceSamples.flatMap((s) => Object.keys(s.attrs || {})))].sort(), [surfaceSamples]);
  const unit = units[symbol] || "ppm";
  const cert = std ? crmCertificates[std.code]?.[symbol] : null;

  const exportReport = () => {
    const rows = surfaceQaqcRows({ batches, stds, blanks, pairs, symbol, unit, blankLimit }); // #1083 — rows in lib, tested
    saveFile({ suggestedName: `surface_qaqc_${symbol}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(rows) });
  };

  const counts = { standard: 0, blank: 0, duplicate: 0 };
  records.forEach((r) => counts[r.kind]++);

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panelBox} role="dialog" aria-modal="true" aria-label={tr("Surface QA/QC")} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Surface QA/QC")}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("{s} samples · {std} standard, {blk} blank and {dup} duplicate results · {c} certificates", { s: surfaceSamples.length, std: counts.standard, blk: counts.blank, dup: counts.duplicate, c: (qc.certificates || []).length })}</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <button type="button" style={btn(true)} onClick={() => fileRef.current?.click()}>{tr("Add lab certificates…")}</button>
            <input ref={fileRef} type="file" accept=".csv" multiple style={{ display: "none" }} onChange={(e) => { const f = [...e.target.files]; e.target.value = ""; if (f.length) addCertificates(f); }} />
            <label style={ctl}>{tr("Element")}<select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={{ ...sel, display: "block", marginTop: 4 }}>
              {elementList.map((s) => <option key={s} value={s}>{s}{units[s] ? ` (${units[s]})` : ""}</option>)}
            </select></label>
            <button type="button" style={btn(false)} onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings}>{showSettings ? tr("Hide program settings") : tr("Program settings")}</button>
            <span style={{ flex: 1 }} />
            <button type="button" style={{ ...btn(false), display: "flex", alignItems: "center", gap: 6 }} onClick={exportReport} disabled={!records.length}><Download size={14} />{tr("QC report (CSV)")}</button>
          </div>
          {msg && <div style={{ ...note, color: msg.warn ? "var(--color-warn-text)" : "var(--color-text)" }}>{msg.text}</div>}
          {!records.length && <div style={note}>{tr("No QC results yet. Add the lab's certificates (the QC certificate holds the lab's blanks, standards and duplicates; your own inserts are found by name in the sample certificates), or import a sample file whose sample-type column marks standards, blanks and duplicates.")}</div>}

          {showSettings && (
            <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8, fontSize: "var(--font-size-sm)" }}>
              <div style={note}>{tr("Your program's own rules, saved with the project. Every program is different: set what you planned.")}</div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                <label style={ctl}>{tr("Batches by")}<select value={settings.batchBy} onChange={(e) => setSettings({ batchBy: e.target.value })} style={{ ...sel, marginLeft: 6 }}>
                  <option value="certificate">{tr("Lab certificate")}</option>
                  {attrCols.map((c) => <option key={c} value={`attr:${c}`}>{tr("Column: {v}", { v: c })}</option>)}
                </select></label>
                {["standard", "blank", "duplicate"].map((k) => (
                  <label key={k} style={ctl}>{tr({ standard: "Standards: one in", blank: "Blanks: one in", duplicate: "Duplicates: one in" }[k])}
                    <input type="number" min="2" step="1" value={settings.targets[k] ?? ""} placeholder={tr("no target")} onChange={(e) => setSettings({ targets: { ...settings.targets, [k]: e.target.value === "" ? null : Math.max(2, Number(e.target.value)) } })} style={{ ...sel, width: 80, marginLeft: 6 }} />
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                <label style={ctl}>{tr("Blank fails above")}<input type="number" min="1" step="1" value={settings.blankMultiple} onChange={(e) => setSettings({ blankMultiple: Math.max(1, Number(e.target.value) || 5) })} style={{ ...sel, width: 60, margin: "0 6px" }} />{tr("× detection limit")}</label>
                {[["field", "Field duplicates"], ["lab", "Lab duplicates"], ["unknown", "Type not stated"]].map(([k, l]) => (
                  <label key={k} style={ctl}>{tr(l)} ≤<input type="number" min="1" step="1" value={settings.rpd[k]} onChange={(e) => setSettings({ rpd: { ...settings.rpd, [k]: Math.max(1, Number(e.target.value) || 20) } })} style={{ ...sel, width: 60, margin: "0 4px" }} />% RPD</label>
                ))}
                <label style={ctl}>{tr("Count pairs above")}<input type="number" min="0" step="1" value={settings.pairFloorMultiple} onChange={(e) => setSettings({ pairFloorMultiple: Math.max(0, Number(e.target.value) || 0) })} style={{ ...sel, width: 60, margin: "0 6px" }} />{tr("× detection limit")}</label>
              </div>
            </div>
          )}

          <div role="tablist" style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--color-border)" }}>
            {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ ...tabBtn, borderBottom: tab === k ? "2px solid var(--color-accent)" : "2px solid transparent", color: tab === k ? "var(--color-text)" : "var(--color-text-secondary)" }}>{tr(l)}</button>)}
          </div>

          {tab === "batches" && (
            <>
              <div style={note}>{tr("Program inserts (yours) and lab checks are counted apart: the lab's own QC shows the lab is in control, not that your samples were taken and prepared well. Red: fewer inserts than your target.")}{batches.some((b) => b.fromCertificate) ? " " + tr("* sample count from the certificate (those samples are not in the project).") : ""}</div>
              <div style={{ overflowX: "auto" }}><table style={tbl}>
                <thead><tr><th style={{ ...th, textAlign: "start" }}>{tr("Batch")}</th><th style={th}>{tr("Samples")}</th><th style={th}>{tr("Standards")}</th><th style={th}>{tr("Blanks")}</th><th style={th}>{tr("Duplicates")}</th><th style={th}>{tr("Lab standards")}</th><th style={th}>{tr("Lab blanks")}</th><th style={th}>{tr("Lab duplicates")}</th></tr></thead>
                <tbody>{batches.map((b) => (
                  <tr key={b.batch}>
                    <td style={{ ...td, textAlign: "start" }}>{b.batch}</td><td style={td} title={b.fromCertificate ? tr("From the certificate: these samples are not in the project") : undefined}>{b.samples}{b.fromCertificate ? "*" : ""}</td>
                    {["standard", "blank", "duplicate"].map((k) => <td key={k} style={{ ...td, color: b.short[k] ? "var(--color-danger-fg)" : undefined }} title={b.short[k] ? tr("Below your target of one in {n}", { n: settings.targets[k] }) : undefined}>{b[k]} <span style={{ color: "var(--color-text-muted)" }}>{oneIn(b.rate[k])}</span></td>)}
                    <td style={td}>{b.lab.standard}</td><td style={td}>{b.lab.blank}</td><td style={td}>{b.lab.duplicate}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </>
          )}

          {tab === "standards" && (!stds.length ? <div style={note}>{tr("No standard results for {symbol}.", { symbol })}</div> : (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label style={ctl}>{tr("Standard")}<select value={std?.code || ""} onChange={(e) => setStdCode(e.target.value)} style={{ ...sel, display: "block", marginTop: 4 }}>
                  {stds.map((g) => <option key={g.code} value={g.code}>{g.code} (n {g.n}{g.fails ? `, ${g.fails} > 3 SD` : ""})</option>)}
                </select></label>
                <label style={ctl}>{tr("Certified value")}<input type="number" step="any" value={cert?.mean ?? ""} placeholder={tr("from the certificate")} onChange={(e) => setCrmCertificate(std.code, symbol, { ...(cert || {}), mean: e.target.value === "" ? null : Number(e.target.value) })} style={{ ...sel, display: "block", marginTop: 4, width: 130 }} /></label>
                <label style={ctl}>{tr("Certified SD")}<input type="number" step="any" value={cert?.sd ?? ""} onChange={(e) => setCrmCertificate(std.code, symbol, { ...(cert || {}), sd: e.target.value === "" ? null : Number(e.target.value) })} style={{ ...sel, display: "block", marginTop: 4, width: 110 }} /></label>
              </div>
              <div style={note}>
                {std.limits?.certified
                  ? tr("Limits from the certified value: {mean} ± {sd} {unit}. Observed mean {obs} ({bias}% bias).", { mean: fmt(std.limits.mean), sd: fmt(std.limits.sd), unit, obs: fmt(std.observed.mean), bias: std.biasPct == null ? "—" : std.biasPct.toFixed(1) })
                  : tr("No certified value entered: limits from the standard's own repeats ({mean} ± {sd} {unit}), which shows drift and bad batches but not a bias. Enter the certificate's value and SD to check accuracy.", { mean: fmt(std.limits?.mean), sd: fmt(std.limits?.sd), unit })}
              </div>
              <ControlChart g={std} unit={unit} />
            </>
          ))}

          {tab === "blanks" && (!blanks.length ? <div style={note}>{tr("No blank results for {symbol}.", { symbol })}</div> : (
            <>
              <div style={note}>{dl.limit ? tr("Detection limit {dl} {unit} ({basis}); a blank fails above {lim} {unit} ({m} × DL). {f} of {n} blanks fail.", { dl: fmt(dl.limit), unit, basis: dl.basis === "lt" ? tr("the most common '<' result") : tr("the lowest value reported, an upper bound"), lim: fmt(blankLimit), m: settings.blankMultiple, f: blanks.filter((b) => b.fails).length, n: blanks.length }) : tr("No detection limit could be read for {symbol}.", { symbol })}</div>
              <div style={{ overflowX: "auto", maxHeight: 320 }}><table style={tbl}>
                <thead><tr><th style={{ ...th, textAlign: "start" }}>{tr("Batch")}</th><th style={{ ...th, textAlign: "start" }}>{tr("Sample")}</th><th style={th}>{tr("Source")}</th><th style={th}>{symbol} ({unit})</th><th style={th}>{tr("Result")}</th></tr></thead>
                <tbody>{blanks.map((b, i) => <tr key={i}><td style={{ ...td, textAlign: "start" }}>{b.batch}</td><td style={{ ...td, textAlign: "start" }}>{b.sample_id}</td><td style={td}>{b.source === "lab" ? tr("lab") : tr("program")}</td><td style={td}>{b.bdl ? `<${fmt(b.value * 2)}` : fmt(b.value)}</td><td style={{ ...td, color: b.fails ? "var(--color-danger-fg)" : "var(--color-text-muted)" }}>{b.fails ? tr("over limit") : tr("pass")}</td></tr>)}</tbody>
              </table></div>
            </>
          ))}

          {tab === "duplicates" && (!pairs.length ? <div style={note}>{tr("No duplicate pairs for {symbol}: a duplicate needs its original, in your samples or in the same certificates.", { symbol })}</div> : (
            <>
              <div style={note}>{tr("{w} of {u} counted pairs within their limit; {b} pair(s) near the detection limit shown but not counted. Field duplicates carry the sampling variance and are expected to be much noisier than lab duplicates.", { w: dupStats.within, u: dupStats.used, b: dupStats.n - dupStats.used })} {Object.entries(dupStats.byType).map(([k, v]) => tr("{type}: {w}/{n} within {lim}%", { type: tr(k === "lab" ? "lab" : k === "field" ? "field" : "type not stated"), w: v.within, n: v.n, lim: v.limit })).join(" · ")}</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 300px", minWidth: 0 }}><DupScatter pairs={pairs} unit={unit} /></div>
                <div style={{ flex: "1 1 380px", minWidth: 0, overflowX: "auto", maxHeight: 300 }}><table style={tbl}>
                  <thead><tr><th style={{ ...th, textAlign: "start" }}>{tr("Duplicate")}</th><th style={th}>{tr("Original")}</th><th style={th}>{tr("Duplicate")}</th><th style={th}>RPD %</th><th style={th}>{tr("Type")}</th></tr></thead>
                  <tbody>{pairs.slice().sort((a, b) => b.rpd - a.rpd).map((p, i) => <tr key={i} style={{ color: p.counted ? undefined : "var(--color-text-muted)" }}><td style={{ ...td, textAlign: "start" }}>{p.sample_id}</td><td style={td}>{fmt(p.v1)}</td><td style={td}>{fmt(p.v2)}</td><td style={{ ...td, color: p.fails ? "var(--color-danger-fg)" : undefined }}>{p.rpd.toFixed(0)}</td><td style={td}>{tr(p.type === "lab" ? "lab" : p.type === "field" ? "field" : "type not stated")}</td></tr>)}</tbody>
                </table></div>
              </div>
            </>
          ))}

          {tab === "limits" && (
            <>
              <div style={note}>{tr("Below-detection results are stored at half the detection limit (a common convention, not the only one; it biases statistics of heavily censored elements). Elements over 30% below detection are marked. An element reported by more than one method (a different digestion, or an ore-grade finish) is listed: results from different digestions are not directly comparable.")}</div>
              <div style={{ overflowX: "auto", maxHeight: 360 }}><table style={tbl}>
                <thead><tr><th style={{ ...th, textAlign: "start" }}>{tr("Element")}</th><th style={th}>n</th><th style={th}>{tr("Below detection")}</th><th style={th}>%</th><th style={th}>{tr("Detection limit")}</th><th style={{ ...th, textAlign: "start" }}>{tr("Methods (certificates)")}</th></tr></thead>
                <tbody>{censored.map((c) => { const d = detectionLimitOf(surfaceSamples, c.symbol); const m = methods[c.symbol] || []; return (
                  <tr key={c.symbol}><td style={{ ...td, textAlign: "start" }}>{c.symbol}</td><td style={td}>{c.n}</td><td style={td} title={c.zero ? tr("{n} more reported as 0 by the source (below detection or not analysed: the layer does not say), not in n or %", { n: c.zero }) : undefined}>{c.bdl}{c.zero ? <span style={{ color: "var(--color-warn-text)" }}>{` + ${tr("{n} at 0", { n: c.zero })}`}</span> : null}</td><td style={{ ...td, color: c.pct > 30 ? "var(--color-warn-text)" : undefined }}>{c.pct.toFixed(0)}</td><td style={td} title={d.basis === "min" ? tr("No '<' results: the lowest value reported, an upper bound on the limit") : undefined}>{d.limit ? `${d.basis === "min" ? "≤ " : ""}${fmt(d.limit)} ${c.unit}` : "—"}</td><td style={{ ...td, textAlign: "start", color: m.length > 1 ? "var(--color-warn-text)" : undefined }}>{m.join(", ") || "—"}</td></tr>
                ); })}</tbody>
              </table></div>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          {records.length > 0 && <button type="button" style={btn(false)} onClick={() => { if (window.confirm(tr("Remove all {n} QC results and certificates from the project? Your samples are not changed.", { n: records.length }))) setSurfaceQc((prev) => ({ ...emptySurfaceQc(), settings: prev?.settings || emptySurfaceQc().settings })); }}>{tr("Remove QC results")}</button>}
          <span style={{ flex: 1 }} />
          <button type="button" style={btn(false)} onClick={onClose}>{tr("Close")}</button>
        </div>
      </div>
    </div>
  );
}

// Standard results in order, with the expected value and the 2 / 3 SD bands (certified or the standard's own)
function ControlChart({ g, unit }) {
  if (!g?.limits || !g.points.length) return null;
  const w = 760, h = 220, pl = 52, pr = 10, pt = 10, pb = 22, { mean, sd } = g.limits;
  const vals = [...g.points.map((p) => p.value), mean + 3.3 * sd, mean - 3.3 * sd];
  const y0 = Math.min(...vals), y1 = Math.max(...vals) + 1e-12, n = g.points.length;
  const X = (i) => pl + (n === 1 ? (w - pl - pr) / 2 : (i / (n - 1)) * (w - pl - pr)), Y = (v) => h - pb - ((v - y0) / (y1 - y0)) * (h - pb - pt);
  const band = (k, dash, colour) => <line x1={pl} x2={w - pr} y1={Y(mean + k * sd)} y2={Y(mean + k * sd)} style={{ stroke: colour, strokeDasharray: dash }} />;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={tr("Control chart")} style={{ display: "block" }}>
      <line x1={pl} x2={pl} y1={pt} y2={h - pb} style={{ stroke: "var(--color-border)" }} />
      {band(0, undefined, "#009E73")}{band(2, "4 3", "#E69F00")}{band(-2, "4 3", "#E69F00")}{band(3, "2 2", "#D55E00")}{band(-3, "2 2", "#D55E00")}
      {[-3, -2, 0, 2, 3].map((k) => <text key={k} x={pl - 4} y={Y(mean + k * sd) + 3} textAnchor="end" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{fmt(mean + k * sd)}</text>)}
      <polyline points={g.points.map((p, i) => `${X(i)},${Y(p.value)}`).join(" ")} style={{ fill: "none", stroke: "var(--color-border-light)" }} />
      {g.points.map((p, i) => <circle key={i} cx={X(i)} cy={Y(p.value)} r={3} style={{ fill: p.out3 ? "#D55E00" : p.out2 ? "#E69F00" : "var(--color-text-secondary)" }}><title>{`${p.sample_id} · ${p.batch || ""} · ${fmt(p.value)} ${unit} · z ${p.z.toFixed(1)}`}</title></circle>)}
      <text x={w - pr} y={h - 4} textAnchor="end" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{tr("in order received ({n} results), {unit}", { n, unit })}</text>
    </svg>
  );
}

// Original against duplicate on log axes, with the 1:1 line and the limit band of the commonest type
function DupScatter({ pairs, unit }) {
  const pos = pairs.filter((p) => p.v1 > 0 && p.v2 > 0);
  if (!pos.length) return null;
  const w = 320, h = 300, p0 = 40, all = pos.flatMap((p) => [p.v1, p.v2]).map(Math.log10), lo = Math.min(...all), hi = Math.max(...all) + 1e-9;
  const S = (v) => p0 + ((Math.log10(v) - lo) / (hi - lo)) * (w - p0 - 10), T = (v) => h - p0 - ((Math.log10(v) - lo) / (hi - lo)) * (h - p0 - 10);
  const lim = pos[0].limit / 100, k = (1 + lim / 2) / (1 - lim / 2); // RPD = lim  <=>  v2 / v1 = k
  const a = 10 ** lo, b = 10 ** hi;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={tr("Original against duplicate")} style={{ display: "block" }}>
      <line x1={S(a)} y1={T(a)} x2={S(b)} y2={T(b)} style={{ stroke: "#009E73" }} />
      <line x1={S(a)} y1={T(Math.min(b, a * k))} x2={S(Math.min(b, b / k))} y2={T(b)} style={{ stroke: "#E69F00", strokeDasharray: "4 3" }} />
      <line x1={S(Math.min(b, a * k))} y1={T(a)} x2={S(b)} y2={T(Math.min(b, b / k))} style={{ stroke: "#E69F00", strokeDasharray: "4 3" }} />
      {pos.map((p, i) => <circle key={i} cx={S(p.v1)} cy={T(p.v2)} r={2.8} style={{ fill: !p.counted ? "var(--color-border)" : p.fails ? "#D55E00" : "var(--color-text-secondary)" }}><title>{`${p.sample_id}: ${fmt(p.v1)} / ${fmt(p.v2)} ${unit}, ${p.rpd.toFixed(0)}%`}</title></circle>)}
      <text x={w / 2} y={h - 8} textAnchor="middle" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{tr("original ({unit}, log)", { unit })}</text>
      <text x={10} y={h / 2} textAnchor="middle" fontSize={fontSizes.xs} transform={`rotate(-90 10 ${h / 2})`} style={{ fill: "var(--color-text-muted)" }}>{tr("duplicate")}</text>
    </svg>
  );
}

const panelBox = panel({ width: "min(1100px, 96vw)", maxHeight: "92vh" }); // TASKS.csv #997 — the shared modal chrome
const ctl = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const tbl = { borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" };
const tabBtn = { background: "none", border: "none", padding: "6px 10px", cursor: "pointer", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
