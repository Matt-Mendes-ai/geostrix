// TASKS.csv #601 — review of laboratory certificates before anything is imported: how they joined to the drillhole
// samples, where the database and the certificates disagree, and a QC-type SUGGESTION for every certificate sample
// that is not in the drillhole data (blank / standard / duplicate / unclassified, each with its reason). The user
// accepts the suggestions as they are or edits them — per row, or a whole reference-material group at once —
// and only rows left as Standard, Blank or Duplicate are imported (Matt, 2026-10-06).
import React, { useMemo, useState } from "react";
import StepDialog from "./StepDialog.jsx"; // TASKS.csv #4073 — the shared step shell (Escape and the focus trap, #238)
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { qcRowPlacement, indexAssaysForPlacement } from "../lib/labCertificate.js"; // TASKS.csv #1211

export const QC_TYPES = [
  ["standard", "Standard"], ["blank", "Blank"], ["duplicate", "Duplicate"], ["unclassified", "Not imported"],
];
const TYPE_COLOR = { standard: "#c9a03c", blank: "#7fa7c9", duplicate: "#8fbf7f", unclassified: "var(--color-text-muted)" };

export default function LabCertificateModal({ review, assays, onChange, onCancel, onCommit }) {
  const placeIndex = useMemo(() => indexAssaysForPlacement(assays), [assays]);
  const [at, setAt] = useState(0); // TASKS.csv #4073 — the step on screen
  const [filter, setFilter] = useState("all");
  const rows = review.suggestions;
  const counts = useMemo(() => { const c = { standard: 0, blank: 0, duplicate: 0, unclassified: 0 }; rows.forEach((r) => { c[r.type]++; }); return c; }, [rows]);
  const groups = useMemo(() => { const g = new Map(); rows.forEach((r) => { if (r.type === "standard") g.set(r.qc_code || "", (g.get(r.qc_code || "") || 0) + 1); }); return [...g.entries()].sort((a, b) => b[1] - a[1]); }, [rows]);
  const shown = filter === "all" ? rows : rows.filter((r) => r.type === filter);
  const setRow = (id, patch) => onChange({ ...review, suggestions: rows.map((r) => (r.sample_id === id ? { ...r, ...patch, edited: true } : r)) });
  const renameGroup = (from, to) => onChange({ ...review, suggestions: rows.map((r) => (r.type === "standard" && (r.qc_code || "") === from ? { ...r, qc_code: to } : r)) });
  const toImport = counts.standard + counts.blank + counts.duplicate;
  const s = review.summary;

  // TASKS.csv #4073 (Matt: "similar for all pop up windows"; "GeoStrix is too wordy") — two steps: Matched (how the certificates joined, where they
  // disagree with the database, the values they can fill in) and QC samples (the suggested types, the reference-material groups, the table), with Import
  // the last step's gold primary under the same guard. The review lives in the parent (onChange), so a step that unmounts loses nothing. How the types
  // are suggested, what a group's name box does and why a drill sample has no certificate are in the Help card; what is kept, what disagrees, what
  // cannot be found and what Import leaves out stay seen.
  const heading = tr("Lab certificates: {certificates} {v}, {rows} samples", { certificates: s.certificates, v: tr(s.certificates === 1 ? "file" : "files"), rows: s.rows.toLocaleString() });
  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>{tr("Lab certificates")}</summary>
      <div style={note}>{tr("GeoStrix suggests a type for each sample that is only in the certificates:")}{" "}<b>{tr("blank")}</b>{" "}{tr("when its ore elements sit at the bottom of the drill samples,")}{" "}<b>{tr("standard")}</b>{" "}{tr("when several inserts share one multi-element signature (one group per reference material),")}{" "}<b>{tr("duplicate")}</b>{" "}{tr("when it is within ~30 % of a drill sample just before or after it in the numbering. Check them against the lab's QC list; nothing is classified until you import.")}</div>
      <div style={{ ...note, marginTop: 6 }}>{tr("A group's name box renames that reference material for every insert in the group (e.g. the CRM's real name).")}</div>
      <div style={{ ...note, marginTop: 6 }}>{tr("A drill sample without a certificate: a certificate not given, or a sample id written differently.")}</div>
    </details>
  );
  // what Import brings in and what it leaves out, seen on both steps (the old footer line), beside the Help button
  const importLine = tr("Imports {toImport} QC sample(s){v}; {unclassified} left out.", { toImport: toImport.toLocaleString(), v: review.fill && s.fillable ? tr(" and {fillable} missing value(s)", { fillable: s.fillable.toLocaleString() }) : "", unclassified: counts.unclassified });
  const steps = [
    { key: "matched", label: tr("Matched"), primary: { label: tr("Next") }, render: () => (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={note}>{tr("{matched} matched by sample id · {unmatched} only in the certificates{v}", { matched: s.matched.toLocaleString(), unmatched: s.unmatched.toLocaleString(), v: s.labs ? ` · ${s.labs}` : "" })}</div>
        {s.sheetCerts?.missing?.length > 0 && ( /* TASKS.csv #2764 — the sheet's certificates that no given file is */
          <div style={warn} title={s.sheetCerts.missing.map((m) => `${m.certificate} (${m.n})`).join(", ")}>
            {tr("The assay sheet names {n} certificate(s) that none of these files is: {list}.", { n: s.sheetCerts.missing.length, list: s.sheetCerts.missing.slice(0, 6).map((m) => tr("{certificate} ({n} sample(s))", { certificate: m.certificate, n: m.n.toLocaleString() })).join(", ") + (s.sheetCerts.missing.length > 6 ? ", …" : "") })}
          </div>
        )}
        {s.noCert?.count > 0 && <div style={warn} title={s.noCert.examples.join(", ")}>{tr("{n} drill sample(s) have no certificate in these files, e.g. {list}.", { n: s.noCert.count.toLocaleString(), list: s.noCert.examples.slice(0, 3).join(", ") })}</div>}{/* #2024; why it may be: the Help card (#4073) */}
        <div style={note}>
          {s.mismatchCount
            ? <>{tr("{mismatchCount} value(s) differ by more than 2 % between the database and the certificates — check them before trusting either{v}. The database values are kept.", { mismatchCount: s.mismatchCount.toLocaleString(), v: s.mismatchExamples.length ? `, e.g. ${s.mismatchExamples.join("; ")}` : "" })}</>
            : <>{tr("Every value the database shares with the certificates agrees (within 2 %).")}</>}
        </div>
        {s.fillable > 0 && (
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "var(--font-size-base)" }}>
            <input type="checkbox" checked={!!review.fill} onChange={(e) => onChange({ ...review, fill: e.target.checked })} />{tr("Add {fillable} missing value(s) ({fillElements}) from the certificates", { fillable: s.fillable.toLocaleString(), fillElements: s.fillElements.join(", ") })}</label>
        )}
      </div>
    ) },
    { key: "qc", label: tr("QC samples"), primary: { label: tr("Import"), onClick: onCommit, disabled: !toImport && !(review.fill && s.fillable) }, render: () => (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={note}>{tr("Suggested types: check them against the lab's QC list.")}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
          {[["all", tr("All {rows}", { rows: rows.length })], ...QC_TYPES.map(([k, l]) => [k, `${l} ${counts[k]}`])].map(([k, l]) => (
            <button data-btn-own="" key={k} type="button" onClick={() => setFilter(k)} style={{ ...chip, ...(filter === k ? chipOn : null) }}>{l}</button>
          ))}
        </div>
        {groups.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {groups.map(([code, n]) => (
              <label key={code} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                <span>{n} ×</span>
                <input defaultValue={code} onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== code) renameGroup(code, e.target.value.trim()); }} style={{ ...inp, width: 120 }} aria-label={tr("Name of reference material {code}", { code })} />
              </label>
            ))}
          </div>
        )}
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "var(--font-size-sm)" }}>
          <thead>
            <tr style={{ color: "var(--color-text-muted)", textAlign: "start" }}>
              <th style={th}>{tr("Sample")}</th><th style={th}>{tr("Type")}</th><th style={th}>{tr("Material / parent")}</th><th style={th}>{tr("Why")}</th><th style={th}>{tr("Placement")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 1500).map((r) => (
              <tr key={r.sample_id} style={{ borderTop: "1px solid var(--color-border)" }}>
                <td style={td} title={r.certificate}>{r.sample_id}{r.edited ? " *" : ""}</td>
                <td style={td}>
                  <select value={r.type} onChange={(e) => setRow(r.sample_id, { type: e.target.value })} style={{ ...inp, color: TYPE_COLOR[r.type] }} aria-label={tr("Type of {sample_id}", { sample_id: r.sample_id })}>
                    {QC_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </td>
                <td style={td}>
                  {r.type === "standard" && <input value={r.qc_code || ""} onChange={(e) => setRow(r.sample_id, { qc_code: e.target.value })} style={{ ...inp, width: 110 }} aria-label={tr("Reference material of {sample_id}", { sample_id: r.sample_id })} />}
                  {r.type === "duplicate" && <input value={r.parent_id || ""} onChange={(e) => setRow(r.sample_id, { parent_id: e.target.value })} style={{ ...inp, width: 110 }} placeholder={tr("original sample")} aria-label={tr("Original sample of {sample_id}", { sample_id: r.sample_id })} />}
                </td>
                <td style={{ ...td, color: "var(--color-text-muted)" }}>{r.reason}</td>
                <td style={td}>{(() => { // TASKS.csv #1211 — said here, not only in the notice after Import
                  if (r.type === "unclassified") return "—";
                  const p = qcRowPlacement(r, placeIndex);
                  if (!p) return <span style={{ color: "var(--color-danger-text, #a33)" }}>{tr("Cannot be placed: give its original sample")}</span>;
                  return p.own ? tr("Under its own name: no drill sample with a nearby number") : tr("{hole} at {m} m", { hole: p.hole_id, m: p.to });
                })()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length > 1500 && <div style={note}>{tr("Showing the first 1,500 of {shown} — filter by type to see the rest.", { shown: shown.length.toLocaleString() })}</div>}
      </div>
    ) },
  ];
  const extra = <span data-cert-import-line="" role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{importLine}</span>;

  return <StepDialog title={heading} onClose={onCancel} steps={steps} at={at} onAt={setAt} help={help} extra={extra} width="min(980px, 96vw)" />;
}

const warn = { fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)" };
const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5 };
const inp = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "3px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)", fontFamily: "inherit" };
const th = { padding: "4px 6px", fontWeight: 600 };
const td = { padding: "4px 6px", verticalAlign: "top" };
const chip = { background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 12, padding: "3px 10px", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "inherit" };
const chipOn = { borderColor: "var(--color-accent)", color: "var(--color-accent)" };
