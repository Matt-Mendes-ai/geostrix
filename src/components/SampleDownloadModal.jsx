// TASKS.csv #3100 — a BC sample that is not on this computer: BC's copyright terms do not let GeoStrix ship ARIS data, so it says where the
// data come from and how big the download is, asks, downloads it from the Province's public server, converts it (electron/sampleSources.js)
// and opens it. Kept in <userData>/sample_data for next time. Offline, it says so plainly.
import React, { useEffect, useState } from "react";
import { X } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, btn } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { sampleDownload, sampleDownloadCancel, onSampleDownloadProgress } from "../lib/desktop.js";
import { BC_SAMPLE_INFO } from "../lib/bcSamples.js";
import { t as tr } from "../lib/i18n.js";

const mb = (b) => (b / 1048576).toFixed(b < 10 * 1048576 ? 1 : 0);

export default function SampleDownloadModal({ id, onClose, onReady }) {
  const info = BC_SAMPLE_INFO[id];
  const [state, setState] = useState({ phase: "ask" }); // ask | download | convert | error | offline
  const busy = state.phase === "download" || state.phase === "convert";
  const close = () => { if (busy) sampleDownloadCancel(); onClose(); };
  useEscapeKey(close);
  useFocusTrap();
  useEffect(() => onSampleDownloadProgress((d) => { if (d.id !== id) return; setState((s) => (s.phase === "ask" ? s : { ...s, ...d })); }), [id]);
  if (!info) return null;
  const start = async () => {
    setState({ phase: "download", received: 0, total: info.bytes });
    const r = await sampleDownload(id);
    if (r.ok) { onReady(id); return; }
    if (r.cancelled) { onClose(); return; }
    setState({ phase: r.offline ? "offline" : "error", error: r.error });
  };
  const p = state.total ? Math.min(1, (state.received || 0) / state.total) : 0;
  const text = { fontSize: "var(--font-size-base)", color: "var(--color-text)", lineHeight: 1.45, margin: "0 0 8px" };
  const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.4, margin: "0 0 8px" };
  return (
    <div style={overlay}>
      <div role="dialog" aria-modal="true" aria-label={tr("Download the {name} sample", { name: info.name })} onClick={(e) => e.stopPropagation()} style={{ width: "min(520px, 94vw)", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ flex: 1, fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text)" }}>{tr("Download the {name} sample", { name: info.name })}</div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={close} />
        </div>
        <div style={{ padding: "12px 16px" }}>
          <p style={text}>{tr("{name} comes from BC's public assessment report {report}. BC's copyright terms do not let GeoStrix include assessment-report data in the installer, so it is downloaded from the Province's public server ({host}, {size} MB) and converted on this computer. It is kept there for next time.", { name: info.name, report: info.report, host: info.host, size: mb(info.bytes) })}</p>
          {info.note && <p style={note}>{info.note()}</p>}
          {state.phase === "download" && (
            <div style={{ margin: "10px 0 4px" }}>
              <div style={{ height: 6, background: "var(--color-bg-subtle)", borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${Math.round(p * 100)}%`, height: "100%", background: "var(--color-accent)" }} /></div>
              <div style={note}>{tr("Downloading: {got} of {all} MB", { got: mb(state.received || 0), all: mb(state.total || info.bytes) })}</div>
            </div>
          )}
          {state.phase === "convert" && <p style={note}>{tr("Converting the report's files…")}</p>}
          {state.phase === "offline" && <p style={{ ...note, color: "var(--color-warn-text)" }}>{tr("No connection to {host}: check this computer's internet connection, then try again.", { host: info.host })}</p>}
          {state.phase === "error" && <p style={{ ...note, color: "var(--color-danger-fg)" }}>{tr("The download did not work: {error}", { error: state.error || "" })}</p>}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "0 16px 14px" }}>
          <button type="button" onClick={close} style={{ ...btn(false), padding: "7px 14px" }}>{tr("Cancel")}</button>
          {!busy && <button type="button" onClick={start} style={{ ...btn(true), padding: "7px 14px" }}>{state.phase === "ask" ? tr("Download ({size} MB)", { size: mb(info.bytes) }) : tr("Try again")}</button>}
        </div>
      </div>
    </div>
  );
}
