// TASKS.csv #2352 (review #2325, WA uranium) — Jensen and Winchester & Floyd classify VOLCANIC rocks. Before one writes a layer, the logged
// codes of the samples it would classify are listed with their counts and the user ticks the volcanic ones. A code is ticked to start with
// only when its name reads as a volcanic rock (guessProtolith); a lignite / clay / sand project gets no volcanic names unless asked.
import React, { useState } from "react";
import StepDialog from "./StepDialog.jsx"; // TASKS.csv #4073 — the shared step shell (Escape and the focus trap)
import { backdropProps } from "../lib/modalStyles.js"; // a press that starts and ends on the backdrop cancels, as a click on it did
import { t as tr } from "../lib/i18n.js";

export const NOT_LOGGED_CODE = ""; // the samples with no logged lithology at their midpoint

// codes: [{ code, n, volcanic, meaning? }] (volcanic: the starting tick; meaning: the project's dictionary name for the code, #3292); label: the method's name
export default function VolcanicCodesModal({ label, codes, onCancel, onRun }) {
  const [ticked, setTicked] = useState(() => new Set(codes.filter((c) => c.volcanic).map((c) => c.code)));
  const n = codes.filter((c) => ticked.has(c.code)).reduce((s, c) => s + c.n, 0);
  const small = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };
  const flip = (code) => setTicked((s) => { const t = new Set(s); if (t.has(code)) t.delete(code); else t.add(code); return t; });
  // TASKS.csv #4073 (Matt: "similar for all pop up windows"; "too wordy … cut, don't just cap") — ONE step (one question: which codes are volcanic):
  // Cancel and Classify (the gold primary). The line seen first says what happens to the samples left unticked (they stay unclassified); how the
  // starting ticks are chosen and where the count is given are in the Help card. It stays above the Geochem tools' own dialogs (zIndex 1000), and a
  // press on the backdrop still cancels.
  const heading = tr("Which logged codes are volcanic?"); // the dialog's name, seen (a JSX title= would count it as a tooltip)
  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>{tr("Volcanic codes")}</summary>
      <div style={small}>{tr("{label} names volcanic rocks only. Tick the logged codes that are volcanic; samples logged as anything else are left unclassified (the notice gives the count). Codes whose names read as volcanic start ticked.", { label })}</div>
    </details>
  );
  const steps = [
    { key: "codes", label: heading, primary: { label: tr("Classify {n} sample(s)", { n: n.toLocaleString() }), onClick: () => onRun(ticked), disabled: !n },
      hint: n ? "" : tr("No code is ticked, so nothing would be classified."), render: () => (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...small, marginBottom: 10 }}>{tr("{label} names volcanic rocks only: samples under an unticked code stay unclassified.", { label })}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {codes.map((c) => (
              <label key={c.code} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>
                <input type="checkbox" checked={ticked.has(c.code)} onChange={() => flip(c.code)} aria-label={tr("Volcanic: {code}", { code: c.code || tr("no code logged") })} />
                <span style={{ minWidth: 90 }} title={c.meaning || undefined}>{c.code || <em>{tr("no code logged")}</em>}{c.meaning ? ` — ${c.meaning}` : ""}</span>{/* #3292 */}
                <span style={{ color: "var(--color-text-muted)" }}>{tr("{n} sample(s)", { n: c.n.toLocaleString() })}</span>
              </label>
            ))}
          </div>
        </div>
      ) },
  ];
  return <StepDialog title={heading} onClose={onCancel} steps={steps} at={0} onAt={() => {}} help={help} width="min(440px, 94vw)" zIndex={1000} overlayProps={backdropProps(onCancel)} />;
}
