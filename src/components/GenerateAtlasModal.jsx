import React, { useMemo, useState } from "react";
import { isNumericLayer } from "../lib/domainLayers.js"; // TASKS.csv #2477
import { collarAttrChoices, collarsMatching, pickTerm } from "../lib/holeFilter.js"; // TASKS.csv #2607; pickTerm: #2960
import { assayTrackRange } from "../lib/striplogSvg.js"; // TASKS.csv #2605
import { X, LayoutGrid, Loader2 } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, panel, header, label as labelStyle, sel, btn } from "../lib/modalStyles.js";
import { generateAtlasPages, HOLE_TOKENS, SECTION_TOKENS, atlasRecaptureItems, hasAtlasTokens, tracedCollar, isStripLogImage } from "../lib/atlas.js"; // hasAtlasTokens: #1777; tracedCollar / isStripLogImage: #2136
import { useStore } from "../lib/store.jsx"; // TASKS.csv #1644
import { utmGridReady } from "../lib/layoutGeometry.js"; // TASKS.csv #1644
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

// TASKS.csv #130 — QGIS-Atlas-style batch page generation from the CURRENTLY ACTIVE page as a
// template: every text/title element's {{token}} placeholders get filled in per hole/section, and one
// new Layout page is created per item, with an optional per-hole strip-log image; a top-down map is then
// re-captured centred on each page's hole (TASKS.csv #1644, see src/lib/atlas.js's header).
export default function GenerateAtlasModal({ onClose, templateElements, collars, layers, legendOverride = null, sections, addLayoutPages, page = null, assays = [], assayElements = [] }) { // legendOverride: #1092; page: #1478; assays: #1480
  useEscapeKey(onClose);
  useFocusTrap(); // TASKS.csv #238
  const [mode, setMode] = useState("hole"); // "hole" | "section"
  // TASKS.csv #1644 — a large project opens with nothing ticked (446 holes opened as 'Generate 446 pages')
  const [selectedIds, setSelectedIds] = useState(() => { const t = collars.filter(tracedCollar); return new Set(t.length > 50 ? [] : t.map((c) => c.hole_id)); }); // traced: #2136
  const [includeStripLog, setIncludeStripLog] = useState(true);
  // TASKS.csv #1644 — each page's top-down map re-captured on its hole, at the template's scale (one 3D render per page)
  const { requestViewportBatch, customLayers = [] } = useStore(); // customLayers: #2477
  const hasPlanMap = templateElements.some((el) => el.type === "viewport" && utmGridReady(el));
  const [centreMaps, setCentreMaps] = useState(true);
  const [lithoPatterns, setLithoPatterns] = useState(true); // TASKS.csv #1995
  const [assaySymbols, setAssaySymbols] = useState(["", "", ""]); // TASKS.csv #1480 — up to three assay tracks
  // TASKS.csv #2477 — up to two custom-layer tracks (a stratigraphic unit, a gamma log), as the strip-log window's '+ track' offers them
  const customChoices = useMemo(() => customLayers.filter((l) => (l.rows || []).some((r) => r.value != null && r.value !== "" && Number.isFinite(Number(r.from)))).map((l) => ({ id: String(l.id), layer: l, numeric: isNumericLayer(l.rows) })), [customLayers]);
  const [customSel, setCustomSel] = useState(["", ""]);
  const customTracks = useMemo(() => customSel.filter(Boolean).filter((s, i, a) => a.indexOf(s) === i).map((id) => customChoices.find((c) => c.id === id)).filter(Boolean).map((c) => { if (!c.numeric) return c; const rows = mode === "hole" && selectedIds.size ? c.layer.rows.filter((r) => selectedIds.has(r.hole_id)) : c.layer.rows; let max = 0; for (const r of rows) { const v = Number(r.value); if (Number.isFinite(v) && v > max) max = v; } return { ...c, max }; }), [customSel, customChoices, mode, selectedIds]);
  const assayTracks = useMemo(() => { const syms = assaySymbols.filter(Boolean).filter((s, i, a) => a.indexOf(s) === i); if (!syms.length) return customTracks.length ? { assays, assaySymbols: [], elementUnits: {}, customTracks } : null; const elementUnits = Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])); const rows = mode === "hole" && selectedIds.size ? assays.filter((a) => selectedIds.has(a.hole_id)) : assays; /* #2605 — one axis per element over the atlas's holes */ return { assays, assaySymbols: syms, elementUnits, customTracks, assayRanges: Object.fromEntries(syms.map((s) => [s, assayTrackRange(rows, s, elementUnits[s] || "ppm", elementUnits)]).filter(([, r]) => r)) }; }, [assaySymbols, assays, assayElements, mode, selectedIds, customTracks]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // {done, total}
  const [result, setResult] = useState(null);

  // TASKS.csv #2136 — the holes with a trace (a depth); the 534 district collars with none are left out of the list and counted
  const tracedCollars = useMemo(() => collars.filter(tracedCollar), [collars]);
  const untraced = collars.length - tracedCollars.length;
  const holeIds = useMemo(() => tracedCollars.map((c) => c.hole_id), [tracedCollars]);
  // TASKS.csv #2607 (review #2486) — 2,248 unfiltered checkboxes (the 39 diamond holes from row 749): a text / collar-field filter (the hole
  // list's own rule: words match the id, 'Drill_Code=DD' a collar field) narrows what is listed and what All ticks
  const [holeFilter, setHoleFilter] = useState("");
  const attrChoices = useMemo(() => collarAttrChoices(collars), [collars]);
  const shownHoles = useMemo(() => (holeFilter.trim() ? collarsMatching(tracedCollars, holeFilter).map((c) => c.hole_id) : holeIds), [tracedCollars, holeFilter, holeIds]);
  const items = mode === "hole" ? shownHoles : sections;
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
  // #2607 — a large run says what it will take, from the last run on this computer (1.76 s a page on the review's laptop: over an hour for 2,248)
  const lastMsPerPage = (() => { try { const v = Number(localStorage.getItem("geostrix.atlasMsPerPage")); return v > 0 ? v : null; } catch { return null; } })();

  // TASKS.csv #1777 — the mode's tokens, in single braces like the page's own placeholders (or the older double ones)
  const hasPlaceholders = templateElements.some((el) => hasAtlasTokens(el.text, mode === "hole" ? HOLE_TOKENS : SECTION_TOKENS));

  const generate = async () => {
    const chosen = items.filter((it) => selectedIds.has(itemKey(it)));
    if (!chosen.length) return;
    setBusy(true); setResult(null);
    const runStart = performance.now(); // #2607
    setProgress(mode === "hole" ? { done: 0, total: chosen.length } : null);
    try {
      // Per-hole strip-log generation is genuinely sequential (one canvas rasterize at a time is
      // simplest and fast enough here — dozens of holes, not thousands), so a real progress readout
      // is worth it; section pages are pure synchronous text substitution with nothing to await.
      const pages = mode === "hole" && includeStripLog
        ? await (async () => {
            const out = [];
            for (let i = 0; i < chosen.length; i++) {
              const [pg] = await generateAtlasPages({ mode, items: [chosen[i]], templateElements, collars, layers, includeStripLog, legendOverride, page, assayTracks, lithoPatterns });
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
      const pageIds = addLayoutPages(pages.map((pg) => ({ ...pg, batch })));
      // #1644 — then each page's map, centred on its hole: the 3D View renders them one by one and Layout comes back at the end
      const recapture = mode === "hole" && centreMaps && hasPlanMap ? atlasRecaptureItems(pages, pageIds) : [];
      if (recapture.length) { requestViewportBatch(recapture); onClose(); return; }
      const failed = pages.filter((pg) => pg.stripLogFailed).map((pg) => pg.name); // #1080
      // #1772 — what making room for the strip log did to the template's elements
      const narrowedPages = pages.filter((pg) => pg.narrowed > 0).length, coveredPages = pages.filter((pg) => pg.overlapping > 0).length;
      const room = (narrowedPages ? ` ${tr("To make room for the strip log, the template's elements beside it were narrowed on {n} page(s); a map keeps its scale and shows less ground.", { n: narrowedPages })}` : "")
        + (coveredPages ? ` ${tr("On {n} page(s) the strip log still covers part of the template: move it, or leave a free column at the side of the template.", { n: coveredPages })}` : "");
      if (pages.length) { try { localStorage.setItem("geostrix.atlasMsPerPage", String(Math.round((performance.now() - runStart) / pages.length))); } catch { /* no storage: no estimate next time */ } } // #2607
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
          <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.75, lineHeight: 1.4 }}>{tr("Creates one new Layout page per item below, using the CURRENT page as a template. Any {v} in a text/title element gets filled in per item — available tokens for this mode: {v2}.", { v: "{token}", v2: tokens.map((t) => `{${t}}`).join(", ") })}{" "}{tr("The page's own placeholders ({project}, {date}, {scale}, {crs}...) are filled on every generated page as well; the older double-brace form still works.")}</div>{/* #1777 — one syntax: single braces */}
          {mode === "hole" && untraced > 0 && <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.75 }}>{tr("{n} collar(s) with no depth (no trace) are left out of the list: their pages would show a point and an empty log.", { n: untraced })}</div>}{/* #2136 */}
          {mode === "hole" && includeStripLog && templateElements.some(isStripLogImage) && <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.75 }}>{tr("The template's own strip log is left off the generated pages: each page gets its own hole's.")}</div>}{/* #2136 */}
          {!hasPlaceholders && (
            <div style={{ fontSize: "var(--font-size-sm)", color: "#a95a3a" }}>{tr("The current page has no {v} placeholders in any text — every generated page will look identical except its name{v2}. Add a text element with e.g. {v3} first if you want per-item text.", { v: "{token}", v2: mode === "hole" && includeStripLog ? tr(" (and its strip log image)") : "", v3: mode === "hole" ? "{hole_id}" : "{name}" })}</div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <select value={mode} onChange={(e) => switchMode(e.target.value)} style={{ ...sel, flex: 1 }}>
              <option value="hole">{tr("One page per drillhole ({holeIds})", { holeIds: holeIds.length })}</option>{/* traced holes only: #2136 */}
              <option value="section">{tr("One page per section ({sections})", { sections: sections.length })}</option>
            </select>
          </div>
          {mode === "hole" && hasPlanMap && ( /* TASKS.csv #1644 */
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)" }} title={tr("Each page's top-down map is rendered again in the 3D View, centred on its hole at the template's scale: about a second per page. Off: every page shows the template's map, with its hole marked.")}>
              <input type="checkbox" checked={centreMaps} onChange={(e) => setCentreMaps(e.target.checked)} />{tr("Centre each page's map on its hole")}</label>
          )}
          {mode === "hole" && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)" }}>
              <input type="checkbox" checked={includeStripLog} onChange={(e) => setIncludeStripLog(e.target.checked)} />{tr("Add a strip log image (litho/alteration/vein/RQD%) to each page")}</label>
          )}
          {mode === "hole" && includeStripLog && ( /* TASKS.csv #1995 */
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)" }} title={tr("FGDC lithology patterns over the lithology colours, as on printed logs; set a code's pattern in the strip-log window")}>
              <input type="checkbox" checked={lithoPatterns} onChange={(e) => setLithoPatterns(e.target.checked)} />{tr("Lithology patterns (FGDC)")}</label>
          )}
          {mode === "hole" && includeStripLog && customChoices.length > 0 && ( /* TASKS.csv #2477 — custom-layer tracks */
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", flexWrap: "wrap" }}>
              <span>{tr("Custom layer tracks")}</span>
              {[0, 1].map((k) => (
                <select key={k} value={customSel[k]} aria-label={tr("Custom layer track {n}", { n: k + 1 })} onChange={(e) => setCustomSel((p) => p.map((s, j) => (j === k ? e.target.value : s)))} style={{ ...sel, flex: 1, minWidth: 80 }}>
                  <option value="">{tr("none")}</option>
                  {customChoices.map((c) => <option key={c.id} value={c.id}>{c.layer.name}</option>)}
                </select>
              ))}
            </div>
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
              <span>{mode === "hole" && holeFilter.trim() ? tr("{selectedCount} selected; {n} of {all} holes listed", { selectedCount, n: items.length, all: holeIds.length }) : tr("{selectedCount} of {items} selected", { selectedCount, items: items.length })}</span>
              <span style={{ display: "flex", gap: 8 }}>
                <span role="button" tabIndex={0} onKeyDown={activateOnKey} style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setSelectedIds(new Set(items.map(itemKey)))}>{tr("All")}</span>
                <span role="button" tabIndex={0} onKeyDown={activateOnKey} style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setSelectedIds(new Set())}>{tr("None")}</span>
              </span>
            </div>
            {mode === "hole" && <div style={{ display: "flex", gap: 6, marginBottom: 5 }}>{/* #2607 */}
              <input value={holeFilter} onChange={(e) => setHoleFilter(e.target.value)} placeholder={tr("Filter: hole id, or field=value")} aria-label={tr("Filter the holes")} style={{ ...sel, flex: 1, minWidth: 0 }} />
              {attrChoices.length > 0 && <select value="" onChange={(e) => e.target.value && setHoleFilter(e.target.value)} aria-label={tr("By a collar field")} style={{ ...sel, flex: "none", width: "auto" }}>
                <option value="">{tr("By a collar field…")}</option>{attrChoices.flatMap((ch) => ch.values.map((v) => <option key={`${ch.key}=${v}`} value={pickTerm(ch.key, v) /* #2960 — the typed filter splits on spaces */}>{`${ch.key} = ${v}`}</option>))}</select>}
            </div>}
            <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #2a323c", borderRadius: 6, padding: 6 }}>
              {items.length === 0 && <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.6, padding: 6 }}>{/* #1873 — say why a mode is empty and what fills it (a geophysics-only project has neither) */}{mode === "hole" ? (holeFilter.trim() && holeIds.length ? tr("No hole matches the filter.") : collars.length ? tr("No collar has a depth, so no hole has a trace to make a page from.") : tr("No holes have collars, so there is no page per hole: import collars, or use one page per section.")) : tr("No sections drawn yet: draw one with Draw section in the 3D View, then make one page per section here.")}</div>}
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
          {!busy && lastMsPerPage && lastMsPerPage * selectedCount >= 30000 && <div style={{ fontSize: "var(--font-size-xs)", opacity: 0.75 }}>{tr("About {m} min for {n} pages, at the last run's {s} s a page on this computer.", { m: Math.max(1, Math.round((lastMsPerPage * selectedCount) / 60000)), n: selectedCount, s: (lastMsPerPage / 1000).toFixed(1) })}</div>}{/* #2607 */}
        </div>
      </div>
    </div>
  );
}
