import React, { useEffect, useMemo, useState } from "react";
import { X } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

// TASKS.csv #639 — Help → Third-party licences: GeoStrix's own MIT licence, then every package it ships (the app's
// JavaScript and the Python engine's), each with its licence and full text. The list is generated at build time by
// scripts/third-party-licenses.mjs (public/licenses/third-party.json) and loaded only when this window opens.
export default function LicensesModal({ onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null); // "js:name" | "py:name" | "own"
  const [addon, setAddon] = useState(null); // TASKS.csv #669 — what the installed predictive add-on ships (desktop only)
  useEffect(() => { window.desktop?.addonNotices?.("geoml").then(setAddon).catch(() => {}); }, []);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}licenses/third-party.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(tr("HTTP {status}", { status: r.status }))))).then(setData).catch((e) => setError(e.message));
  }, []);
  const filter = (list) => (q.trim() ? list.filter((p) => `${p.name} ${p.license}`.toLowerCase().includes(q.trim().toLowerCase())) : list);
  const js = useMemo(() => (data ? filter(data.javascript) : []), [data, q]);
  const py = useMemo(() => (data ? filter(data.python) : []), [data, q]);

  const row = (kind, p) => {
    const key = `${kind}:${p.name}`, isOpen = open === key;
    return (
      <div key={key} style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setOpen(isOpen ? null : key)} style={{ display: "flex", gap: 10, padding: "5px 4px", cursor: "pointer", alignItems: "baseline" }}>
          <span style={{ flex: 1, minWidth: 0, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name} <span style={{ color: "var(--color-text-muted)" }}>{p.version}</span></span>
          <span style={{ color: /GPL|EUPL|MPL/i.test(p.license) ? "var(--color-warn-text)" : "var(--color-text-secondary)", fontSize: "var(--font-size-sm)", maxWidth: 260, textAlign: "right" }}>{p.license}</span>
        </div>
        {isOpen && (
          <div style={{ padding: "0 4px 8px" }}>
            {p.url && <div style={{ fontSize: "var(--font-size-sm)", marginBottom: 4, wordBreak: "break-all", color: "var(--color-text-secondary)" }}>{p.url}</div>}
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, lineHeight: 1.4, maxHeight: 260, overflow: "auto", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 5, padding: 8, margin: 0 }}>{p.text || tr("No licence file was included with this package; its licence is the one named above.")}</pre>
          </div>
        )}
      </div>
    );
  };
  const heading = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", margin: "14px 0 4px" };
  return (
    <div style={overlay}>
      <div role="dialog" aria-modal="true" aria-label={tr("Third-party licences")} onClick={(e) => e.stopPropagation()} style={{ width: "min(760px, 94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text)" }}>{tr("Licences")}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("GeoStrix is free software (MIT). It is built on the open-source packages below — click one to read its licence.")}</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>
        <div style={{ padding: "8px 16px 14px", overflow: "auto" }}>
          {error && <div style={{ color: "var(--color-danger-fg)" }}>{tr("The licence list could not be loaded ({error}).", { error })}</div>}
          {!data && !error && <div style={{ color: "var(--color-text-muted)" }}>{tr("Loading…")}</div>}
          {data && (
            <>
              <div style={heading}>{tr("GeoStrix")}</div>
              {row("own", { name: tr("GeoStrix"), version: "", license: data.geostrix.license, text: data.geostrix.text, url: tr("https://github.com/Matt-Mendes-ai/geostrix") })}
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Filter by name or licence…")} aria-label={tr("Filter licences")} style={{ width: "100%", boxSizing: "border-box", marginTop: 12, padding: "5px 8px", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)", color: "var(--color-text)" }} />
              <div style={heading}>{tr("Desktop app ({js})", { js: js.length })}</div>
              {js.map((p) => row("js", p))}
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "6px 4px" }}>{tr("Electron includes Chromium; its full licence list is the file LICENSES.chromium.html in GeoStrix's installation folder.")}</div>
              <div style={heading}>{tr("Python engine ({py})", { py: py.length })}</div>
              {data.pythonNote && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{data.pythonNote}</div>}
              {py.map((p) => row("py", p))}
              {addon?.available && (
                <>
                  <div style={heading}>{tr("Add-ons")}</div>
                  {!addon.installed && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("{name} ({licence}) is not installed. Once it is, its own licence and the licences of the components it ships are listed here.", { name: addon.name, licence: addon.licence })}</div>}
                  {addon.installed && row("addon", { name: addon.name, version: addon.version, license: addon.licence, text: [addon.source, addon.licenceText].filter(Boolean).join("\n\n") || null, url: tr("https://github.com/Matt-Mendes-ai/geostrix/tree/master/addons/geoml") })}
                  {addon.installed && addon.licences && row("addon-tp", { name: tr("{name}: third-party components", { name: addon.name }), version: "", license: tr("various (see text)"), text: addon.licences })}
                  {addon.installed && !addon.licences && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "6px 4px" }}>{tr("This installed version ({version}) does not include its component list (TensorFlow, NumPy, SciPy and others); add-on versions after 0.1.0 do. Its source is at github.com/Matt-Mendes-ai/geostrix, folder addons/geoml.", { version: addon.version })}</div>}
                </>
              )}
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "8px 4px 0" }}>{tr("GemPy and gempy_engine are EUPL-1.2 (a copyleft licence): their source is at github.com/gempy-project. List generated {generated}.", { generated: data.generated })}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
