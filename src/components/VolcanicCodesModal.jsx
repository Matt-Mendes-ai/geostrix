// TASKS.csv #2352 (review #2325, WA uranium) — Jensen and Winchester & Floyd classify VOLCANIC rocks. Before one writes a layer, the logged
// codes of the samples it would classify are listed with their counts and the user ticks the volcanic ones. A code is ticked to start with
// only when its name reads as a volcanic rock (guessProtolith); a lignite / clay / sand project gets no volcanic names unless asked.
import React, { useState } from "react";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { t as tr } from "../lib/i18n.js";

export const NOT_LOGGED_CODE = ""; // the samples with no logged lithology at their midpoint

// codes: [{ code, n, volcanic }] (volcanic: the starting tick); label: the method's name
export default function VolcanicCodesModal({ label, codes, onCancel, onRun }) {
  useEscapeKey(onCancel);
  const [ticked, setTicked] = useState(() => new Set(codes.filter((c) => c.volcanic).map((c) => c.code)));
  const n = codes.filter((c) => ticked.has(c.code)).reduce((s, c) => s + c.n, 0);
  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };
  const flip = (code) => setTicked((s) => { const t = new Set(s); if (t.has(code)) t.delete(code); else t.add(code); return t; });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label={tr("Which logged codes are volcanic?")} onClick={(e) => e.stopPropagation()} style={{ background: "var(--color-bg)", borderRadius: 8, padding: 16, width: 440, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 8px 30px rgba(0,0,0,0.25)" }}>
        <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-accent-dark)" }}>{tr("Which logged codes are volcanic?")}</div>
        <div style={{ ...small, marginTop: 4 }}>{tr("{label} names volcanic rocks only. Tick the logged codes that are volcanic: the samples logged as anything else are left unclassified, and the notice says how many. A code is ticked to start with only when its name reads as a volcanic rock.", { label })}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 10 }}>
          {codes.map((c) => (
            <label key={c.code} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>
              <input type="checkbox" checked={ticked.has(c.code)} onChange={() => flip(c.code)} aria-label={tr("Volcanic: {code}", { code: c.code || tr("no code logged") })} />
              <span style={{ minWidth: 90 }}>{c.code || <em>{tr("no code logged")}</em>}</span>
              <span style={{ color: "var(--color-text-muted)" }}>{tr("{n} sample(s)", { n: c.n.toLocaleString() })}</span>
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={onCancel} style={{ flex: 1, padding: "6px 10px" }}>{tr("Cancel")}</button>
          <button type="button" disabled={!n} onClick={() => onRun(ticked)} style={{ flex: 2, padding: "6px 10px", opacity: n ? 1 : 0.5 }}>{tr("Classify {n} sample(s)", { n: n.toLocaleString() })}</button>
        </div>
        {!n && <div role="note" style={{ ...small, marginTop: 6 }}>{tr("No code is ticked: none of these samples is logged as a volcanic rock, so nothing would be classified.")}</div>}
      </div>
    </div>
  );
}
