// TASKS.csv #2160 (Matt's decision 2026-11-09) — in the import dialog, for a point-depth custom layer: the log channels to import, one
// numeric layer each, units read from the column names; and, when the readings would not fit the memory budget, the bin to average them to.
import React, { useMemo } from "react";
import { logChannelColumns, defaultLogChannels, defaultLogBin, needsBinning } from "../lib/downholeLogChannels.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };

export default function LogChannelsBox({ modal, onChange, sel }) {
  const rows = modal.allRows || modal.sampleRows || [];
  const channels = useMemo(() => logChannelColumns(modal.headers, rows, modal.mapping), [modal.headers, rows, modal.mapping]);
  if (modal.target !== "custom" || !modal.mapping?.depth || modal.mapping?.from || channels.length < 1) return null;
  const ticked = modal.logChannels ?? defaultLogChannels(channels, modal.mapping) ?? [];
  const binM = modal.logBinM !== undefined ? modal.logBinM : defaultLogBin(rows.length, ticked.length);
  const over = needsBinning(rows.length, ticked.length);
  const set = (patch) => onChange({ ...modal, logChannels: ticked, logBinM: binM, ...patch });
  const toggle = (col) => set({ logChannels: ticked.includes(col) ? ticked.filter((c) => c !== col) : [...ticked, col] });
  return (
    <div style={{ marginBottom: 14, border: "1px solid var(--color-border)", borderRadius: 6, padding: "8px 10px" }}>
      <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)", fontWeight: 600 }}>{tr("Downhole log channels")}</div>
      <div style={note}>{tr("Each ticked channel becomes its own numeric layer, named after the column. Untick all to import only the value column above as one layer.")}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", marginTop: 6 }}>
        {channels.map((c) => (
          <label key={c.col} style={{ fontSize: "var(--font-size-sm)", display: "flex", gap: 5, alignItems: "center" }}>
            <input type="checkbox" checked={ticked.includes(c.col)} onChange={() => toggle(c.col)} aria-label={tr("Import channel {c}", { c: c.col })} />
            {c.col}{c.unit ? <span style={{ color: "var(--color-text-muted)" }}>{` (${c.unit})`}</span> : null}
          </label>
        ))}
      </div>
      {ticked.length > 0 && (over || binM) ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ ...note, color: over ? "var(--color-warn-text)" : "var(--color-text-muted)" }}>{over
            ? tr("{n} readings × {k} channel(s) is more than GeoStrix keeps reading by reading on this computer: they are averaged to a bin (mean, with the bin's minimum and maximum kept), stated in the notice and the layer. The file stays the source.", { n: rows.length.toLocaleString(), k: ticked.length })
            : tr("Readings averaged to a bin (mean, with its minimum and maximum).")}</div>
          <select value={binM ?? ""} onChange={(e) => set({ logBinM: e.target.value === "" ? null : Number(e.target.value) })} style={{ ...sel, marginTop: 4 }} aria-label={tr("Log bin")}>
            <option value="0.5">{tr("0.5 m bins")}</option>
            <option value="1">{tr("1 m bins")}</option>
            <option value="">{tr("Every reading (no bins)")}</option>
          </select>
        </div>
      ) : null}
    </div>
  );
}
