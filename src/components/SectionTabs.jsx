// TASKS.csv #1303 — one window holds the open sections as tabs: each pop-out was a whole renderer loading the app (134-191 MB), so 26 fence sections could
// exhaust an 8 GB laptop. Every tab stays mounted, hidden, so a half-drawn line survives switching. "Own window" (SectionWindow) still pops one out to
// compare two side by side. Pure routing: the main process owns which section is in which window.
import React, { useEffect, useState } from "react";
import SectionWindow from "./SectionWindow.jsx";
import { getSectionData, onSectionData, closeSectionTab, popOutSectionTab } from "../lib/desktop.js";
import { t as tr } from "../lib/i18n.js";

const barBtn = { border: "none", background: "transparent", cursor: "pointer", font: "inherit", color: "inherit", padding: 0 };

export default function SectionTabs() {
  const [tabs, setTabs] = useState([]); // [{ id, title, initial }]
  const [active, setActive] = useState(null);
  useEffect(() => {
    const take = (d) => {
      if (!d?.id) return;
      setTabs((T) => (T.some((t) => t.id === d.id) ? T.map((t) => (t.id === d.id ? { ...t, title: d.title || t.title } : t)) : [...T, { id: d.id, title: d.title, initial: d }]));
      if (!d.refreshOnly) setActive(d.id);
    };
    const off = onSectionData(take);
    getSectionData().then((list) => (list || []).forEach(take)).catch(() => {}); // #617 — a push can arrive before this lazy component listens
    return off;
  }, []);
  const shown = tabs.some((t) => t.id === active) ? active : tabs[0]?.id ?? null;
  const title = tabs.find((t) => t.id === shown)?.title;
  useEffect(() => { if (title) document.title = title; }, [title]);
  useEffect(() => { document.querySelector('.ge-section-tabbar [aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [shown, tabs.length]);
  const leave = (id) => {
    setTabs((T) => {
      const i = T.findIndex((t) => t.id === id), rest = T.filter((t) => t.id !== id);
      if (id === shown && rest.length) setActive(rest[Math.min(i, rest.length - 1)].id);
      return rest;
    });
  };
  const close = (id) => { leave(id); closeSectionTab(id); };
  const popOut = async (payload) => {
    const r = await popOutSectionTab(payload);
    if (r?.refused) { window.alert(tr("{max} section windows are open, the most this computer can hold comfortably. Close one first.", { max: r.max })); return; }
    leave(payload.id);
  };
  if (!tabs.length) return <SectionWindow />; // a browser tab reads its section from sessionStorage; here, "Waiting for section data…"
  return (
    <div className="ge-section-host" style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#ffffff" }}>
      {tabs.length > 1 && (
        <div className="ge-section-tabbar" role="tablist" aria-label={tr("Open sections")} style={{ display: "flex", flexShrink: 0, gap: 2, overflowX: "auto", scrollbarWidth: "thin", padding: "4px 8px 0", background: "#f4f5f7", borderBottom: "1px solid #d9dce1", fontFamily: "'Exo 2', system-ui, sans-serif", fontSize: 12, color: "#1a2028" }}>
          {tabs.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, maxWidth: 220, padding: "4px 8px", borderRadius: "5px 5px 0 0", background: t.id === shown ? "#ffffff" : "transparent", border: "1px solid #d9dce1", borderBottomColor: t.id === shown ? "#ffffff" : "#d9dce1", marginBottom: -1 }}>
              <button type="button" role="tab" aria-selected={t.id === shown} onClick={() => setActive(t.id)} title={t.title} style={{ ...barBtn, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: t.id === shown ? 600 : 400 }}>{t.title || tr("Cross-section")}</button>
              <button type="button" onClick={() => close(t.id)} aria-label={tr("Close {name}", { name: t.title || tr("Cross-section") })} title={tr("Close this section")} style={{ ...barBtn, color: "#55606e", lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      )}
      <div className="ge-section-panes" style={{ flex: 1, minHeight: 0 }}>
        {tabs.map((t) => (
          <div key={t.id} className="ge-section-pane" style={{ height: "100%", display: t.id === shown ? "block" : "none" }}>
            <SectionWindow tabId={t.id} initial={t.initial} onPopOut={tabs.length > 1 ? popOut : null} />
          </div>
        ))}
      </div>
    </div>
  );
}
