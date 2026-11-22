// TASKS.csv #3973 (batch A of #3967's plan, Matt: "agreed. go") — a Help page as a card, for the pages that give the new fields (src/help/content.js):
//  K1 a style-A header card: the title, a picture, one line (`line`, at most 15 words);
//  K2 the cautions (`cautions`), one line each, always in view (the protective ones a reader must not miss);
//  K3 "Use instead" chips (`instead: [{ text, to, page }]`): a "Not for" that points elsewhere, a link when that page exists;
//  K4 the key settings (`keys`: field names; each such field's `gist`, at most 8 words);
//  K5 a step strip (`strip`), only where the walk-through was in view;
//  K6 folds, closed: All settings (n) and Messages (n) in full, and More (the summary, every "Not for" line, the page's detail, the walk-through).
// Nothing is dropped: every sentence of the page is in one of the folds, and the search reads them all (HelpPane opens the folds a search hit is in).
// Body text is English for now, in its own direction (dir="auto"); the labels are the interface's (tr).
import React, { useId } from "react";
import { t as tr } from "../lib/i18n.js";
import { AlertTriangle, ArrowRight } from "../components/icons.js";
import { DIAGRAMS } from "./diagrams/index.jsx";
import { DropPicture } from "../components/DropDiagram.jsx";
import { HELP_PICTURES, SWATCH } from "./diagrams/pictures.jsx"; // TASKS.csv #3978 — the cards' own pictures (N1-N6)

const EN = { lang: "en", dir: "auto" };
const fold = { marginTop: 8, borderTop: "1px solid var(--color-border-subtle)", paddingTop: 6 };
const foldHead = { cursor: "pointer", fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text)" };
const sub = { fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text)", margin: "10px 0 4px" };

// TASKS.csv #3978 — one of the cards' own pictures (src/help/diagrams/pictures.jsx): the drawing (never mirrored), then its legend as HTML at the
// text-size tokens, in the interface's language
export function HelpPicture({ help, alt }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, ""), P = HELP_PICTURES[help];
  if (!P) return null;
  return (
    <figure data-help-picture={help} style={{ margin: "8px 0 0" }}>
      <div role="img" aria-label={alt} dir="ltr" style={{ maxWidth: 320, margin: "0 auto" }}><P.Pic id={`hp${uid}`} /></div>
      <figcaption style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px", marginTop: 4, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
        {P.legend.map(([kind, label]) => (
          <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span aria-hidden="true" style={{ width: 14, height: 10, borderRadius: 3, flex: "0 0 auto", ...SWATCH[kind] }} />{tr(label)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

// K1's picture: one of the cards' own (help), a Help diagram (full width, under the line) or one or two style-A block pictures beside it
function Picture({ picture }) {
  if (!picture) return null;
  if (picture.help) return <HelpPicture help={picture.help} alt={picture.alt} />;
  if (picture.diagram && DIAGRAMS[picture.diagram]) { const D = DIAGRAMS[picture.diagram]; return <figure role="img" aria-label={picture.alt} style={{ margin: "8px 0 0" }}><D /></figure>; }
  const drops = (picture.drop || []).slice(0, 2);
  if (!drops.length) return null;
  return (
    <figure role="img" aria-label={picture.alt} dir="ltr" data-help-picture="" style={{ margin: 0, flex: "0 0 auto", width: drops.length > 1 ? 150 : 96, display: "flex", alignItems: "center", gap: 2 }}>
      {drops.map((d, i) => <React.Fragment key={d}>{i > 0 && <ArrowRight size={12} aria-hidden="true" style={{ flex: "0 0 auto", color: "var(--color-text-muted)" }} />}<DropPicture picture={d} style={{ maxHeight: 64 }} /></React.Fragment>)}
    </figure>
  );
}

function Steps({ steps, sample }) {
  return (
    <div data-help-strip="" style={{ marginTop: 10 }}>
      {sample && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4 }}>{tr("How to: on the {sample} sample", { sample })}</div>}
      <ol style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 6, listStyle: "none", padding: 0, margin: 0 }}>
        {steps.map((s, i) => (
          <li key={i} style={{ border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-bg-subtle)", padding: "6px 8px", color: "var(--color-text)", lineHeight: 1.3 }}>
            <span style={{ fontWeight: 700, color: "var(--color-tier-basic)", marginInlineEnd: 4 }}>{i + 1}</span><span {...EN}>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function CardPage({ page, onOpen, pageExists, backButton, More, related }) {
  const fields = page.fields || [], warnings = page.warnings || [];
  const keys = (page.keys || []).map((name) => fields.find((f) => f.name === name)).filter(Boolean);
  const howtoHead = page.howto?.sample && !/^(any|your own)/i.test(page.howto.sample) ? tr("How to: on the {sample} sample", { sample: page.howto.sample }) : tr("How to");
  const sideBySide = page.picture?.drop?.length;
  return (
    <article data-help-card="" style={{ fontSize: "var(--font-size-sm)", lineHeight: 1.5, color: "var(--color-text-secondary)" }}>
      {backButton}
      {/* K1 */}
      <div className="ge-card" style={{ marginBottom: 10, overflow: "hidden" }}>
        <div className="ge-card-head" style={{ padding: "8px 12px 6px" }}>
          <h2 style={{ fontSize: "var(--font-size-lg)", color: "var(--color-text)", margin: 0 }}>{tr(page.title)}</h2>
          <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>{tr(page.area)}</div>
        </div>
        <div style={{ padding: "8px 12px 10px" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {sideBySide ? <Picture picture={page.picture} /> : null}
            <p data-help-line="" {...EN} style={{ margin: 0, color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>{page.line}</p>
          </div>
          {!sideBySide && <Picture picture={page.picture} />}
        </div>
      </div>
      {/* K2 */}
      {page.cautions?.length > 0 && (
        <ul data-help-cautions="" style={{ listStyle: "none", margin: "0 0 10px", padding: "6px 10px", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 8 }}>
          {page.cautions.map((c, i) => (
            <li key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", color: "var(--color-warn-text)", margin: "2px 0" }}>
              <AlertTriangle size={13} aria-hidden="true" style={{ flex: "0 0 auto", marginTop: 3 }} /><span {...EN}>{c}</span>
            </li>
          ))}
        </ul>
      )}
      {/* K3 */}
      {page.instead?.length > 0 && (
        <div data-help-instead="" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 10 }}>
          <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>{tr("Use instead")}</span>
          {page.instead.map((x, i) => {
            const inner = <><span {...EN}>{x.text}</span><ArrowRight size={11} aria-hidden="true" style={{ flex: "0 0 auto" }} /><span {...EN} style={{ fontWeight: 600 }}>{x.to}</span></>;
            const chip = { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 999, border: "1px solid var(--color-border)", background: "var(--color-bg)", boxShadow: "var(--shadow-chip)", fontSize: "var(--font-size-sm)", color: "var(--color-text)", font: "inherit" };
            return x.page && pageExists(x.page)
              ? <button key={i} type="button" dir="ltr" data-help-chip={x.page} onClick={() => onOpen(x.page)} style={{ ...chip, cursor: "pointer", color: "var(--color-info)" }}>{inner}</button>
              : <span key={i} dir="ltr" style={chip}>{inner}</span>; // dir: #3978 — the chip's words are English: "A → B" reads left to right (in Arabic the row flipped and the arrow pointed back)
          })}
        </div>
      )}
      {/* K4 */}
      {keys.length > 0 && (
        <dl data-help-keys="" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6, margin: 0 }}>
          {keys.map((f) => (
            <div key={f.name} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "6px 8px", background: "var(--color-bg)" }}>
              <dt {...EN} style={{ fontWeight: 600, color: "var(--color-text)" }}>{f.name}</dt>
              <dd {...EN} style={{ margin: 0 }}>{f.gist}</dd>
            </div>
          ))}
        </dl>
      )}
      {/* TASKS.csv #3978 — a second picture the plan puts beside the settings (N3 by a Source CRS, N4 by an azimuth) */}
      {page.figure?.help && <HelpPicture help={page.figure.help} alt={page.figure.alt} />}
      {/* K5 */}
      {page.strip?.length > 0 && <Steps steps={page.strip} sample={page.howto?.sample && !/^(any|your own)/i.test(page.howto.sample) ? page.howto.sample : null} />}
      {/* K6 */}
      {fields.length > 0 && (
        <details data-help-fold="settings" style={fold}>
          <summary style={foldHead}>{tr("All settings ({n})", { n: fields.length })}</summary>
          <dl style={{ margin: "6px 0 0" }}>
            {fields.map((f, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <dt {...EN} style={{ fontWeight: 600, color: "var(--color-text)" }}>{f.name}</dt>
                <dd style={{ margin: "1px 0 0 0" }}><div {...EN}>{f.what}</div>{f.choose && <div style={{ marginTop: 2 }}><span style={{ fontWeight: 600 }}>{tr("How to choose:")}</span> <span {...EN}>{f.choose}</span></div>}<More text={f.more} /></dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {warnings.length > 0 && (
        <details data-help-fold="messages" style={fold}>
          <summary style={foldHead}>{tr("Messages ({n})", { n: warnings.length })}</summary>
          <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", margin: "4px 0" }}>{tr("The names and numbers in a message are examples.")}</div>
          {warnings.map((w, i) => (
            <div key={i} style={{ marginBottom: 8, borderInlineStart: "3px solid var(--color-warn-border)", paddingInlineStart: 8 }}>
              <div {...EN} style={{ color: "var(--color-text)", fontStyle: "italic" }}>“{w.says}”</div>
              {w.means && <div {...EN}>{w.means}</div>}
              {w.do && <div><span style={{ fontWeight: 600 }}>{tr("What to do:")}</span> <span {...EN}>{w.do}</span></div>}
              <More text={w.more} />
            </div>
          ))}
        </details>
      )}
      <details data-help-fold="more" style={fold}>
        <summary style={foldHead}>{tr("More")}</summary>
        <p {...EN} style={{ margin: "6px 0 0" }}>{page.summary}</p>
        {page.more && <p {...EN} style={{ margin: "6px 0 0" }}>{page.more}</p>}
        {page.notFor?.length > 0 && (<>
          <div style={sub}>{tr("What it is not")}</div>
          <ul style={{ margin: 0, paddingInlineStart: 16 }}>{page.notFor.map((s, i) => <li key={i} {...EN} style={{ marginBottom: 4 }}>{s}</li>)}</ul>
        </>)}
        {page.howto?.steps?.length > 0 && (<>
          <div style={sub}>{howtoHead}</div>
          <ol style={{ margin: 0, paddingInlineStart: 18 }}>{page.howto.steps.map((s, i) => <li key={i} {...EN} style={{ marginBottom: 3 }}>{s}</li>)}</ol>
        </>)}
      </details>
      {related}
    </article>
  );
}
