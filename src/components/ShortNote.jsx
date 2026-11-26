// TASKS.csv #4089 — a run's long result note (an equivalent-sources grid's or a gravity reduction's runs to 60-100 words) as its first sentence, the whole
// text one click away (a closed <details>); a short note is shown whole. The first sentence is Ribbon's firstSentence (#4070), so it reads as the panes' notices do.
import React from "react";
import { firstSentence } from "./Ribbon.jsx";

export default function ShortNote({ text, style, role = "status", maxWords = 24 }) {
  const all = String(text || "").trim(), first = firstSentence(all, maxWords);
  if (!all) return null;
  if (first === all) return <div role={role} style={style}>{all}</div>;
  return (
    <details role={role} data-short-note="" style={style}>
      <summary style={{ cursor: "pointer" }}>{first}</summary>
      <div style={{ marginTop: 4 }}>{all}</div>
    </details>
  );
}
