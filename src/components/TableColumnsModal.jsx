// TASKS.csv #2177 (Matt's decision 2026-11-09) — a table too large for this computer's memory: choose its columns before it is read, so
// every value kept stays exact (nothing composited or thinned). The estimate follows the ticks; 'Open anyway' keeps #2171's way out.
import React, { useMemo, useState } from "react";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { subsetBytes, holesShare, compositeShare } from "../lib/tableSubsetRequest.js"; // holesShare: TASKS.csv #2321; compositeShare: #2345
import { FROM_COL, TO_COL } from "../lib/compositeOnRead.js"; // TASKS.csv #2345
import { useStore } from "../lib/store.jsx"; // TASKS.csv #2321 — the project's holes
import { t as tr } from "../lib/i18n.js";

const HOLE_COL = /^(hole|holeid|hole_id|hole_no|hole_name|bhid|dhid|ddh|site_?id)$/i; // TASKS.csv #2321
// the columns most imports need, ticked first: ids, depths, coordinates (by name; the user changes them)
const CORE = /^(hole|holeid|hole_id|bhid|dhid|site_?id|sample|sample_?id|sampleid|samp_?no|from|to|depth_?from|depth_?to|m_?from|m_?to|geolfrom|geolto|sampfrom|sampto|depth|x|y|z|east(ing)?|north(ing)?|rl|elev(ation)?)$/i;

export default function TableColumnsModal({ name, preview, budget, onDone }) {
  const [keep, setKeep] = useState(() => new Set(preview.headers.filter((h) => CORE.test(h.replace(/\s+/g, "_")))));
  const [q, setQ] = useState("");
  const cancel = () => onDone(false);
  useEscapeKey(cancel);
  useFocusTrap();
  // TASKS.csv #2321 (Matt's decision 2026-11-09: subset first) — only the rows of the project's holes, or of the checked holes
  const { collars = [], viewerUiState } = useStore();
  const visibleHoles = viewerUiState?.visibleHoles && !Array.isArray(viewerUiState.visibleHoles) ? viewerUiState.visibleHoles : {}; // the 3D View's hole ticks, mirrored
  const projectIds = useMemo(() => [...new Set(collars.map((c) => String(c.hole_id).trim()).filter(Boolean))], [collars]);
  const checkedIds = useMemo(() => projectIds.filter((h) => visibleHoles[h] !== false), [projectIds, visibleHoles]);
  const [rowsBy, setRowsBy] = useState("all"); // "all" | "project" | "checked"
  const [holeCol, setHoleCol] = useState(() => preview.headers.find((h) => HOLE_COL.test(h.replace(/\s+/g, "_"))) || "");
  const ids = rowsBy === "project" ? projectIds : rowsBy === "checked" ? checkedIds : null;
  const share = ids && holeCol ? holesShare(preview, holeCol, ids) : null; // { share, seen, kept } from the first rows
  // TASKS.csv #2345 — composite on read: only when ticked and a length typed (never by default); its From / To guessed from the names
  const [comp, setComp] = useState(() => ({ on: false, lengthM: "", from: preview.headers.find((h) => FROM_COL.test(h.replace(/\s+/g, "_"))) || "", to: preview.headers.find((h) => TO_COL.test(h.replace(/\s+/g, "_"))) || "" }));
  const compOk = !comp.on || (Number(comp.lengthM) > 0 && comp.from && comp.to && holeCol && comp.from !== comp.to);
  const cShare = comp.on && compOk ? compositeShare(preview, comp.from, comp.to, comp.lengthM) : null;
  const rowShare = (share?.kept ? share.share : 1) * (cShare ? cShare.share : 1);
  const bytes = subsetBytes(preview, keep.size, rowShare), fits = bytes <= budget, gb = (v) => (v / 1e9).toFixed(1);
  const shown = useMemo(() => preview.headers.filter((h) => !q || h.toLowerCase().includes(q.toLowerCase())), [preview.headers, q]);
  const toggle = (h) => setKeep((s) => { const n = new Set(s); if (n.has(h)) n.delete(h); else n.add(h); return n; });
  // how many more columns fit, at this table's rows
  const room = Math.max(0, Math.floor((budget - preview.fixed) / Math.max(1, preview.perColumn * rowShare))); // share: #2321; composite: #2345
  return (
    <div style={overlay}>
      <div role="dialog" aria-modal="true" aria-label={tr("Choose the columns to read")} onClick={(e) => e.stopPropagation()} style={panel}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-accent-dark)" }}>{tr("Choose the columns to read")}</div>
          <div style={{ ...note, marginTop: 4 }}>{tr("{name} is a very large table: about {rows} rows × {cols} columns, roughly {gb} GB of memory to open whole. Tick the columns you need: only those are read, every value exact.", { name, rows: preview.rows.toLocaleString(), cols: preview.cols, gb: gb(preview.bytes) })}</div>
        </div>
        <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8, overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Filter columns")} aria-label={tr("Filter columns")} style={inp} />
            <button type="button" style={mini} onClick={() => setKeep((s) => new Set([...s, ...shown]))}>{tr("Tick shown")}</button>
            <button type="button" style={mini} onClick={() => setKeep((s) => { const n = new Set(s); shown.forEach((h) => n.delete(h)); return n; })}>{tr("Untick shown")}</button>
          </div>
          <div role="group" aria-label={tr("Columns")} style={{ overflowY: "auto", maxHeight: 300, border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 8px", columns: 2 }}>
            {shown.map((h) => (
              <label key={h} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: "var(--font-size-sm)", padding: "2px 0", breakInside: "avoid" }}>
                <input type="checkbox" checked={keep.has(h)} onChange={() => toggle(h)} />{h}
              </label>
            ))}
          </div>
          {projectIds.length > 0 && ( // #2321
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: "var(--font-size-sm)" }}>
              <label style={{ display: "flex", gap: 5, alignItems: "center" }}>{tr("Rows:")}
                <select value={rowsBy} onChange={(e) => setRowsBy(e.target.value)} aria-label={tr("Rows to read")} style={inp}>
                  <option value="all">{tr("every hole in the file")}</option>
                  <option value="project">{tr("only the {n} holes in this project", { n: projectIds.length })}</option>
                  {checkedIds.length < projectIds.length && checkedIds.length > 0 && <option value="checked">{tr("only the {n} checked holes", { n: checkedIds.length })}</option>}
                </select>
              </label>
              {rowsBy !== "all" && <label style={{ display: "flex", gap: 5, alignItems: "center" }}>{tr("Hole id column")}
                <select value={holeCol} onChange={(e) => setHoleCol(e.target.value)} aria-label={tr("Hole id column")} style={inp}>
                  <option value="">{tr("— pick a column —")}</option>
                  {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>}
              {rowsBy !== "all" && holeCol && share && <span style={note}>{share.kept
                ? tr("In the first {s} rows, {pct}% are for these holes: the estimate below assumes the same share through the file (rough).", { s: share.seen.toLocaleString(), pct: Math.max(1, Math.round(share.share * 100)) })
                : tr("None of the first {s} rows are for these holes, so the share can't be estimated (a file sorted by hole may have them further down): the estimate below is for every row.", { s: share.seen.toLocaleString() })}</span>}
            </div>
          )}
          {/* TASKS.csv #2345 — composite as read: off by default, the length typed */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: "var(--font-size-sm)" }}>
            <label style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <input type="checkbox" checked={comp.on} onChange={(e) => setComp((c) => ({ ...c, on: e.target.checked }))} />{tr("Composite to")}
              <input type="number" min={0.1} step={0.5} value={comp.lengthM} disabled={!comp.on} placeholder={tr("length")} onChange={(e) => setComp((c) => ({ ...c, lengthM: e.target.value }))} aria-label={tr("Composite length (m)")} style={{ ...inp, flex: "none", width: 70 }} />{tr("m as it is read (length-weighted)")}
            </label>
            {comp.on && <>
              <label style={{ display: "flex", gap: 5, alignItems: "center" }}>{tr("From")}<select value={comp.from} onChange={(e) => setComp((c) => ({ ...c, from: e.target.value }))} aria-label={tr("Composite From column")} style={inp}><option value="">{tr("— pick a column —")}</option>{preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
              <label style={{ display: "flex", gap: 5, alignItems: "center" }}>{tr("To")}<select value={comp.to} onChange={(e) => setComp((c) => ({ ...c, to: e.target.value }))} aria-label={tr("Composite To column")} style={inp}><option value="">{tr("— pick a column —")}</option>{preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
              {rowsBy === "all" && <label style={{ display: "flex", gap: 5, alignItems: "center" }}>{tr("Hole id column")}<select value={holeCol} onChange={(e) => setHoleCol(e.target.value)} aria-label={tr("Composite hole id column")} style={inp}><option value="">{tr("— pick a column —")}</option>{preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>}
            </>}
          </div>
          {comp.on && <div style={note}>{cShare?.meanM
            ? tr("Each hole's intervals become composites of this length: numbers as length-weighted means, text as the value over most of the length; the raw rows are not kept. The first rows' intervals average {m} m, so about {pct}% as many rows are held.", { m: cShare.meanM.toFixed(2), pct: Math.max(1, Math.round(cShare.share * 100)) })
            : tr("Each hole's intervals become composites of this length: numbers as length-weighted means, text as the value over most of the length; the raw rows are not kept. Pick the From, To and hole id columns and type the length.")}</div>}
          <div role="status" style={{ ...note, color: fits ? "var(--color-text-secondary)" : "var(--color-warn-text-strong)" }}>
            {fits
              ? tr("{k} of {n} columns: about {gb} GB. Fits (up to about {room} columns at this many rows).", { k: keep.size, n: preview.cols, gb: gb(bytes), room })
              : tr("{k} of {n} columns: about {gb} GB, more than this computer can safely give (about {room} columns fit).", { k: keep.size, n: preview.cols, gb: gb(bytes), room })}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button type="button" style={btn(false)} onClick={cancel}>{tr("Don't open it")}</button>
          <button type="button" style={btn(false)} onClick={() => onDone(true)} title={tr("Every column: this can close GeoStrix on this computer.")}>{tr("Open it whole anyway")}</button>
          <button type="button" style={btn(true)} disabled={!keep.size || !fits || (rowsBy !== "all" && !holeCol) || !compOk} onClick={() => onDone({ keep: preview.headers.filter((h) => keep.has(h)), ...(ids && holeCol ? { holes: { col: holeCol, ids, label: rowsBy === "checked" ? tr("the checked holes") : tr("the holes in this project") } } : {}), ...(comp.on && compOk ? { composite: { hole: holeCol, from: comp.from, to: comp.to, lengthM: Number(comp.lengthM) } } : {}) /* #2345 */ })}>{tr("Read the {k} column(s)", { k: keep.size })}</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(640px, 96vw)", maxHeight: "90vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const inp = { flex: 1, minWidth: 0, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 7px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const mini = { padding: "4px 8px", borderRadius: 5, border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)", color: "var(--color-text)", fontSize: "var(--font-size-sm)", cursor: "pointer", fontFamily: "inherit" };
const btn = (primary) => ({ padding: "7px 14px", borderRadius: 6, fontSize: "var(--font-size-base)", fontFamily: "inherit", cursor: "pointer", border: primary ? "1px solid var(--color-accent)" : "1px solid var(--color-border)", background: primary ? "var(--color-accent)" : "var(--color-bg)", color: primary ? "var(--color-bg)" : "var(--color-text)" });
