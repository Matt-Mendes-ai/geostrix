import React, { useMemo, useState } from "react";
import { useStore } from "../lib/store.jsx";
import { t as tr } from "../lib/i18n.js";
import { suggestGroups, groupingPlan } from "../lib/lithoHarmonize.js";

// TASKS.csv #2004 (design docs/ideas/litho-code-harmonization.md) — "Suggest groups" in the Lithology groups pane: the ungrouped codes whose
// meaning (the project's code dictionary, the code read as a rock word, a common abbreviation) names the same rock, listed by proposed group
// with a tick each. Nothing is written until Apply; a close spelling or a code whose descriptions name different rocks starts unticked.
// Lazy: the thesaurus and the matching load when the button is first clicked.
const box = { fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginBottom: 8, lineHeight: 1.45, padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 6 };
const SHOWN_GROUPS = 40;

function sourceText(p) {
  if (p.how === "fuzzy") return tr("a close spelling of \"{word}\" ({d} letter(s) off)", { word: p.word, d: p.distance });
  if (p.source === "dictionary") return tr("its meaning in the code dictionary: {meaning}", { meaning: p.meaning });
  if (p.source === "abbreviation") return tr("a common abbreviation");
  return tr("the code read as a rock name");
}

export default function LithoSuggestBox({ pBtn }) {
  const { layers, lithoGroups, codeDictionary, addLithoGroup, updateLithoGroup } = useStore();
  const [open, setOpen] = useState(false);
  const [off, setOff] = useState({}); // code -> true: the user's change to the default tick
  const [done, setDone] = useState(null);
  const sug = useMemo(() => (open ? suggestGroups(layers?.litho || [], lithoGroups || [], codeDictionary?.litho || null) : null), [open, layers?.litho, lithoGroups, codeDictionary]);
  const ticked = (p) => (off[p.code] === undefined ? p.tick : !off[p.code]);
  const picks = sug ? sug.proposals.filter(ticked) : [];
  const byGroup = useMemo(() => {
    const m = new Map();
    for (const p of sug?.proposals || []) (m.get(p.groupName + "|" + (p.groupId || "")) || m.set(p.groupName + "|" + (p.groupId || ""), { name: p.groupName, id: p.groupId, list: [] }).get(p.groupName + "|" + (p.groupId || ""))).list.push(p);
    return [...m.values()];
  }, [sug]);
  const apply = () => {
    const plan = groupingPlan(picks);
    for (const a of plan.adds) addLithoGroup({ name: a.name, codes: a.codes });
    for (const e of plan.extends) { const g = (lithoGroups || []).find((x) => x.id === e.id); if (g) updateLithoGroup(e.id, { codes: [...new Set([...(g.codes || []), ...e.codes])] }); }
    setDone({ codes: picks.length, adds: plan.adds.length, ext: plan.extends.length });
    setOpen(false); setOff({});
  };
  if (!(layers?.litho || []).length) return null;
  if (!open) {
    return (
      <div style={{ marginBottom: 8 }}>
        <button type="button" onClick={() => { setOpen(true); setDone(null); }} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 8px" }} title={tr("Propose groups for the ungrouped codes that name the same rock (BAS, Bslt and Basalt), from what each code means. Nothing changes until you apply it.")}>{tr("Suggest groups from the rock names…")}</button>
        {done && <div role="status" style={{ ...box, marginTop: 6, marginBottom: 0 }}>{tr("Grouped {n} codes: {adds} new group(s), {ext} existing group(s) extended.", { n: done.codes.toLocaleString(), adds: done.adds, ext: done.ext })}</div>}
      </div>
    );
  }
  return (
    <div role="group" aria-label={tr("Suggested groups")} style={box}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr("Suggested groups")}</div>
      <div style={{ marginBottom: 6 }}>{tr("Each code is read by what it means: its meaning in the code dictionary, the code as a rock name, then a common abbreviation. A close spelling, or a code whose descriptions name different rocks, starts unticked. Nothing changes until you apply.")}</div>
      {!byGroup.length && <div>{tr("Nothing to suggest: no ungrouped code names a rock that another code names too, or that a group already holds.")}</div>}
      {byGroup.slice(0, SHOWN_GROUPS).map((g) => (
        <div key={g.name + (g.id || "")} style={{ marginBottom: 6 }}>
          <div style={{ fontWeight: 600, color: "var(--color-text)" }}>{g.id ? tr("{name} (existing group)", { name: g.name }) : tr("{name} (new group)", { name: g.name })}</div>
          {g.list.map((p) => (
            <label key={p.code} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginLeft: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={ticked(p)} onChange={(e) => setOff((o) => ({ ...o, [p.code]: !e.target.checked }))} style={{ marginTop: 2 }} />
              <span>
                <b>{p.code}</b> ({p.total.toLocaleString()}) — {sourceText(p)}
                {p.others.length > 0 && <span style={{ color: "var(--color-warn-text)" }}> {tr("Its descriptions also name: {rocks}.", { rocks: p.others.join(", ") })}</span>}
              </span>
            </label>
          ))}
        </div>
      ))}
      {byGroup.length > SHOWN_GROUPS && <div>{tr("({n} more not listed)", { n: byGroup.length - SHOWN_GROUPS })}</div>}
      {sug.unrecognized.length > 0 && <div style={{ marginBottom: 6 }}>{tr("{n} code(s) were not recognized and are left alone: {codes}", { n: sug.unrecognized.length, codes: sug.unrecognized.slice(0, 12).map((u) => u.code).join(", ") + (sug.unrecognized.length > 12 ? ", …" : "") })}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" onClick={apply} disabled={!picks.length} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 8px", opacity: picks.length ? 1 : 0.5 }}>{tr("Apply {n} ticked", { n: picks.length.toLocaleString() })}</button>
        <button type="button" onClick={() => { setOpen(false); setOff({}); }} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "3px 8px" }}>{tr("Close")}</button>
      </div>
    </div>
  );
}
