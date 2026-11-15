// TASKS.csv #3541 / #3528 (Fireweed rehearsal) — the empty state's sample buttons, each with its own description as a second line (it was fifteen descriptions run
// together in one paragraph under the buttons). The full text stays as the tooltip. A fragment of <button>s: the empty state's action row lays them out.
import React from "react";

// "Load the bundled Macpass sample — Fireweed Metals Corp.'s drilling ...: 559 holes ..." -> the part after the first dash, which is the description
const descriptionOf = (title) => { const s = String(title || ""), i = s.indexOf(" — "); return (i > 0 ? s.slice(i + 3) : s).trim(); };

const btn = (loading) => ({
  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, textAlign: "left", width: 250, padding: "8px 12px", borderRadius: 6,
  border: "1px solid var(--color-accent)", background: "var(--color-bg)", color: "var(--color-accent-dark)", fontSize: "var(--font-size-base)", fontWeight: 600,
  cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
});
const second = { fontSize: "var(--font-size-xs)", fontWeight: 400, color: "var(--color-text-muted)", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" };

export default function SampleButtons({ cards, onLoad, loading }) {
  return (
    <>
      {cards.map((c) => (
        <button key={c.id} type="button" onClick={() => onLoad(c.id)} disabled={loading} title={c.title} style={btn(loading)}>
          <span>{c.label}</span>
          <span style={second}>{descriptionOf(c.title)}</span>
        </button>
      ))}
    </>
  );
}
