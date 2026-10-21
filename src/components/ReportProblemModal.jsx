// TASKS.csv #598 — Help > Report a problem. Matt (2026-10-03): "a tool in the help menu that they can send me a
// message directly, add screenshots or videos of the bug/crash and describe what they were doing". No server
// (offline + privacy pillars): GeoStrix builds a zip in the user's Downloads folder — their description, a picture
// of the window, their own screenshots / videos, system facts, recent errors, the Python engine's log, and the
// project only if they tick it — then opens their email app addressed to support@geostrix.com, asking them to
// attach the zip (a mailto: link cannot attach files). Nothing is sent by GeoStrix itself.
import React, { useEffect, useMemo, useState } from "react";
import { X, Bug, Paperclip, FolderOpen, Mail } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { useStore } from "../lib/store.jsx";
import { problemReportInfo, saveProblemReport, emailSupport, showReportFile, SUPPORT_EMAIL } from "../lib/desktop.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

const EMAIL_LIMIT = 20 * 1e6; // most mail services refuse attachments above ~20-25 MB
const MAX_ATTACH = 100 * 1e6;
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
const fmtMB = (b) => `${(b / 1e6).toFixed(b < 1e7 ? 1 : 0)} MB`;

export default function ReportProblemModal({ screenshot, crashed = false, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const { getProjectPayload, project } = useStore();
  const [what, setWhat] = useState(crashed ? "GeoStrix closed unexpectedly." : "");
  const [steps, setSteps] = useState("");
  const [includeShot, setIncludeShot] = useState(!!screenshot);
  const [includeLog, setIncludeLog] = useState(true);
  const [includeProject, setIncludeProject] = useState(false);
  const [files, setFiles] = useState([]);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // { name, path }
  const [error, setError] = useState(null);
  useEffect(() => { problemReportInfo().then(setInfo).catch(() => setInfo({})); }, []);
  const shotUrl = useMemo(() => (screenshot ? URL.createObjectURL(new Blob([screenshot], { type: "image/png" })) : null), [screenshot]);
  useEffect(() => () => { if (shotUrl) URL.revokeObjectURL(shotUrl); }, [shotUrl]);
  const attachBytes = files.reduce((t, f) => t + f.size, 0);
  const errors = (typeof window !== "undefined" && window.__geostrixErrors) || [];
  const version = info?.app || "?";

  const build = async () => {
    if (!what.trim()) { setError(tr("Say briefly what went wrong first.")); return; }
    if (attachBytes > MAX_ATTACH) { setError(tr("The attachments are {v} — over 100 MB. Leave the largest video out and share it through a cloud link in the email instead.", { v: fmtMB(attachBytes) })); return; }
    setBusy(true); setError(null);
    try {
      const fileData = [];
      for (const f of files) fileData.push({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
      const { buildProblemReport, problemReportEmail } = await import("../lib/problemReport.js");
      const { bytes } = buildProblemReport({ what, steps, crashed, info, screenshot, includeShot, includeLog, includeProject, projectPayload: includeProject ? getProjectPayload() : null, files: fileData, errors, project, userAgent: navigator.userAgent });
      const res = await saveProblemReport(bytes, `GeoStrix-report-${stamp()}.zip`);
      if (!res?.ok) throw new Error(res?.error || tr("The report could not be saved."));
      const { subject, body } = problemReportEmail({ what, steps, version, fileName: res.name, bytes: bytes.length, emailLimit: EMAIL_LIMIT });
      await emailSupport(subject, body);
      setDone({ name: res.name, path: res.path, size: bytes.length });
    } catch (err) {
      setError(err.message || String(err));
    } finally { setBusy(false); }
  };

  const lbl = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "block", marginBottom: 4 };
  const area = { width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: "var(--font-size-base)", padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 5, resize: "vertical" };
  const chk = { display: "flex", alignItems: "flex-start", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6 };
  const btn = (primary) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6, cursor: "pointer", fontSize: "var(--font-size-base)", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border)", background: primary ? "var(--color-success-bg)" : "var(--color-bg)", color: primary ? "var(--color-success-text)" : "var(--color-text)" });

  return (
    <div style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="rp-title" style={{ background: "var(--color-bg)", borderRadius: 10, width: "min(620px, 94vw)", maxHeight: "90vh", overflow: "auto", boxShadow: "0 18px 50px rgba(0,0,0,.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 18px", borderBottom: "1px solid var(--color-border)" }}>
          <Bug size={18} aria-hidden="true" />
          <div id="rp-title" style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, flex: 1 }}>{tr("Report a problem")}</div>
          <button type="button" onClick={onClose} aria-label={tr("Close")} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} /></button>
        </div>
        {done ? (
          <div style={{ padding: 18, fontSize: "var(--font-size-base)", lineHeight: 1.5 }}>
            <p style={{ marginTop: 0 }}><strong>{tr("Saved {name}", { name: done.name })}</strong>{" "}{tr("({v}) in your Downloads folder, and your email app should have opened a message to {SUPPORT_EMAIL}.", { v: fmtMB(done.size), SUPPORT_EMAIL })}</p>
            <p><strong>{tr("Attach the file to that email before you send it")}</strong>{" "}{tr("— GeoStrix can't attach it for you.{v}", { v: done.size > EMAIL_LIMIT ? tr(" It is too big for most email services: upload it to a cloud drive and paste the link into the email instead.") : "" })}</p>
            <p style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{tr("No email app? Write to {SUPPORT_EMAIL} from your webmail and attach the file.", { SUPPORT_EMAIL })}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {done.path && <button type="button" style={btn(false)} onClick={() => showReportFile(done.path)}><FolderOpen size={14} />{" "}{tr("Show the file")}</button>}
              <button type="button" style={btn(false)} onClick={() => emailSupport(`GeoStrix ${version} — problem report`, `${what.trim()}\n\n---\nPlease attach ${done.name} (in your Downloads folder).`)}><Mail size={14} />{" "}{tr("Open the email again")}</button>
              <button type="button" style={btn(true)} onClick={onClose}>{tr("Done")}</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 18 }}>
            <p style={{ marginTop: 0, fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
              {tr("{v}What you write here goes, with the details below, into a .zip in your Downloads folder, and an email opens to {SUPPORT_EMAIL} — you attach the file and send it. Nothing is sent without you.", { v: crashed ? tr("GeoStrix didn't close normally last time. ") : "", SUPPORT_EMAIL })}</p>
            <label style={lbl} htmlFor="rp-what">{tr("What went wrong? *")}</label>
            <textarea id="rp-what" rows={3} value={what} onChange={(e) => setWhat(e.target.value)} style={area} placeholder={tr("e.g. The grade shell never finishes; the window can't be clicked after an import")} autoFocus />
            <label style={{ ...lbl, marginTop: 10 }} htmlFor="rp-steps">{tr("What were you doing just before? (steps help a lot)")}</label>
            <textarea id="rp-steps" rows={3} value={steps} onChange={(e) => setSteps(e.target.value)} style={area} placeholder={tr("1. Imported collars.csv 2. Opened Grade shell 3. Clicked Generate…")} />

            <div style={{ marginTop: 12 }}>
              <div style={lbl}>{tr("Include")}</div>
              <label style={chk}><input type="checkbox" checked={includeShot && !!screenshot} disabled={!screenshot} onChange={(e) => setIncludeShot(e.target.checked)} style={{ marginTop: 2 }} />
                <span>{tr("A picture of the GeoStrix window{v}", { v: screenshot ? "" : tr(" (not available here)") })}{shotUrl && includeShot ? <img src={shotUrl} alt={tr("The GeoStrix window as it will be attached")} style={{ display: "block", maxWidth: 220, marginTop: 4, border: "1px solid var(--color-border)", borderRadius: 4 }} /> : null}</span></label>
              <label style={chk}><input type="checkbox" checked={includeLog && !!info?.sidecarLogTail} disabled={!info?.sidecarLogTail} onChange={(e) => setIncludeLog(e.target.checked)} style={{ marginTop: 2 }} />
                <span>{tr("The Python engine's recent log{v} — can show file names and folders from your computer", { v: info && !info.sidecarLogTail ? tr(" (none yet)") : "" })}</span></label>
              <label style={chk}><input type="checkbox" checked={includeProject} onChange={(e) => setIncludeProject(e.target.checked)} style={{ marginTop: 2 }} />
                <span><strong>{tr("The current project")}</strong>{" "}{tr("— off by default: it contains your data (holes, assays, locations). Only tick it if you're happy to share them.")}</span></label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                <label style={{ ...btn(false), position: "relative" }}>
                  <Paperclip size={14} />{" "}{tr("Add screenshots or videos…")}<input type="file" multiple accept="image/*,video/*,.txt,.log,.csv" onChange={(e) => { setFiles((p) => [...p, ...Array.from(e.target.files || [])]); e.target.value = ""; }} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} aria-label={tr("Add screenshots or videos")} />
                </label>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Record the screen with Win + Alt + R or the Snipping Tool.")}</span>
              </div>
              {files.length > 0 && (
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: "var(--font-size-sm)" }}>
                  {files.map((f, i) => <li key={`${f.name}-${i}`}>{f.name} ({fmtMB(f.size)}) <button type="button" onClick={() => setFiles((p) => p.filter((_, k) => k !== i))} aria-label={tr("Remove {name}", { name: f.name })} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-danger-icon)" }}>{tr("remove")}</button></li>)}
                </ul>
              )}
              {attachBytes > EMAIL_LIMIT && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", marginTop: 6 }}>{tr("Attachments add up to {v} — over what most email services accept (~20 MB). The report will still be made; you may need to share it through a cloud link.", { v: fmtMB(attachBytes) })}</div>}
              <details style={{ marginTop: 8, fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
                <summary style={{ cursor: "pointer" }}>{tr("Always included: system details and recent errors")}</summary>
                <div style={{ marginTop: 4, lineHeight: 1.5 }}>{tr("GeoStrix {version}{v}{v2}{v3}{v4}. {v5} No passwords, no account details.", { version, v: info?.os ? ` · ${info.os}` : "", v2: info?.memoryGB ? tr(" · {total} GB RAM", { total: info.memoryGB.total }) : "", v3: info?.cpu ? ` · ${info.cpu}` : "", v4: info?.display ? ` · display ${info.display}` : "", v5: errors.length ? tr("{errors} error(s) recorded this session.", { errors: errors.length }) : tr("No errors recorded this session.") })}</div>
              </details>
            </div>
            {error && <div role="alert" style={{ marginTop: 10, color: "var(--color-danger-fg)", fontSize: "var(--font-size-sm)" }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" style={btn(true)} onClick={build} disabled={busy}>{busy ? tr("Making the report…") : <><Mail size={14} />{" "}{tr("Create report & open email")}</>}</button>
              <button type="button" style={btn(false)} onClick={onClose}>{tr("Cancel")}</button>
              <a href={`https://github.com/Matt-Mendes-ai/geostrix/issues/new?title=${encodeURIComponent(what.trim().slice(0, 80))}&body=${encodeURIComponent(`${what.trim()}\n\n**What I was doing**\n${steps.trim()}\n\nGeoStrix ${version}`)}`} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: "var(--font-size-sm)" }}>{tr("Or report it on GitHub (public)")}</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
