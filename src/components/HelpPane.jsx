// TASKS.csv #1966 — the offline Help panel: a page per tool, the contents by tab, and a plain search across every page. Opened from
// the "?" in a tool pane's header (src/lib/help.js openHelp), from Help > GeoStrix Help or with F1. A side panel, not a modal, so
// the tool it explains stays usable beside it. Lazy: this file and the pages (src/help/content.js) load on first use.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Search } from "./icons.js";
import { t as tr, currentLanguage } from "../lib/i18n.js";
import { HELP_AREAS } from "../lib/help.js";
import { PAGES, pageById, searchPages } from "../help/content.js";

const sectionHead = { fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text)", margin: "14px 0 6px" };
const muted = { color: "var(--color-text-muted)" };
const linkBtn = { background: "none", border: "none", padding: 0, color: "var(--color-info)", cursor: "pointer", textAlign: "left", fontSize: "inherit", font: "inherit" };

export default function HelpPane({ initialId = null, onClose }) {
  const [id, setId] = useState(() => (initialId && pageById(initialId) ? initialId : null));
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState([]);
  const bodyRef = useRef(null), searchRef = useRef(null);
  const page = id ? pageById(id) : null;
  const results = useMemo(() => searchPages(query), [query]);
  const go = (next) => { setHistory((h) => (id ? [...h, id] : h)); setId(next); setQuery(""); };
  const back = () => { setHistory((h) => { const prev = h[h.length - 1] ?? null; setId(prev); return h.slice(0, -1); }); };
  useEffect(() => { bodyRef.current?.scrollTo?.(0, 0); }, [id, query]);
  useEffect(() => { if (!initialId) searchRef.current?.focus(); }, [initialId]);
  const onKeyDown = (e) => { if (e.key === "Escape") { e.stopPropagation(); if (query) setQuery(""); else onClose(); } };
  const english = (currentLanguage() || "en") === "en";

  return (
    <aside className="ge-help" role="complementary" aria-label={tr("GeoStrix Help")} onKeyDown={onKeyDown}>
      <div className="ge-help-head">
        <span style={{ fontWeight: 600, fontSize: "var(--font-size-lg)", color: "var(--color-text)", flex: 1 }}>{tr("Help")}</span>
        <button type="button" className="ge-pane-close" onClick={onClose} aria-label={tr("Close help")} title={tr("Close help (Esc)")}><X size={14} /></button>
      </div>
      <label className="ge-help-search">
        <Search size={13} aria-hidden="true" />
        <input ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("Search every page…")} aria-label={tr("Search the help")} />
      </label>
      <div ref={bodyRef} className="ge-help-body">
        {!english && <div style={{ ...muted, fontSize: "var(--font-size-xs)", marginBottom: 8 }}>{tr("These help pages are in English for now. Tool names follow the interface.")}</div>}
        {query.trim() ? (
          <Results results={results} query={query} onOpen={go} />
        ) : page ? (
          <Page page={page} onOpen={go} onBack={history.length ? back : () => setId(null)} backLabel={history.length ? tr("Back") : tr("All help pages")} />
        ) : (
          <Contents onOpen={go} />
        )}
      </div>
    </aside>
  );
}

function Contents({ onOpen }) {
  const byArea = HELP_AREAS.map((a) => [a, PAGES.filter((p) => p.area === a)]).filter(([, ps]) => ps.length);
  return (
    <div>
      <div style={{ ...muted, fontSize: "var(--font-size-sm)", lineHeight: 1.45, marginBottom: 6 }}>{tr("One page per tool: what it does, what it is not, each field and how to choose a value, the warnings it can show, and a short walk-through. Works with no internet connection.")}</div>
      {byArea.map(([area, ps]) => (
        <div key={area}>
          <div style={sectionHead}>{tr(area)}</div>
          <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.7 }}>
            {ps.map((p) => <li key={p.id}><button type="button" style={linkBtn} onClick={() => onOpen(p.id)}>{tr(p.title)}</button></li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Results({ results, query, onOpen }) {
  if (!results.length) return <div style={muted}>{tr("No page contains every word of \"{q}\". Try fewer words, or the label as it reads on screen.", { q: query.trim() })}</div>;
  return (
    <div>
      <div style={{ ...muted, fontSize: "var(--font-size-xs)", marginBottom: 6 }}>{tr(results.length === 1 ? "1 page" : "{n} pages", { n: results.length })}</div>
      {results.map(({ page, snippet }) => (
        <div key={page.id} style={{ marginBottom: 10 }}>
          <button type="button" style={{ ...linkBtn, fontWeight: 600 }} onClick={() => onOpen(page.id)}>{tr(page.title)}</button>
          <span style={{ ...muted, fontSize: "var(--font-size-xs)" }}> · {tr(page.area)}</span>
          {snippet && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.4, marginTop: 2 }}>{snippet}</div>}
        </div>
      ))}
    </div>
  );
}

function Page({ page, onOpen, onBack, backLabel }) {
  const related = (page.related || []).map((r) => pageById(r)).filter(Boolean);
  return (
    <article style={{ fontSize: "var(--font-size-sm)", lineHeight: 1.5, color: "var(--color-text-secondary)" }}>
      <button type="button" style={{ ...linkBtn, fontSize: "var(--font-size-xs)", marginBottom: 6 }} onClick={onBack}>← {backLabel}</button>
      <h2 style={{ fontSize: "var(--font-size-lg)", color: "var(--color-text)", margin: "0 0 2px" }}>{tr(page.title)}</h2>
      <div style={{ ...muted, fontSize: "var(--font-size-xs)", marginBottom: 8 }}>{tr(page.area)}</div>
      <p style={{ margin: 0, color: "var(--color-text)" }}>{page.summary}</p>
      {page.notFor?.length > 0 && (<>
        <div style={sectionHead}>{tr("What it is not")}</div>
        <ul style={{ margin: 0, paddingLeft: 16 }}>{page.notFor.map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}</ul>
      </>)}
      {page.fields?.length > 0 && (<>
        <div style={sectionHead}>{tr("Fields")}</div>
        <dl style={{ margin: 0 }}>
          {page.fields.map((f, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <dt style={{ fontWeight: 600, color: "var(--color-text)" }}>{f.name}</dt>
              <dd style={{ margin: "1px 0 0 0" }}>{f.what}{f.choose && <div style={{ marginTop: 2 }}><span style={{ fontWeight: 600 }}>{tr("How to choose:")}</span> {f.choose}</div>}</dd>
            </div>
          ))}
        </dl>
      </>)}
      {page.warnings?.length > 0 && (<>
        <div style={sectionHead}>{tr("Messages you may see")}</div>
        {page.warnings.map((w, i) => (
          <div key={i} style={{ marginBottom: 8, borderLeft: "3px solid var(--color-warn-border)", paddingLeft: 8 }}>
            <div style={{ color: "var(--color-text)", fontStyle: "italic" }}>“{w.says}”</div>
            {w.means && <div>{w.means}</div>}
            {w.do && <div><span style={{ fontWeight: 600 }}>{tr("What to do:")}</span> {w.do}</div>}
          </div>
        ))}
      </>)}
      {page.howto?.steps?.length > 0 && (<>
        <div style={sectionHead}>{page.howto.sample && !/^(any|your own)/i.test(page.howto.sample) ? tr("How to: on the {sample} sample", { sample: page.howto.sample }) : tr("How to")}</div>
        <ol style={{ margin: 0, paddingLeft: 18 }}>{page.howto.steps.map((s, i) => <li key={i} style={{ marginBottom: 3 }}>{s}</li>)}</ol>
      </>)}
      {related.length > 0 && (<>
        <div style={sectionHead}>{tr("See also")}</div>
        <ul style={{ margin: 0, paddingLeft: 16 }}>{related.map((r) => <li key={r.id}><button type="button" style={linkBtn} onClick={() => onOpen(r.id)}>{tr(r.title)}</button></li>)}</ul>
      </>)}
    </article>
  );
}
