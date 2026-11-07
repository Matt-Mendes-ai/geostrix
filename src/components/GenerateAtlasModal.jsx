import React, { useMemo, useState } from "react";
import { X, LayoutGrid, Loader2 } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, panel, header, label as labelStyle, sel, btn } from "../lib/modalStyles.js";
import { generateAtlasPages, HOLE_TOKENS, SECTION_TOKENS } from "../lib/atlas.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

// TASKS.csv #130 — QGIS-Atlas-style batch page generation from the CURRENTLY ACTIVE page as a
// template: every text/title element's {{token}} placeholders get filled in per hole/section, and one
// new Layout page is created per item. See src/lib/atlas.js's own header comment for the deliberate
// scope boundary (no per-item 3D viewport re-render — text + an optional per-hole strip-log image).
export default function GenerateAtlasModal({ onClose, templateElements, collars, layers, legendOverride = null, sections, addLayoutPages, page = null, assays = [], assayElements = [] }) { // legendOverride: #1092; page: #1478; assays: #1480
  useEscapeKey(onClose);
  useFocusTrap(); // TASKS.csv #238
  const [mode, setMode] = useState("hole"); // "hole" | "section"
  // TASKS.csv #1644 — a large project opens with nothing ticked (446 holes opened as 'Generate 446 pages')
  const [selectedIds, setSelectedIds] = useState(() => new Set(collars.length > 50 ? [] : collars.map((c) => c.hole_id)));
  const [includeStripLog, setIncludeStripLog] = useState(true);
  const [assaySymbols, setAssaySymbols] = useState(["", "", ""]); // TASKS.csv #1480 — up to three assay tracks
  const assayTracks = useMemo(() => { const syms = assaySymbols.filter(Boolean).filter((s, i, a) => a.indexOf(s) === i); return syms.length ? { assays, assaySymbols: syms, elementUnits: Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])) } : null; }, [assaySymbols, assays, assayElements]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // {done, total}
  const [result, setResult] = useState(null);

  const holeIds = useMemo(() => collars.map((c) => c.hole_id), [collars]);
  const items = mode === "hole" ? holeIds : sections;
  const itemKey = (item) => (mode === "hole" ? item : item.id);
  const itemLabel = (item) => (mode === "hole" ? item : item.name);

  // Switching mode resets the selection to "everything" for the new mode — a stale hole-mode
  // selection wouldn't even make sense once switched to sections.
  const switchMode = (m) => {
    setMode(m);
    const all = m === "hole" ? holeIds : sections.map((s) => s.id);
    setSelectedIds(new Set(all.length > 50 ? [] : all)); // #1644
    setResult(null);
  };

  const toggle = (key) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const selectedCount = selectedIds.size;

  const hasPlaceholders = templateElements.some((el) => typeof el.text === "string" && /\{\{\w+\}\}/.test(el.text));

  const generate = async () => {
    const chosen = items.filter((it) => selectedIds.has(itemKey(it)));
    if (!chosen.length) return;
    setBusy(true); setResult(null);
    setProgress(mode === "hole" ? { done: 0, total: chosen.length } : null);
    try {
      // Per-hole strip-log generation is genuinely sequential (one canvas rasterize at a time is
      // simplest and fast enough here — dozens of holes, not thousands), so a real progress readout
      // is worth it; section pages are pure synchronous text substitution with nothing to await.
      const pages = mode === "hole" && includeStripLog
        ? await (async () => {
            const out = [];
            for (let i = 0; i < chosen.length; i++) {
              const [pg] = await generateAtlasPages({ mode, items: [chosen[i]], templateElements, collars, layers, includeStripLog, legendOverride, page, assayTracks });
              out.push(pg);
              setProgress({ done: i + 1, total: chosen.length });
            }
            return out;
          })()
        : await generateAtlasPages({ mode, items: chosen, templateElements, collars, layers, includeStripLog, legendOverride, page });
      // #1478 — a long hole squeezed onto one page prints its depth labels too small to read: said, with the size
      const smallest = Math.min(...pages.map((pg) => pg.textPt).filter(Number.isFinite));
      const smallText = Number.isFinite(smallest) && smallest < 6 ? ` ${tr("The longest strip log prints its labels at about {pt} pt on this page: use a larger page, or the strip log window for a full-size log.", { pt: smallest.toFixed(1) })}` : "";
      const batch = `atlas_${Date.now()}`; // TASKS.csv #1636 — removable as one batch
      addLayoutPages(pages.map((pg) => ({ ...pg, batch })));
      const failed = pages.filter((pg) => pg.stripLogFailed).map((pg) => pg.name); // #1080
      // #1772 — what making room for the strip log did to the template's elements
      const narrowedPages = pages.filter((pg) => pg.narrowed > 0).length, coveredPages = pages.filter((pg) => pg.overlapping > 0).length;
      const room = (narrowedPages ? ` ${tr("To make room for the strip log, the template's elements beside it were narrowed on {n} page(s); a map keeps its scale and shows less ground.", { n: narrowedPages })}` : "")
        + (coveredPages ? ` ${tr("On {n} page(s) the strip log still covers part of the template: move it, or leave a free column at the side of the template.", { n: coveredPages })}` : "");
      setResult({ ok: !failed.length, text: tr("Generated {n} page(s).", { n: pages.length }) + smallText + room + (failed.length ? ` ${tr("The strip log could not be drawn for {n} hole(s), added without it: {holes}.", { n: failed.length, holes: failed.slice(0, 8).join(", ") + (failed.length > 8 ? "…" : "") })}` : "") });
    } catch (err) {
      setResult({ ok: false, text: err.message });
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  const tokens = mode === "hole" ? HOLE_TOKENS : SECTION_TOKENS;

  return (
    <div style={overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={panel({ width: 480, maxHeight: "85vh" })} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-lg)", fontWeight: 600 }}><LayoutGrid size={14} />{" "}{tr("Generate atlas")}</div>
          <button onClick={onClose} title={tr("Close")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.75, lineHeight: 1.4 }}>{tr("Creates one new Layout page per item below, using the CURRENT page as a template. Any {v} in a text/title element gets filled in per item — available tokens for this mode: {v2}.", { v: tr("{{token}}"), v2: tokens.map((t) => `{{${t}}}`).join(", ") })}</div>
          {!hasPlaceholders && (
            <div style={{ fontSize: "var(--font-size-sm)", color: "#a95a3a" }}>{tr("The current page has no {v} placeholders in any text — every generated page will look identical except its name{v2}. Add a text element with e.g. {v3} first if you want per-item text.", { v: tr("{{token}}"), v2: mode === "hole" && includeStripLog ? tr(" (and its strip log image)") : "", v3: tr("{{hole_id}}") })}</div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <select value={mode} onChange={(e) => switchMode(e.target.value)} style={{ ...sel, flex: 1 }}>
              <option value="hole">{tr("One page per drillhole ({holeIds})", { holeIds: holeIds.length })}</option>
              <option value="section">{tr("One page per section ({sections})", { sections: sections.length })}</option>
            </select>
          </div>
          {mode === "hole" && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)" }}>
              <input type="checkbox" checked={includeStripLog} onChange={(e) => setIncludeStripLog(e.target.checked)} />{tr("Add a strip log image (litho/alteration/vein/RQD%) to each page")}</label>
          )}
          {mode === "hole" && includeStripLog && assayElements.length > 0 && ( /* TASKS.csv #1480 — assay tracks on the strip log */
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", flexWrap: "wrap" }}>
              <span>{tr("Assay tracks")}</span>
              {[0, 1, 2].map((k) => (
                <select key={k} value={assaySymbols[k]} aria-label={tr("Assay track {n}", { n: k + 1 })} onChange={(e) => setAssaySymbols((p) => p.map((s, j) => (j === k ? e.target.value : s)))} style={{ ...sel, flex: 1, minWidth: 80 }}>
                  <option value="">{tr("none")}</option>
                  {assayElements.map((e) => <option key={e.symbol} value={e.symbol}>{e.unit ? `${e.symbol} (${e.unit})` : e.symbol}</option>)}
                </select>
              ))}
            </div>
          )}
          <div>
            <div style={{ ...labelStyle, display: "flex", justifyContent: "space-between" }}>
              <span>{tr("{selectedCount} of {items} selected", { selectedCount, items: items.length })}</span>
              <span style={{ display: "flex", gap: 8 }}>
                <span role="button" tabIndex={0} onKeyDown={activateOnKey} style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setSelectedIds(new Set(items.map(itemKey)))}>{tr("All")}</span>
                <span role="button" tabIndex={0} onKeyDown={activateOnKey} style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setSelectedIds(new Set())}>{tr("None")}</span>
              </span>
            </div>
            <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #2a323c", borderRadius: 6, padding: 6 }}>
              {items.length === 0 && <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.6, padding: 6 }}>{mode === "hole" ? tr("No collars loaded.") : tr("No sections drawn yet.")}</div>}
              {items.map((it) => {
                const key = itemKey(it);
                return (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", padding: "3px 4px", cursor: "pointer" }}>
                    <input type="checkbox" checked={selectedIds.has(key)} onChange={() => toggle(key)} />
                    {itemLabel(it)}
                  </label>
                );
              })}
            </div>
          </div>
          {result && <div style={{ fontSize: "var(--font-size-base)", color: result.ok ? "#2f8f5b" : "var(--color-danger-solid)" }}>{result.text}</div>}
          <button onClick={generate} disabled={busy || !selectedCount} style={{ ...btn(true), display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: busy || !selectedCount ? 0.6 : 1 }}>
            {busy ? <Loader2 size={14} className="spin" /> : <LayoutGrid size={14} />}
            {busy ? (progress ? tr("Generating {done}/{total}…", { done: progress.done, total: progress.total }) : tr("Generating…")) : tr(selectedCount === 1 ? "Generate {selectedCount} page" : "Generate {selectedCount} pages", { selectedCount })}
          </button>
        </div>
      </div>
    </div>
  );
}
