import React, { useMemo, useState } from "react";
import { useStore } from "../lib/store.jsx";
import { t as tr } from "../lib/i18n.js";
import { categoryLabel } from "../lib/layers.js";
import { loggedDescriptions, entryOf, codeKey, labelsFromDictionary } from "../lib/codeDictionary.js";

// TASKS.csv #2163 — the layer's code dictionary in its inspector: what each code means in THIS project, filled from the description logged
// beside the code (lib/codeDictionary.js says when that is unambiguous) or typed, saved with the project and undoable. Nothing comes from
// other projects or a global list: the same code means different rocks in different reports.
const SHOWN = 500;

export default function CodeDictionaryTable({ layerKey, rows, categories, legendOverride, meta, onSetLabel }) {
  const { codeDictionary, setCodeDictionaryEntry, fillCodeDictionary } = useStore();
  const dict = codeDictionary?.[layerKey] || {};
  const logged = useMemo(() => loggedDescriptions(rows), [rows]);
  const [notice, setNotice] = useState(null);
  const labelOf = (value) => categoryLabel(legendOverride?.[value] || {}, meta, value);
  const fill = () => {
    const n = fillCodeDictionary(layerKey, rows);
    setNotice(n ? (n === 1 ? tr("1 code took its meaning from the description logged beside it.") : tr("{n} codes took their meaning from the description logged beside them.", { n })) : tr("No code without a meaning has a description logged beside it more often than any other (notes that differ on every row describe intervals, not the code)."));
  };
  const toLegend = () => {
    const labels = labelsFromDictionary(dict, categories, labelOf);
    labels.forEach(({ value, label }) => onSetLabel(value, label));
    setNotice(labels.length ? tr("Labelled {n} code(s) in the legend with their meaning; their colours are kept.", { n: labels.length }) : tr("Every code with a meaning already has it as its legend label."));
  };
  const withMeaning = categories.filter(([v]) => entryOf(dict, v)).length;
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
      <div style={note}>{tr("What each code means in this project, saved with it. The same code can mean different rocks in different reports, so nothing comes from other projects: a meaning is the description logged beside the code in the file, or what you type here.")}</div>
      <div style={{ display: "flex", gap: 6, margin: "8px 0", alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={fill} style={btn} title={tr("Codes with no meaning yet take the description logged beside them, when one is logged more often than any other. Meanings already set are kept.")}>{tr("Fill from the logged descriptions")}</button>
        <button onClick={toLegend} style={btn} disabled={!withMeaning} title={tr("Each code's legend label (every legend, section key and strip log) becomes its meaning; the colours stay.")}>{tr("Use as legend labels")}</button>
        <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("{n} of {total} codes have a meaning.", { n: withMeaning, total: categories.length })}</span>
      </div>
      {notice && <div role="status" style={{ ...note, marginBottom: 8, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 5 }}>{notice}</div>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-base)" }}>
        <thead><tr><th style={th}>{tr("Code")}</th><th style={th}>{tr("Rows")}</th><th style={th}>{tr("Meaning in this project")}</th><th style={{ ...th, whiteSpace: "nowrap" }}>{tr("Set by")}</th><th style={th}>{tr("Logged beside it")}</th></tr></thead>
        <tbody>
          {categories.slice(0, SHOWN).map(([value, count]) => {
            const e = entryOf(dict, value), info = logged.get(codeKey(value));
            const others = info && info.variants > 1 ? " " + tr("(+{n} other descriptions)", { n: info.variants - 1 }) : "";
            return (
              <tr key={value} style={{ borderBottom: "1px solid var(--color-hover-bg)" }}>
                <td style={{ ...td, fontWeight: 600 }}>{value}</td>
                <td style={{ ...td, color: "var(--color-text-muted)" }}>{count}</td>
                <td style={td}>
                  <input key={e?.desc ?? ""} defaultValue={e?.desc ?? ""} aria-label={tr("Meaning of {code}", { code: value })}
                    onBlur={(ev) => setCodeDictionaryEntry(layerKey, value, ev.target.value)}
                    onKeyDown={(ev) => { if (ev.key === "Enter") ev.currentTarget.blur(); }} style={inp} />
                </td>
                <td style={{ ...td, color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)", whiteSpace: "nowrap" }}>{e ? (e.source === "file" ? tr("the file") : tr("you")) : "—"}</td>
                <td style={{ ...td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }} title={info?.top ? info.top + others : undefined}>{info?.top ? info.top + others : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {categories.length > SHOWN && <div style={{ ...note, padding: "8px 0" }}>{tr("Showing the first {shown} of {total} codes.", { shown: SHOWN, total: categories.length })}</div>}
    </div>
  );
}

const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };
const th = { textAlign: "start", padding: "6px 8px", color: "var(--color-text-muted)", fontWeight: 500, borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, background: "var(--color-bg)" };
const td = { padding: "4px 8px", color: "var(--color-text-strong)" };
const inp = { width: "100%", minWidth: 120, background: "transparent", border: "none", borderBottom: "1px solid var(--color-border)", color: "var(--color-text)", fontSize: "var(--font-size-base)", padding: "2px 0", fontFamily: "inherit" };
const btn = { padding: "5px 10px", borderRadius: 5, fontSize: "var(--font-size-sm)", cursor: "pointer", border: "1px solid var(--color-border-light)", background: "var(--color-bg-subtle)", color: "var(--color-text-secondary)", fontFamily: "inherit" };
