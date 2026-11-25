// TASKS.csv #4073 — the fold of a Result step's cautions and details, labelled with what is in it: "Cautions (3): 38 % of the estimated metal lies below…" (the count of warnings and the worst one in
// a few words), "Details (2)" when there are only plain lines, and not shown at all when there is nothing. It reads its own rendered lines (each child element that has text), so a dialog
// keeps writing its conditions as it always did. The word count reads its children as folded (scripts/word-count.mjs lists CautionFold beside MoreFold and details).
import React, { useLayoutEffect, useRef, useState } from "react";
import { cautionSummary, levelOfStyle } from "../lib/cautionFold.js";
import { t as tr } from "../lib/i18n.js";

export default function CautionFold({ children, style }) {
  const box = useRef(null);
  const [sum, setSum] = useState({ kind: "none", n: 0, worst: "" });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const items = [...el.children].map((c) => {
      const own = c.getAttribute("style") || "", inner = [...c.querySelectorAll("[style]")].slice(0, 4).map((x) => x.getAttribute("style") || "").join(" ");
      return { text: c.textContent, level: Math.max(levelOfStyle(own, c.getAttribute("role") || ""), levelOfStyle(inner, "")) };
    });
    const s = cautionSummary(items);
    setSum((p) => (p.kind === s.kind && p.n === s.n && p.worst === s.worst ? p : s));
  });
  const label = sum.kind === "cautions" ? tr("Cautions ({n}): {worst}", { n: sum.n, worst: sum.worst }) : sum.kind === "details" ? tr("Details ({n})", { n: sum.n }) : tr("Cautions");
  return (
    <details data-more-fold="" data-cautions={sum.n} style={{ marginBottom: 8, ...style, ...(sum.kind === "none" ? { display: "none" } : {}) }}>
      <summary style={{ cursor: "pointer", color: sum.kind === "cautions" ? "var(--color-warn-text)" : "var(--color-info)", fontSize: "var(--font-size-sm)" }}>{label}</summary>
      <div ref={box} style={{ marginTop: 4 }}>{children}</div>
    </details>
  );
}
