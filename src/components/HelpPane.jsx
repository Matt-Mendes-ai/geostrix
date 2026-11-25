// TASKS.csv #1966 — the offline Help panel: a page per tool, the contents by tab, and a plain search across every page. Opened from
// the "?" in a tool pane's header (src/lib/help.js openHelp), from Help > GeoStrix Help or with F1. A side panel, not a modal, so
// the tool it explains stays usable beside it. Lazy: this file and the pages (src/help/content.js) load on first use.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Search } from "./icons.js";
import { t as tr, currentLanguage } from "../lib/i18n.js";
import { HELP_AREAS, openShortcuts } from "../lib/help.js"; // openShortcuts: TASKS.csv #3534
import { PAGES, pageById, searchPages } from "../help/content.js";
import { DIAGRAMS } from "../help/diagrams/index.jsx"; // TASKS.csv #3899 — loaded with Help, never at startup
import FirstSteps from "../help/FirstSteps.jsx"; // TASKS.csv #3887 — the First steps guide, a Help page
import CardPage from "../help/CardPage.jsx"; // TASKS.csv #3973 — a page that gives the card fields
import { openFoldsFor } from "../help/openFolds.js"; // TASKS.csv #3973

const sectionHead = { fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text)", margin: "14px 0 6px" };
const muted = { color: "var(--color-text-muted)" };
// TASKS.csv #3899 / #3887 — the page bodies are English for now: in an Arabic interface (dir="rtl") an English block takes its own direction
// (dir="auto"), so its full stops and question marks stay at its end; an English run inside a translated line is isolated (dir="ltr")
const EN = { lang: "en", dir: "auto" };
const En = ({ children }) => <span lang="en" dir="ltr">{children}</span>;
// TASKS.csv #3899 — detail kept behind a closed "More" (a page's, a field's or a warning's `more`); search still reads it
function More({ text }) {
  if (!text) return null;
  return <details style={{ marginTop: 3 }}><summary style={{ cursor: "pointer", color: "var(--color-info)", fontSize: "var(--font-size-xs)" }}>{tr("More")}</summary><div {...EN} style={{ marginTop: 2 }}>{text}</div></details>;
}
const linkBtn = { background: "none", border: "none", padding: 0, color: "var(--color-info)", cursor: "pointer", textAlign: "left", fontSize: "inherit", font: "inherit" };

export default function HelpPane({ initialId = null, area = null, onClose }) { // area: the tab the user is on (#3693: its pages rank first in a search)
  const [id, setId] = useState(() => (initialId && pageById(initialId) ? initialId : null));
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState([]);
  const [focus, setFocus] = useState(null); // TASKS.csv #3973 — the search a page was opened from: its folds that hold the words open
  const bodyRef = useRef(null), searchRef = useRef(null);
  const page = id ? pageById(id) : null;
  const results = useMemo(() => searchPages(query, undefined, { area }), [query, area]);
  const go = (next, from = null) => { setHistory((h) => (id ? [...h, id] : h)); setId(next); setFocus(from); setQuery(""); };
  const back = () => { setHistory((h) => { const prev = h[h.length - 1] ?? null; setId(prev); return h.slice(0, -1); }); };
  useEffect(() => { bodyRef.current?.scrollTo?.(0, 0); }, [id, query]);
  // #3973 — every sentence sits on the page or in a fold: a search hit's folds open, and the first one is brought into view
  useEffect(() => { if (focus && !query && bodyRef.current) openFoldsFor(bodyRef.current, focus); }, [id, focus, query]);
  useEffect(() => { if (!initialId) searchRef.current?.focus(); }, [initialId]);
  const onKeyDown = (e) => { if (e.key === "Escape") { e.stopPropagation(); if (query) setQuery(""); else onClose(); } };
  const english = (currentLanguage() || "en") === "en";

  return (
    <aside className="ge-help" role="complementary" aria-label={tr("GeoStrix Help")} onKeyDown={onKeyDown}>
      <div className="ge-help-head">
        <span style={{ fontWeight: 600, fontSize: "var(--font-size-lg)", color: "var(--color-text)", flex: 1 }}>{tr("Help")}</span>
        <button data-btn-own="" type="button" className="ge-pane-close" onClick={onClose} aria-label={tr("Close help")} title={tr("Close help (Esc)")}><X size={14} /></button>
      </div>
      <label className="ge-help-search">
        <Search size={13} aria-hidden="true" />
        <input ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("Search every page…")} aria-label={tr("Search the help")} />
      </label>
      <div ref={bodyRef} className="ge-help-body">
        {!english && <div style={{ ...muted, fontSize: "var(--font-size-xs)", marginBottom: 8 }}>{tr("These help pages are in English for now. Tool names follow the interface.")}</div>}
        {query.trim() ? (
          <Results results={results} query={query} onOpen={(pid) => go(pid, query)} />
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
  const link = { background: "none", border: "none", padding: 0, color: "var(--color-accent)", cursor: "pointer", font: "inherit", textDecoration: "underline" };
  return (
    <div>
      <div style={{ ...muted, fontSize: "var(--font-size-sm)", marginBottom: 6 }}>{/* TASKS.csv #3534 — what the status bar's ? used to open */}<button data-btn-own="" type="button" style={link} onClick={() => openShortcuts("shortcuts")}>{tr("Keyboard shortcuts")}</button> · <button data-btn-own="" type="button" style={link} onClick={() => openShortcuts("about")}>{tr("About GeoStrix")}</button></div>
      <button data-btn-own="" type="button" data-first-steps-open="" style={{ ...link, display: "block", fontWeight: 600, textDecoration: "none", margin: "4px 0 8px", fontSize: "var(--font-size-base)" }} onClick={() => onOpen("first-steps")}>{tr("New here? First steps, in six screens")}</button>{/* TASKS.csv #3887 */}
      <div style={{ ...muted, fontSize: "var(--font-size-sm)", lineHeight: 1.45, marginBottom: 6 }}>{tr("One page per tool: what it does and is not, each field and how to set it, its warnings and a short walk-through. Works offline.")}</div>
      {byArea.map(([area, ps]) => (
        <div key={area}>
          <div style={sectionHead}>{tr(area)}</div>
          <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.7 }}>
            {ps.map((p) => <li key={p.id}><button data-btn-own="" type="button" style={linkBtn} onClick={() => onOpen(p.id)}>{tr(p.title)}</button></li>)}
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
          <button data-btn-own="" type="button" style={{ ...linkBtn, fontWeight: 600 }} onClick={() => onOpen(page.id)}>{tr(page.title)}</button>
          <span style={{ ...muted, fontSize: "var(--font-size-xs)" }}> · {tr(page.area)}</span>
          {snippet && <div {...EN} style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.4, marginTop: 2 }}>{snippet}</div>}
        </div>
      ))}
    </div>
  );
}

function Page({ page, onOpen, onBack, backLabel }) {
  const related = (page.related || []).map((r) => pageById(r)).filter(Boolean);
  if (page.line) { // TASKS.csv #3973 — the card shape (src/help/CardPage.jsx); a page without `line` reads as before
    const seeAlso = related.length > 0 && (<>
      <div style={sectionHead}>{tr("See also")}</div>
      <ul style={{ margin: 0, paddingLeft: 16 }}>{related.map((r) => <li key={r.id}><button data-btn-own="" type="button" style={linkBtn} onClick={() => onOpen(r.id)}>{tr(r.title)}</button></li>)}</ul>
    </>);
    return <CardPage page={page} onOpen={onOpen} pageExists={(pid) => !!pageById(pid)} More={More} related={seeAlso}
      backButton={<button data-btn-own="" type="button" style={{ ...linkBtn, fontSize: "var(--font-size-xs)", marginBottom: 6 }} onClick={onBack}>← {backLabel}</button>} />;
  }
  return (
    <article style={{ fontSize: "var(--font-size-sm)", lineHeight: 1.5, color: "var(--color-text-secondary)" }}>
      <button data-btn-own="" type="button" style={{ ...linkBtn, fontSize: "var(--font-size-xs)", marginBottom: 6 }} onClick={onBack}>← {backLabel}</button>
      <h2 style={{ fontSize: "var(--font-size-lg)", color: "var(--color-text)", margin: "0 0 2px" }}>{tr(page.title)}</h2>
      <div style={{ ...muted, fontSize: "var(--font-size-xs)", marginBottom: 8 }}>{tr(page.area)}</div>
      {page.guide ? <p style={{ margin: 0, color: "var(--color-text)" }}>{tr(page.summary)}</p> : <p {...EN} style={{ margin: 0, color: "var(--color-text)" }}>{page.summary}</p>}
      {page.guide && <FirstSteps />}{/* #3887 */}
      {page.diagram && DIAGRAMS[page.diagram.id] && (() => { const D = DIAGRAMS[page.diagram.id]; return <figure role="img" aria-label={page.diagram.alt} style={{ margin: "10px 0 0" }}><D /></figure>; })()}{/* #3899 */}
      <More text={page.more} />
      {page.notFor?.length > 0 && (<>
        <div style={sectionHead}>{tr("What it is not")}</div>
        <ul style={{ margin: 0, paddingLeft: 16 }}>{page.notFor.map((s, i) => <li key={i} {...EN} style={{ marginBottom: 4 }}>{s}</li>)}</ul>
      </>)}
      {page.fields?.length > 0 && (<>
        <div style={sectionHead}>{tr("Fields")}</div>
        <dl style={{ margin: 0 }}>
          {page.fields.map((f, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <dt {...EN} style={{ fontWeight: 600, color: "var(--color-text)" }}>{f.name}</dt>
              <dd style={{ margin: "1px 0 0 0" }}><div {...EN}>{f.what}</div>{f.choose && <div style={{ marginTop: 2 }}><span style={{ fontWeight: 600 }}>{tr("How to choose:")}</span> <En>{f.choose}</En></div>}<More text={f.more} /></dd>
            </div>
          ))}
        </dl>
      </>)}
      {page.warnings?.length > 0 && (<>
        <div style={sectionHead}>{tr("Messages you may see")}</div>
        <div style={{ ...muted, fontSize: "var(--font-size-xs)", marginBottom: 4 }}>{tr("The names and numbers in a message are examples.")}</div>{/* TASKS.csv #3693 */}
        {page.warnings.map((w, i) => (
          <div key={i} style={{ marginBottom: 8, borderLeft: "3px solid var(--color-warn-border)", paddingLeft: 8 }}>
            <div {...EN} style={{ color: "var(--color-text)", fontStyle: "italic" }}>“{w.says}”</div>
            {w.means && <div {...EN}>{w.means}</div>}
            {w.do && <div><span style={{ fontWeight: 600 }}>{tr("What to do:")}</span> <En>{w.do}</En></div>}
            <More text={w.more} />
          </div>
        ))}
      </>)}
      {page.howto?.steps?.length > 0 && (() => {
        const head = page.howto.sample && !/^(any|your own)/i.test(page.howto.sample) ? tr("How to: on the {sample} sample", { sample: page.howto.sample }) : tr("How to");
        const list = <ol style={{ margin: 0, paddingLeft: 18 }}>{page.howto.steps.map((s, i) => <li key={i} {...EN} style={{ marginBottom: 3 }}>{s}</li>)}</ol>;
        // #3899 — a folded walk-through sits under its heading, closed, as the detail behind "More" does; the search still reads it
        return page.howto.folded
          ? <details data-howto-folded=""><summary style={{ ...sectionHead, cursor: "pointer" }}>{head}</summary>{list}</details>
          : <><div style={sectionHead}>{head}</div>{list}</>;
      })()}
      {related.length > 0 && (<>
        <div style={sectionHead}>{tr("See also")}</div>
        <ul style={{ margin: 0, paddingLeft: 16 }}>{related.map((r) => <li key={r.id}><button data-btn-own="" type="button" style={linkBtn} onClick={() => onOpen(r.id)}>{tr(r.title)}</button></li>)}</ul>
      </>)}
    </article>
  );
}
