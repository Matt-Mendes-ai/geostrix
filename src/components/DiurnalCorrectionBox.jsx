import React, { useRef, useState } from "react";
import { Upload, X } from "./icons.js";
import { arrMin, arrMax } from "../lib/arrayStats.js"; // #371 — no Math.min(...spread)
import { parseBaseStation, diurnalCorrect, suggestClockShift, diurnalSummaryText, formatClock } from "../lib/diurnal.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

// TASKS.csv #610 — diurnal correction step inside the .xyz column picker (GeophysicsModule). Shown when the rover
// file has a clock-time column. Loading base-station file(s) adds a "<raw>_dc" channel to the pending rows and
// selects it as the Value; removing every base removes the channel again. All maths is in lib/diurnal.js.
//   pending: the picker's xyzPending ({ rows, columns, valueCol, header: gemHeaderInfo(...) , ... })
//   setPending: its setter
export default function DiurnalCorrectionBox({ pending, setPending, numInput, pBtn }) {
  const fileRef = useRef(null);
  const [bases, setBases] = useState([]);
  const [rawCol, setRawCol] = useState(() => pending.valueCol || "");
  const [shiftH, setShiftH] = useState(0);
  const [note, setNote] = useState(null); // { warn, text }
  const timeCols = pending.columns.filter((c) => /time/i.test(c));
  const [timeCol, setTimeCol] = useState(timeCols.find((c) => /^time$/i.test(c)) || timeCols[0] || "");
  const roverDate = pending.header?.date || null;

  const apply = (nextBases, nextShift = shiftH, nextRaw = rawCol, nextTime = timeCol) => {
    const outCol = `${nextRaw}_dc`;
    const strip = (p) => ({ ...p, columns: p.columns.filter((c) => !/_dc$/.test(c)), rows: p.rows.map((r) => { const o = { ...r }; for (const k of Object.keys(o)) if (/_dc$/.test(k)) delete o[k]; return o; }) });
    if (!nextBases.length || !nextRaw || !nextTime) {
      setPending((p) => { const s = strip(p); return { ...s, valueCol: /_dc$/.test(p.valueCol) ? nextRaw : p.valueCol }; });
      setNote(null);
      return;
    }
    const times = pending.rows.map((r) => r[nextTime]);
    const raw = pending.rows.map((r) => r[nextRaw]);
    const res = diurnalCorrect(times, raw, nextBases, { timeShiftSec: nextShift * 3600 });
    if (!res.used) {
      const sug = suggestClockShift(times, nextBases);
      setNote({ warn: true, suggest: sug, text: tr(nextBases.length > 1 ? "None of the rover times ({v}–{v2}) fall inside the base recordings. Nothing was corrected.{v4}" : "None of the rover times ({v}–{v2}) fall inside the base recording. Nothing was corrected.{v4}", { v: formatClock(arrMin(times.filter(Number.isFinite))), v2: formatClock(arrMax(times.filter(Number.isFinite))), v4: sug ? tr(" The two clocks may differ: shifting the rover times by {v}{hours} h would cover {covered} of {of} readings.", { v: sug.hours > 0 ? "+" : "", hours: sug.hours, covered: sug.covered.toLocaleString("en-US"), of: sug.of.toLocaleString("en-US") }) : "" }) });
      setPending((p) => { const s = strip(p); return { ...s, valueCol: /_dc$/.test(p.valueCol) ? nextRaw : p.valueCol }; });
      return;
    }
    setNote({ warn: res.outside + res.gaps > 0, text: diurnalSummaryText(res, pending.rows.length) + (nextShift ? tr(" Rover times shifted by {v}{nextShift} h.", { v: nextShift > 0 ? "+" : "", nextShift }) : "") });
    setPending((p) => {
      const s = strip(p);
      return { ...s, columns: [...s.columns, outCol], rows: s.rows.map((r, i) => ({ ...r, [outCol]: res.corrected[i] })), valueCol: outCol, diurnalNote: diurnalSummaryText(res, p.rows.length) };
    });
  };

  const addFiles = async (files) => {
    const next = [...bases];
    const skipped = [];
    for (const f of files) {
      try {
        const b = parseBaseStation(await f.text(), { name: f.name });
        // a base from another day would "correct" with the wrong day's field — refused, never silently used
        if (roverDate && b.date && b.date !== roverDate) { skipped.push(`${f.name} is from ${b.date}, the rover file from ${roverDate}`); continue; }
        if (!next.some((x) => x.name === b.name)) next.push(b);
      } catch (err) { skipped.push(err.message); }
    }
    setBases(next);
    apply(next);
    if (skipped.length) setNote((n) => ({ warn: true, text: `${n?.text ? n.text + " " : ""}Not used: ${skipped.join("; ")}.` }));
  };

  if (!timeCols.length) return null;
  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--color-border)" }}>
      <div style={{ color: "var(--color-text)", fontWeight: 600, marginBottom: 4 }}>{tr("Diurnal correction (base station)")}</div>
      <div style={{ color: "var(--color-text-faint)", fontSize: "var(--font-size-sm)", lineHeight: 1.4, marginBottom: 6 }}>{tr("Removes the day's magnetic drift using the base-station recording (GEM .tbl / .b, or time + nT text). The corrected channel is added as \"{v}_dc\".", { v: rawCol || tr("value") })}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        <span style={{ color: "var(--color-text-faint)", width: 100, flexShrink: 0 }}>{tr("Raw reading")}</span>
        <select value={rawCol} onChange={(e) => { setRawCol(e.target.value); apply(bases, shiftH, e.target.value); }} style={{ ...numInput, width: "auto", flex: 1, minWidth: 0 }}>
          <option value="">{tr("(choose a column)")}</option>
          {pending.columns.filter((c) => !/_dc$/.test(c)).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        <span style={{ color: "var(--color-text-faint)", width: 100, flexShrink: 0 }}>{tr("Time")}</span>
        <select value={timeCol} onChange={(e) => { setTimeCol(e.target.value); apply(bases, shiftH, rawCol, e.target.value); }} style={{ ...numInput, width: "auto", flex: 1, minWidth: 0 }}>
          {timeCols.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {bases.map((b) => (
        <div key={b.name} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: "var(--font-size-sm)" }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.instrument || b.name}>
            {tr("{name} · {v} · {v2}–{v3} · {samples} readings{v4}", { name: b.name, v: b.date || tr("no date"), v2: formatClock(b.start), v3: formatClock(b.end), samples: b.samples.length.toLocaleString("en-US"), v4: b.lowQuality ? tr(" ({lowQuality} low-quality dropped)", { lowQuality: b.lowQuality }) : "" })}
          </span>
          <button title={tr("Remove this base")} onClick={() => { const next = bases.filter((x) => x !== b); setBases(next); apply(next); }} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 2 }}><X size={12} /></button>
        </div>
      ))}
      <button onClick={() => fileRef.current?.click()} disabled={!rawCol} title={rawCol ? undefined : tr("Choose the raw reading column first")} style={{ ...pBtn, marginTop: 6, marginBottom: 0, opacity: rawCol ? 1 : 0.5 }}>
        <Upload size={14} /> {bases.length ? tr("Add another base file…") : tr("Load base-station file(s)…")}
      </button>
      <input ref={fileRef} type="file" multiple accept=".tbl,.b,.txt,.xyz,.dat,.csv" style={{ display: "none" }}
        onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ""; if (fs.length) addFiles(fs); }} />
      {note && (
        <div style={{ marginTop: 6, fontSize: "var(--font-size-sm)", lineHeight: 1.45, color: note.warn ? "var(--color-warn-text)" : "var(--color-text-secondary)" }}>
          {note.text}
          {note.suggest && (
            <button onClick={() => { setShiftH(note.suggest.hours); apply(bases, note.suggest.hours); }} style={{ ...pBtn, marginTop: 4, marginBottom: 0 }}>{tr("Shift rover times by {v}{hours} h", { v: note.suggest.hours > 0 ? "+" : "", hours: note.suggest.hours })}</button>
          )}
        </div>
      )}
    </div>
  );
}
