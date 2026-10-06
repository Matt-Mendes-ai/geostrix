// TASKS.csv #601 — review of laboratory certificates before anything is imported: how they joined to the drillhole
// samples, where the database and the certificates disagree, and a QC-type SUGGESTION for every certificate sample
// that is not in the drillhole data (blank / standard / duplicate / unclassified, each with its reason). The user
// accepts the suggestions as they are or edits them — per row, or a whole reference-material group at once —
// and only rows left as Standard, Blank or Duplicate are imported (Matt, 2026-10-06).
import React, { useMemo, useState } from "react";
import { X } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";

export const QC_TYPES = [
  ["standard", "Standard"], ["blank", "Blank"], ["duplicate", "Duplicate"], ["unclassified", "Not imported"],
];
const TYPE_COLOR = { standard: "#c9a03c", blank: "#7fa7c9", duplicate: "#8fbf7f", unclassified: "var(--color-text-muted)" };

export default function LabCertificateModal({ review, onChange, onCancel, onCommit }) {
  useEscapeKey(onCancel);
  useFocusTrap();
  const [filter, setFilter] = useState("all");
  const rows = review.suggestions;
  const counts = useMemo(() => { const c = { standard: 0, blank: 0, duplicate: 0, unclassified: 0 }; rows.forEach((r) => { c[r.type]++; }); return c; }, [rows]);
  const groups = useMemo(() => { const g = new Map(); rows.forEach((r) => { if (r.type === "standard") g.set(r.qc_code || "", (g.get(r.qc_code || "") || 0) + 1); }); return [...g.entries()].sort((a, b) => b[1] - a[1]); }, [rows]);
  const shown = filter === "all" ? rows : rows.filter((r) => r.type === filter);
  const setRow = (id, patch) => onChange({ ...review, suggestions: rows.map((r) => (r.sample_id === id ? { ...r, ...patch, edited: true } : r)) });
  const renameGroup = (from, to) => onChange({ ...review, suggestions: rows.map((r) => (r.type === "standard" && (r.qc_code || "") === from ? { ...r, qc_code: to } : r)) });
  const toImport = counts.standard + counts.blank + counts.duplicate;
  const s = review.summary;

  return (
    <div style={overlay}>
      <div style={panel} role="dialog" aria-modal="true" aria-label="Lab certificates" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>Lab certificates: {s.certificates} file{s.certificates === 1 ? "" : "s"}, {s.rows.toLocaleString()} samples</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>
              {s.matched.toLocaleString()} matched to drill samples by sample id · {s.unmatched.toLocaleString()} not in the drillhole data (QC inserts?){s.labs ? ` · ${s.labs}` : ""}
            </div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label="Close" size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onCancel} />
        </div>

        <div style={{ padding: 16, overflowY: "auto" }}>
          <div style={label}>Matched samples</div>
          <div style={note}>
            {s.mismatchCount
              ? <>{s.mismatchCount.toLocaleString()} value(s) differ by more than 2 % between the database and the certificates — check them before trusting either{s.mismatchExamples.length ? `, e.g. ${s.mismatchExamples.join("; ")}` : ""}. The database values are kept.</>
              : <>Every value the database shares with the certificates agrees (within 2 %).</>}
          </div>
          {s.fillable > 0 && (
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "var(--font-size-base)", margin: "6px 0 12px" }}>
              <input type="checkbox" checked={!!review.fill} onChange={(e) => onChange({ ...review, fill: e.target.checked })} />
              Add the {s.fillable.toLocaleString()} value(s) the drill samples don't have yet ({s.fillElements.join(", ")}) from the certificates
            </label>
          )}

          <div style={{ ...label, marginTop: 10 }}>Suggested QC samples — accept or edit</div>
          <div style={note}>
            GeoStrix suggests a type for each sample that is only in the certificates: <b>blank</b> when its ore elements sit at the bottom of the drill samples, <b>standard</b> when several inserts share one multi-element signature (one group per reference material), <b>duplicate</b> when it is within ~30 % of a drill sample just before or after it in the numbering. Check them against the lab's QC list; nothing is classified until you import.
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
            {[["all", `All ${rows.length}`], ...QC_TYPES.map(([k, l]) => [k, `${l} ${counts[k]}`])].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} style={{ ...chip, ...(filter === k ? chipOn : null) }}>{l}</button>
            ))}
          </div>
          {groups.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {groups.map(([code, n]) => (
                <label key={code} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }} title="Rename this reference material for every insert in the group (e.g. the CRM's real name, OREAS 501d)">
                  <span>{n} ×</span>
                  <input defaultValue={code} onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== code) renameGroup(code, e.target.value.trim()); }} style={{ ...inp, width: 120 }} aria-label={`Name of reference material ${code}`} />
                </label>
              ))}
            </div>
          )}
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "var(--font-size-sm)" }}>
            <thead>
              <tr style={{ color: "var(--color-text-muted)", textAlign: "left" }}>
                <th style={th}>Sample</th><th style={th}>Type</th><th style={th}>Material / parent</th><th style={th}>Why</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 1500).map((r) => (
                <tr key={r.sample_id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={td} title={r.certificate}>{r.sample_id}{r.edited ? " *" : ""}</td>
                  <td style={td}>
                    <select value={r.type} onChange={(e) => setRow(r.sample_id, { type: e.target.value })} style={{ ...inp, color: TYPE_COLOR[r.type] }} aria-label={`Type of ${r.sample_id}`}>
                      {QC_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                  <td style={td}>
                    {r.type === "standard" && <input value={r.qc_code || ""} onChange={(e) => setRow(r.sample_id, { qc_code: e.target.value })} style={{ ...inp, width: 110 }} aria-label={`Reference material of ${r.sample_id}`} />}
                    {r.type === "duplicate" && <input value={r.parent_id || ""} onChange={(e) => setRow(r.sample_id, { parent_id: e.target.value })} style={{ ...inp, width: 110 }} placeholder="original sample" aria-label={`Original sample of ${r.sample_id}`} />}
                  </td>
                  <td style={{ ...td, color: "var(--color-text-muted)" }}>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > 1500 && <div style={note}>Showing the first 1,500 of {shown.length.toLocaleString()} — filter by type to see the rest.</div>}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)", alignItems: "center" }}>
          <div style={{ flex: 1, fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
            Imports {toImport.toLocaleString()} QC sample(s){review.fill && s.fillable ? ` and ${s.fillable.toLocaleString()} missing value(s)` : ""}; {counts.unclassified} left out.
          </div>
          <button type="button" onClick={onCancel} style={btn(false)}>Cancel</button>
          <button type="button" onClick={onCommit} style={btn(true)} disabled={!toImport && !(review.fill && s.fillable)}>Import</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(980px, 96vw)", maxHeight: "90vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const label = { fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 };
const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5 };
const inp = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "3px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)", fontFamily: "inherit" };
const th = { padding: "4px 6px", fontWeight: 600 };
const td = { padding: "4px 6px", verticalAlign: "top" };
const chip = { background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 12, padding: "3px 10px", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "inherit" };
const chipOn = { borderColor: "var(--color-accent)", color: "var(--color-accent)" };
const btn = (primary) => ({ padding: "7px 14px", borderRadius: 6, fontSize: "var(--font-size-base)", fontFamily: "inherit", cursor: "pointer", border: primary ? "1px solid var(--color-accent)" : "1px solid var(--color-border)", background: primary ? "var(--color-accent)" : "var(--color-bg)", color: primary ? "var(--color-bg)" : "var(--color-text)" });
