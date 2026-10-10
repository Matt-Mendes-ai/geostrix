import React, { useRef, useState } from "react";
import { Upload, X } from "./icons.js";
import { arrMin, arrMax } from "../lib/arrayStats.js"; // #371 — no Math.min(...spread)
import { parseBaseStation, diurnalCorrect, suggestClockShift, diurnalSummaryText, formatClock } from "../lib/diurnal.js";

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
      setNote({ warn: true, suggest: sug, text: `None of the rover times (${formatClock(arrMin(times.filter(Number.isFinite)))}–${formatClock(arrMax(times.filter(Number.isFinite)))}) fall inside the base recording${nextBases.length > 1 ? "s" : ""}. Nothing was corrected.${sug ? ` The two clocks may differ: shifting the rover times by ${sug.hours > 0 ? "+" : ""}${sug.hours} h would cover ${sug.covered.toLocaleString("en-US")} of ${sug.of.toLocaleString("en-US")} readings.` : ""}` });
      setPending((p) => { const s = strip(p); return { ...s, valueCol: /_dc$/.test(p.valueCol) ? nextRaw : p.valueCol }; });
      return;
    }
    setNote({ warn: res.outside + res.gaps > 0, text: diurnalSummaryText(res, pending.rows.length) + (nextShift ? ` Rover times shifted by ${nextShift > 0 ? "+" : ""}${nextShift} h.` : "") });
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
      <div style={{ color: "var(--color-text)", fontWeight: 600, marginBottom: 4 }}>Diurnal correction (base station)</div>
      <div style={{ color: "var(--color-text-faint)", fontSize: "var(--font-size-sm)", lineHeight: 1.4, marginBottom: 6 }}>
        Removes the day's magnetic drift using the base-station recording (GEM .tbl / .b, or time + nT text). The corrected channel is added as "{rawCol || "value"}_dc".
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        <span style={{ color: "var(--color-text-faint)", width: 100, flexShrink: 0 }}>Raw reading</span>
        <select value={rawCol} onChange={(e) => { setRawCol(e.target.value); apply(bases, shiftH, e.target.value); }} style={{ ...numInput, width: "auto", flex: 1, minWidth: 0 }}>
          <option value="">(choose a column)</option>
          {pending.columns.filter((c) => !/_dc$/.test(c)).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        <span style={{ color: "var(--color-text-faint)", width: 100, flexShrink: 0 }}>Time</span>
        <select value={timeCol} onChange={(e) => { setTimeCol(e.target.value); apply(bases, shiftH, rawCol, e.target.value); }} style={{ ...numInput, width: "auto", flex: 1, minWidth: 0 }}>
          {timeCols.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {bases.map((b) => (
        <div key={b.name} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: "var(--font-size-sm)" }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.instrument || b.name}>
            {b.name} · {b.date || "no date"} · {formatClock(b.start)}–{formatClock(b.end)} · {b.samples.length.toLocaleString("en-US")} readings{b.lowQuality ? ` (${b.lowQuality} low-quality dropped)` : ""}
          </span>
          <button title="Remove this base" onClick={() => { const next = bases.filter((x) => x !== b); setBases(next); apply(next); }} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 2 }}><X size={12} /></button>
        </div>
      ))}
      <button onClick={() => fileRef.current?.click()} disabled={!rawCol} title={rawCol ? undefined : "Choose the raw reading column first"} style={{ ...pBtn, marginTop: 6, marginBottom: 0, opacity: rawCol ? 1 : 0.5 }}>
        <Upload size={14} /> {bases.length ? "Add another base file…" : "Load base-station file(s)…"}
      </button>
      <input ref={fileRef} type="file" multiple accept=".tbl,.b,.txt,.xyz,.dat,.csv" style={{ display: "none" }}
        onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ""; if (fs.length) addFiles(fs); }} />
      {note && (
        <div style={{ marginTop: 6, fontSize: "var(--font-size-sm)", lineHeight: 1.45, color: note.warn ? "var(--color-warn-text)" : "var(--color-text-secondary)" }}>
          {note.text}
          {note.suggest && (
            <button onClick={() => { setShiftH(note.suggest.hours); apply(bases, note.suggest.hours); }} style={{ ...pBtn, marginTop: 4, marginBottom: 0 }}>
              Shift rover times by {note.suggest.hours > 0 ? "+" : ""}{note.suggest.hours} h
            </button>
          )}
        </div>
      )}
    </div>
  );
}
