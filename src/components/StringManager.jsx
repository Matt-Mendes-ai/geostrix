// TASKS.csv #1968 — many design strings at once. Matt (Treaty Creek, the String list full of 'Stope 1697 m #11' outlines): remove
// several at once. A filter over the list, tick strings, Show / Hide / Remove the ticked ones; Remove all strings; remove the outline
// strings of one Stope outlines run. Each remove is confirmed with a count, names the solids made from those strings (they keep
// their shape), and is one undo step.
import React, { useMemo, useState } from "react";
import { pBtn, smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";
import { isStopeString } from "../lib/stopeRuns.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const btn = { ...pBtn, width: "auto", marginBottom: 0, padding: "2px 7px" };

export default function StringManager({ strings, setStrings, surfaces = [], activeId, setActiveId }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [ticked, setTicked] = useState(() => new Set());
  const [said, setSaid] = useState(null);
  const shown = useMemo(() => { const f = filter.trim().toLowerCase(); return f ? strings.filter((s) => String(s.name || "").toLowerCase().includes(f)) : strings; }, [strings, filter]);
  // the outline-string groups the Stope outlines pane sent: by run when tagged, the rest together
  const runs = useMemo(() => {
    const m = new Map();
    for (const s of strings) if (isStopeString(s)) { const k = s.stopeRun || "untagged"; (m.get(k) || m.set(k, []).get(k)).push(s.id); }
    return [...m].map(([key, ids], i) => ({ key, ids, label: key === "untagged" ? tr("Stope outlines sent earlier ({n})", { n: ids.length }) : tr("Stope outlines, run {i} ({n})", { i: i + 1, n: ids.length }) }));
  }, [strings]);
  const [run, setRun] = useState("");
  if (strings.length < 2) return null;
  const tickedIds = strings.filter((s) => ticked.has(s.id)).map((s) => s.id);
  const remove = (ids, what) => {
    if (!ids.length) return;
    const gone = new Set(ids), names = new Set(strings.filter((s) => gone.has(s.id)).map((s) => s.name));
    const solids = surfaces.filter((x) => Array.isArray(x.params?.strings) && x.params.strings.some((n) => names.has(n))).map((x) => x.name);
    const text = tr("Remove {n} string(s): {what}?", { n: ids.length, what }) + (solids.length ? " " + tr("Solids made from them keep their shape: {list}.", { list: solids.slice(0, 5).join(", ") + (solids.length > 5 ? ` (+${solids.length - 5})` : "") }) : "");
    if (!window.confirm(text)) return;
    setStrings((L) => L.filter((s) => !gone.has(s.id)));
    if (gone.has(activeId)) setActiveId(strings.find((s) => !gone.has(s.id))?.id ?? null);
    setTicked((t) => new Set([...t].filter((id) => !gone.has(id))));
    setSaid(tr("{n} string(s) removed: Undo (Ctrl+Z) brings them back.", { n: ids.length }));
  };
  const setVisible = (ids, v) => { const k = new Set(ids); setStrings((L) => L.map((s) => (k.has(s.id) ? { ...s, visible: v } : s))); };
  const toggle = (id) => setTicked((t) => { const n = new Set(t); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div style={{ marginTop: 8, border: "1px solid var(--color-border)", borderRadius: 6, padding: "5px 7px" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text)" }}>
        {open ? "▾" : "▸"} {tr("Manage all strings ({n})", { n: strings.length })}
      </button>
      {open && (
        <div style={{ marginTop: 5 }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button type="button" onClick={() => remove(strings.map((s) => s.id), tr("every string in the project"))} style={btn}>{tr("Remove all strings ({n})", { n: strings.length })}</button>
            {runs.length > 0 && (
              <>
                <select value={run} onChange={(e) => setRun(e.target.value)} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Stope outline strings to remove")}>
                  <option value="">{tr("Stope outline strings…")}</option>
                  {runs.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
                <button type="button" disabled={!run} onClick={() => { const r = runs.find((x) => x.key === run); if (r) remove(r.ids, r.label); setRun(""); }} style={{ ...btn, opacity: run ? 1 : 0.5 }}>{tr("Remove these")}</button>
              </>
            )}
          </div>
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tr("Filter by name…")} aria-label={tr("Filter the strings by name")} style={{ ...smallSel, width: "100%", marginTop: 6, boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" onClick={() => setTicked(new Set(shown.map((s) => s.id)))} style={btn}>{tr("Tick the {n} listed", { n: shown.length })}</button>
            <button type="button" onClick={() => setTicked(new Set())} disabled={!tickedIds.length} style={{ ...btn, opacity: tickedIds.length ? 1 : 0.5 }}>{tr("Untick all")}</button>
            <span style={note}>{tr("{n} ticked", { n: tickedIds.length })}</span>
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 4, marginTop: 4 }}>
            {shown.map((s) => (
              <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "1px 5px", fontSize: "var(--font-size-xs)", color: s.visible === false ? "var(--color-text-faint)" : "var(--color-text-secondary)", cursor: "pointer" }}>
                <input type="checkbox" checked={ticked.has(s.id)} onChange={() => toggle(s.id)} />
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color || "#888", flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}{s.visible === false ? ` (${tr("hidden")})` : ""}</span>
              </label>
            ))}
            {!shown.length && <div style={{ ...note, padding: 4 }}>{tr("No string matches.")}</div>}
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            <button type="button" disabled={!tickedIds.length} onClick={() => setVisible(tickedIds, true)} style={{ ...btn, flex: 1, opacity: tickedIds.length ? 1 : 0.5 }}>{tr("Show ticked")}</button>
            <button type="button" disabled={!tickedIds.length} onClick={() => setVisible(tickedIds, false)} style={{ ...btn, flex: 1, opacity: tickedIds.length ? 1 : 0.5 }}>{tr("Hide ticked")}</button>
            <button type="button" disabled={!tickedIds.length} onClick={() => remove(tickedIds, tr("the ticked strings"))} style={{ ...btn, flex: 1, opacity: tickedIds.length ? 1 : 0.5 }}>{tr("Remove ticked")}</button>
          </div>
          {said && <div role="status" style={{ ...note, marginTop: 4 }}>{said}</div>}
        </div>
      )}
    </div>
  );
}
