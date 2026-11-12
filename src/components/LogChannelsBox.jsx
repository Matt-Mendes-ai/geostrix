// TASKS.csv #2160 (Matt's decision 2026-11-09) — in the import dialog, for a point-depth custom layer: the log channels to import, one
// numeric layer each, units read from the column names; and, when the readings would not fit the memory budget, the bin to average them to.
import React, { useMemo } from "react";
import { logChannelColumns, defaultLogChannels, effectiveLogBin, logBoxPatch, needsBinning, looksLikeLogTable, channelNoData, noDataText, rawLogMB } from "../lib/downholeLogChannels.js"; // no-data: TASKS.csv #2332; effectiveLogBin / logBoxPatch: #2333
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };

export default function LogChannelsBox({ modal, onChange, sel }) {
  const rows = modal.allRows || modal.sampleRows || [];
  const channels = useMemo(() => logChannelColumns(modal.headers, rows, modal.mapping), [modal.headers, rows, modal.mapping]);
  const point = modal.mapping?.depth && !modal.mapping?.from, interval = !modal.mapping?.depth && modal.mapping?.from && modal.mapping?.to && looksLikeLogTable(modal.headers, rows); // interval: TASKS.csv #2329; rows: #2884
  const shown = modal.target === "custom" && !!(point || interval) && channels.length >= 1;
  const ticked = (shown && (modal.logChannels ?? defaultLogChannels(channels, modal.mapping))) || [];
  // TASKS.csv #2332 — per ticked channel, the values that look like no-data codes; left out unless the user keeps them (a hook: before the
  // early return, so the hook count never changes when the box appears)
  const noData = useMemo(() => ticked.map((col) => { const ch = channels.find((c) => c.col === col); const nd = channelNoData(rows, col, ch?.unit || ""); return nd ? { col, nd } : null; }).filter(Boolean), [ticked.join("\u0001"), rows, channels]);
  if (!shown) return null;
  const binM = effectiveLogBin(modal, rows.length, ticked.length); // #2333 — follows the ticked channels until the bin menu is used
  const over = needsBinning(rows.length, ticked.length);
  const set = (patch) => onChange(logBoxPatch(modal, ticked, patch));
  const toggle = (col) => set({ logChannels: ticked.includes(col) ? ticked.filter((c) => c !== col) : [...ticked, col] });
  return (
    <div style={{ marginBottom: 14, border: "1px solid var(--color-border)", borderRadius: 6, padding: "8px 10px" }}>
      <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)", fontWeight: 600 }}>{tr("Downhole log channels")}</div>
      <div style={note}>{tr("Each ticked channel becomes its own numeric layer, named after the column. Untick all to import only the value column above as one layer.")}</div>
      {noData.length > 0 && ( // #2332
        <div style={{ ...note, color: "var(--color-warn-text)", marginTop: 4 }}>
          {noData.map(({ col, nd }) => <div key={col}>{tr("{col}: {n} value(s) look like no-data codes ({codes}): a null sentinel, a negative {unit}, or more than 1,000 times the channel's 99th percentile.", { col, n: nd.n.toLocaleString(), codes: noDataText(nd), unit: channels.find((c) => c.col === col)?.unit || tr("value") })}</div>)}
          <label style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 3, color: "var(--color-text)" }}><input type="checkbox" checked={!modal.logKeepNoData} onChange={(e) => set({ logKeepNoData: !e.target.checked })} />{tr("Leave them out (said in the notice and the layer notes)")}</label>
        </div>
      )}
      {!modal.mapping?.depth && modal.mapping?.from && modal.mapping?.to && <div style={note}>{tr("Each reading is placed at the middle of its From–To interval ({from} to {to}): a log at short steps, not intervals of a rock unit.", { from: modal.mapping.from, to: modal.mapping.to })}</div>}{/* TASKS.csv #2329 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", marginTop: 6 }}>
        {channels.map((c) => (
          <label key={c.col} style={{ fontSize: "var(--font-size-sm)", display: "flex", gap: 5, alignItems: "center" }}>
            <input type="checkbox" checked={ticked.includes(c.col)} onChange={() => toggle(c.col)} aria-label={tr("Import channel {c}", { c: c.col })} />
            {c.col}{c.unit ? <span style={{ color: "var(--color-text-muted)" }}>{` (${c.unit})`}</span> : null}
          </label>
        ))}
      </div>
      {ticked.length > 0 ? ( /* #2333 — the bin menu always, the budget text only over it; the text says what the menu holds */
        <div style={{ marginTop: 8 }}>
          <div style={{ ...note, color: over && binM ? "var(--color-warn-text)" : "var(--color-text-muted)" }}>{over && binM
            ? tr("{n} readings × {k} channel(s) is more than GeoStrix keeps reading by reading on this computer: they are averaged to a bin (mean, with the bin's minimum and maximum kept), stated in the notice and the layer. The file stays the source.", { n: rows.length.toLocaleString(), k: ticked.length })
            : over ? tr("{n} readings × {k} channel(s) is more than GeoStrix keeps reading by reading on this computer, and every reading is chosen: about {mb} MB of memory, and the import may be slow or run out of memory. A bin averages them.", { n: rows.length.toLocaleString(), k: ticked.length, mb: rawLogMB(rows.length, ticked.length).toLocaleString() })
            : binM ? tr("Readings averaged to a bin (mean, with its minimum and maximum).")
            : tr("Every reading is kept (about {mb} MB of memory). A bin averages them (mean, with its minimum and maximum).", { mb: rawLogMB(rows.length, ticked.length).toLocaleString() })}</div>{/* the MB: TASKS.csv #2430 */}
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
