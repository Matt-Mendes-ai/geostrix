// TASKS.csv #4094 (Matt, 2026-11-25: "better organize them", chose option C, "the list") — the empty 3D View's samples as one compact, static table: name, deposit
// style, six what-it-has icons in fixed columns, what it has, size. Filter chips (each an icon; several narrow) and a search box sit above it; the tab's own first pick
// (#1120) is selected, and ONE gold button below opens the selected sample ("Download and open ..." for a BC sample not on this computer, #3100 / #3133: the flow is
// unchanged, onLoad is loadSample). A plain table, no list library: every sample is a real row (a row is selectable by click or arrow keys, double-click / Enter opens).
// The data is lib/sampleCards.js's SAMPLE_CONTENTS, pinned against the sample folders by test/sampleContents4094.test.mjs.
import React, { useMemo, useRef, useState } from "react";
import { t as tr } from "../../lib/i18n.js";
import { SAMPLE_ICONS, sampleSource, filterSampleRows } from "../../lib/sampleCards.js";

const PATHS = {
  holes: <path d="M3 1.5v11M7 1.5v11M11 1.5v11" />,
  assays: <path d="M5 1.5h4M6 1.5v4L2.6 11.6a1 1 0 0 0 .9 1.4h7a1 1 0 0 0 .9-1.4L8 5.5v-4" />,
  geophysics: <path d="M1 7c1.4-5 3-5 4.4 0s3 5 4.4 0 2-3 3.2-1" />,
  mapping: <path d="M1 3l4-1.7 4 1.7 4-1.7v9.7l-4 1.7-4-1.7-4 1.7z" />,
  surface: <g fill="currentColor" stroke="none"><circle cx="3" cy="4" r="1.6" /><circle cx="8" cy="3" r="1.6" /><circle cx="11" cy="8" r="1.6" /><circle cx="5" cy="10" r="1.6" /></g>,
  terrain: <path d="M1 12l4-7 3 4 2-3 3 6z" />,
};
const COLOUR = { holes: "var(--color-info)", assays: "var(--color-warn-text)", geophysics: "var(--color-accent-dark)", mapping: "var(--color-success-fg)", surface: "var(--color-danger-fg)", terrain: "var(--color-text-muted)" };
// a name for each icon: the chip, the column heading and the tooltip / accessible name of every icon
const labels = () => ({ holes: tr("Holes"), assays: tr("Assays"), geophysics: tr("Geophysics"), mapping: tr("Mapping"), surface: tr("Surface geochem"), terrain: tr("Terrain") });

function Icon({ k, label, dashed = false, size = 14, decorative = false }) { // decorative: a chip already says its name in text, the icon is not read twice
  return (
    <svg role={decorative ? undefined : "img"} aria-label={decorative ? undefined : label} aria-hidden={decorative || undefined} width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashed ? "2 2" : undefined} style={{ color: COLOUR[k], flexShrink: 0, verticalAlign: "middle" }}>
      {!decorative && <title>{label}</title>}
      {PATHS[k]}
    </svg>
  );
}

const th = { textAlign: "start", fontWeight: 500, fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", padding: "3px 6px", borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, background: "var(--color-bg)", whiteSpace: "nowrap" };
const td = { padding: "4px 6px", borderBottom: "1px solid var(--color-border-light)", fontSize: "var(--font-size-sm)" };

export default function SampleList({ rows = [], first = null, onLoad, loading = false }) {
  const L = labels();
  const [sel, setSel] = useState(first);
  const [on, setOn] = useState(() => new Set());
  const [q, setQ] = useState("");
  const rowRefs = useRef({});
  const shown = useMemo(() => filterSampleRows(rows, on, q), [rows, on, q]);
  const cur = shown.find((r) => r.id === sel) || shown[0] || null; // a filter that hides the selected row moves the selection to the first row left
  const toggle = (k) => setOn((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const move = (i, d) => { const r = shown[Math.max(0, Math.min(shown.length - 1, i + d))]; if (r) { setSel(r.id); rowRefs.current[r.id]?.focus(); } };
  const open = (r) => { if (r && !loading) onLoad(r.id); };
  const onKey = (e, r, i) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(i, 1); } else if (e.key === "ArrowUp") { e.preventDefault(); move(i, -1); }
    else if (e.key === "Home") { e.preventDefault(); move(i, -shown.length); } else if (e.key === "End") { e.preventDefault(); move(i, shown.length); }
    else if (e.key === "Enter") { e.preventDefault(); open(r); }
  };
  const size = (r) => (r.download != null ? <span style={{ fontSize: "var(--font-size-xs)", padding: "0 5px", borderRadius: 8, background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", color: "var(--color-warn-text)" }}>{tr("Download {n} MB", { n: r.download })}</span> : r.mb != null ? tr("{n} MB", { n: r.mb }) : "");
  const cta = !cur ? tr("Open a sample") : cur.download != null ? tr("Download and open {name} ({n} MB)", { name: cur.name, n: cur.download }) : tr("Open {name}", { name: cur.name });
  return (
    <div data-sample-list="" style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 100%", minHeight: 0, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {SAMPLE_ICONS.map((k) => (
          <button key={k} type="button" data-btn-own="" aria-pressed={on.has(k)} onClick={() => toggle(k)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: on.has(k) ? "3px 9px" : "4px 10px", borderRadius: 14, cursor: "pointer", fontSize: "var(--font-size-sm)", fontFamily: "inherit", background: on.has(k) ? "var(--color-bg-subtle)" : "var(--color-bg)", color: on.has(k) ? "var(--color-text)" : "var(--color-text-secondary)", fontWeight: on.has(k) ? 600 : 400, border: on.has(k) ? "2px solid var(--btn-primary-border)" : "1px solid var(--color-border)" }}>
            <Icon k={k} label={L[k]} decorative />{L[k]}
          </button>
        ))}
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search…")} aria-label={tr("Search")} style={{ marginInlineStart: "auto", width: 150, padding: "4px 8px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-sm)", fontFamily: "inherit", background: "var(--color-bg)", color: "var(--color-text)" }} />
      </div>
      <div style={{ overflow: "auto", minHeight: 96, flex: "1 1 auto", border: "1px solid var(--color-border-light)", borderRadius: 6 }}>
        <table role="grid" aria-label={tr("Samples")} style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>{tr("Sample")}</th><th style={th}>{tr("Deposit style")}</th>
              {SAMPLE_ICONS.map((k) => <th key={k} style={{ ...th, textAlign: "center", padding: "3px 4px" }} title={L[k]}><Icon k={k} label={L[k]} /></th>)}
              <th style={th}>{tr("What it has")}</th><th style={th}>{tr("Size")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const isSel = r.id === cur?.id;
              return (
                <tr key={r.id} ref={(el) => { rowRefs.current[r.id] = el; }} role="row" aria-selected={isSel} tabIndex={isSel ? 0 : -1} data-sample-id={r.id} title={r.title}
                  onClick={() => setSel(r.id)} onDoubleClick={() => open(r)} onKeyDown={(e) => onKey(e, r, i)}
                  style={{ cursor: loading ? "default" : "pointer", background: isSel ? "var(--color-selected-bg)" : undefined, outline: "none", opacity: loading ? 0.6 : 1 }}>
                  <td style={{ ...td, fontWeight: 600, color: "var(--color-text)", boxShadow: isSel ? "inset 3px 0 0 var(--btn-primary-border)" : undefined }}><bdi>{r.name}</bdi></td>
                  <td style={td}>{r.style}</td>
                  {SAMPLE_ICONS.map((k) => <td key={k} style={{ ...td, textAlign: "center", padding: "4px" }}>{r.has[k] ? <Icon k={k} label={L[k]} dashed={!!r.has[k].traces} /> : <span aria-hidden="true" style={{ color: "var(--color-border)" }}>·</span>}</td>)}
                  <td style={{ ...td, color: "var(--color-text-secondary)" }}><bdi>{r.facts}</bdi></td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{size(r)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && <div role="status" style={{ padding: 10, fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("No sample has all of those.")}</div>}
      </div>
      {cur && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, maxHeight: 66, overflow: "auto" }}>{sampleSource(cur.id)}</div>}{/* where its data is from and its licence / credit stay with the selected sample */}
      <button type="button" className="gs-btn gs-btn--primary" data-sample-open="" disabled={!cur || loading} onClick={() => open(cur)} style={{ justifyContent: "center", padding: "8px 14px", flex: "none" }}>{cta}</button>
    </div>
  );
}
