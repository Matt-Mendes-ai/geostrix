// TASKS.csv #3541 / #3528 (Fireweed rehearsal) — the empty state's sample buttons, each with its own description as a second line (it was fifteen descriptions run
// together in one paragraph under the buttons). The full text stays as the tooltip. A fragment of buttons: the empty state's action row lays them out.
// TASKS.csv #3948 (Matt: "fold the samples ... Show Macpass and Mount Raymond") — the samples in view (lib/sampleCards.js emptyCardSamples) come first,
// the first one filled; every other sample sits under a closed "More samples" fold, on a row of its own.
import React from "react";
import { t as tr } from "../../lib/i18n.js";
import MoreFold from "../../components/MoreFold.jsx";

// "Load the bundled Macpass sample — Fireweed Metals Corp.'s drilling ...: 559 holes ..." -> the part after the first dash, which is the description
const descriptionOf = (title) => { const s = String(title || ""), i = s.indexOf(" — "); return (i > 0 ? s.slice(i + 3) : s).trim(); };

const btn = (loading, filled) => ({
  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, textAlign: "left", width: 250, padding: "8px 12px", borderRadius: 10, boxShadow: "var(--shadow-chip)", // #3956: style A
  // filled: the empty card's own primary blue (EmptyState primaryBtn)
  border: filled ? "1px solid #2a6291" : "1px solid var(--color-accent)", background: filled ? "#2f6f9f" : "linear-gradient(170deg, var(--color-bg) 0%, var(--color-warn-bg) 100%)", color: filled ? "#fff" : "var(--color-accent-dark)", fontSize: "var(--font-size-base)", fontWeight: 600,
  cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
});
const second = { fontSize: "var(--font-size-xs)", fontWeight: 400, color: "var(--color-text-muted)", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" };
const row = { display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" };

const buttons = (cards, onLoad, loading, firstFilled) => cards.map((c, i) => (
  <button data-btn-own="" key={c.id} type="button" data-sample-id={c.id} onClick={() => onLoad(c.id)} disabled={loading} title={c.title} style={btn(loading, firstFilled && i === 0)}>
    <span>{c.label}</span>{/* #3948 — while a sample loads the buttons are dimmed and its own "Loading the … sample project" notice says so */}
    <span style={firstFilled && i === 0 ? { ...second, color: "rgba(255,255,255,0.88)" } : second}>{descriptionOf(c.title)}</span>
  </button>
));

export default function SampleButtons({ shown = [], more = [], onLoad, loading }) {
  return (
    <>
      {buttons(shown, onLoad, loading, true)}
      {more.length > 0 && (
        <MoreFold data-more-samples="" summary={tr("More samples")} style={{ flexBasis: "100%", marginBottom: 0 }}>
          <div style={row}>{buttons(more, onLoad, loading, false)}</div>
        </MoreFold>
      )}
    </>
  );
}
