// TASKS.csv #3794 (Scottie Gold review: no Mine Design result said the block model was top-cut at 30 g/t, 24 % of the metal removed, though the cap decides the ounces) — the one
// line every Mine Design pane shows under its result (lib/topCutText.js). Silent for a model with no estimate record (imported, calculated).
import React from "react";
import { topCutText } from "../lib/topCutText.js";

export default function TopCutNote({ model, style = {} }) {
  const t = topCutText(model?.params);
  if (!t) return null;
  return <div role="note" style={{ fontSize: "var(--font-size-xs)", color: t.heavy ? "var(--color-warn-text-strong)" : "var(--color-text-muted)", lineHeight: 1.4, marginTop: 4, ...style }}>{t.text}</div>;
}
