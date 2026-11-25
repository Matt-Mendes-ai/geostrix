// TASKS.csv #3100 — a BC sample that is not on this computer: BC's copyright terms do not let GeoStrix ship ARIS data, so it says where the
// data come from and how big the download is, asks, downloads it from the Province's public server, converts it (electron/sampleSources.js)
// and opens it. Kept in <userData>/sample_data for next time. Offline, it says so plainly.
import React, { useEffect, useState } from "react";
import StepDialog from "./StepDialog.jsx"; // TASKS.csv #4073 — the shared step shell (Escape and the focus trap)
import { sampleDownload, sampleDownloadCancel, onSampleDownloadProgress } from "../lib/desktop.js";
import { BC_SAMPLE_INFO } from "../lib/bcSamples.js";
import { t as tr } from "../lib/i18n.js";

const mb = (b) => (b / 1048576).toFixed(b < 10 * 1048576 ? 1 : 0);

export default function SampleDownloadModal({ id, onClose, onReady }) {
  const info = BC_SAMPLE_INFO[id];
  const [state, setState] = useState({ phase: "ask" }); // ask | download | convert | error | offline
  const busy = state.phase === "download" || state.phase === "convert";
  const close = () => { if (busy) sampleDownloadCancel(); onClose(); }; // Cancel, the X and Escape (StepDialog's) all stop a download under way
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
  // TASKS.csv #4073 (Matt: "similar for all pop up windows"; "too wordy … cut, don't just cap") — ONE step (one question: download it?): Cancel and
  // Download (the gold primary; Try again after a failure; greyed while it downloads and converts, when Cancel stops it). The licence line and the
  // download (from where, how big, kept on this computer) stay seen in one sentence; the report it comes from and what is done with it are in the Help card.
  // Offline is the step's hint and a failure its error, both under the step. The backdrop does not close it (as before).
  const heading = tr("Download the {name} sample", { name: info.name }); // the dialog's name, seen (a JSX title= would count it as a tooltip)
  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>{tr("BC samples")}</summary>
      <div style={note}>{tr("{name} comes from BC's public assessment report {report}. BC's terms keep it out of the installer, so it is downloaded from the Province's server ({host}, {size} MB), converted and kept on this computer.", { name: info.name, report: info.report, host: info.host, size: mb(info.bytes) })}</div>
    </details>
  );
  const primary = busy ? { label: tr("Downloading…"), disabled: true }
    : { label: state.phase === "ask" ? tr("Download ({size} MB)", { size: mb(info.bytes) }) : tr("Try again"), onClick: start };
  const steps = [
    { key: "download", label: heading, primary, hint: state.phase === "offline" ? tr("No connection to {host}: check this computer's internet connection, then try again.", { host: info.host }) : "", render: () => (
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={text}>{tr("BC's terms keep it out of the installer: it is downloaded from {host} ({size} MB) and kept on this computer.", { host: info.host, size: mb(info.bytes) })}</p>
        {info.note && <p style={note}>{info.note()}</p>}
        {state.phase === "download" && (
          <div style={{ margin: "10px 0 4px" }}>
            <div style={{ height: 6, background: "var(--color-bg-subtle)", borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${Math.round(p * 100)}%`, height: "100%", background: "var(--color-accent)" }} /></div>
            <div style={note}>{tr("Downloading: {got} of {all} MB", { got: mb(state.received || 0), all: mb(state.total || info.bytes) })}</div>
          </div>
        )}
        {state.phase === "convert" && <p style={note}>{tr("Converting the report's files…")}</p>}
      </div>
    ) },
  ];
  return <StepDialog title={heading} onClose={close} steps={steps} at={0} onAt={() => {}} help={help} error={state.phase === "error" ? tr("The download did not work: {error}", { error: state.error || "" }) : null} width="min(520px, 94vw)" />;
}
