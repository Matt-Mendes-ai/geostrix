import React, { useEffect, useState } from "react";
import { X } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { mcpStatus, mcpSetEnabled, mcpSetChanges, mcpStop, mcpForgetClients, mcpConfig, onMcpStatus, copyText, isDesktop } from "../lib/desktop.js";
import { t as tr } from "../lib/i18n.js";
import { changeLog, onChangeLog } from "../lib/mcpChangeLog.js"; // TASKS.csv #3932 — the changes AI apps made this session, each with its Undo

// TASKS.csv #3190 (Matt's decisions, 2026-11-17) — Tools > AI App Access: the switch for the optional, local, read-only Model Context Protocol server (electron/mcpHost.js). Off by default; it
// turns itself off when GeoStrix closes unless 'keep it on' is ticked. The notice says plainly where what an AI app reads goes.
export default function AiAccessModal({ onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const [st, setSt] = useState(null);
  const [remember, setRemember] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [changes, setChanges] = useState(() => changeLog()); // #3932
  useEffect(() => onChangeLog((L) => setChanges(L)), []);
  useEffect(() => { let live = true; mcpStatus().then((s) => { if (live && s) { setSt(s); setRemember(!!s.remember); } }); const off = onMcpStatus((s) => live && setSt(s)); return () => { live = false; off(); }; }, []);
  const on = !!st?.enabled;
  useEffect(() => { if (on) mcpConfig().then(setCfg); else setCfg(null); }, [on]);
  const flip = async (want) => { setMsg(""); const r = await mcpSetEnabled(want, remember); if (!r?.ok) setMsg(r?.error || tr("It could not be switched on.")); };
  const copy = async () => { if (!cfg) return; await copyText(cfg.text); setCopied(true); setTimeout(() => setCopied(false), 2500); };
  const when = (t) => new Date(t).toLocaleTimeString();
  const heading = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", margin: "14px 0 4px" };
  const small = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };
  const act = st?.activity || [];
  return (
    <div style={overlay}>
      <div role="dialog" aria-modal="true" aria-label={tr("AI App Access")} onClick={(e) => e.stopPropagation()} style={{ width: "min(680px, 94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text)" }}>{tr("AI App Access")}</div>
            <div style={small}>{tr("Lets an AI app you already use (Claude Desktop, or any app that speaks the Model Context Protocol) read the project that is open here.")}</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>
        <div style={{ padding: "8px 16px 14px", overflow: "auto" }}>
          {!isDesktop && <div role="status" style={{ ...small, color: "var(--color-warn-text)" }}>{tr("AI App Access needs the desktop app.")}</div>}
          <div role="note" style={{ margin: "6px 0 10px", padding: "8px 10px", border: "1px solid var(--color-warn-border, var(--color-border))", borderRadius: 6, background: "var(--color-bg-subtle)", ...small, color: "var(--color-text)" }}>
            {tr("What the AI app reads goes to it and on to its AI provider (e.g. Anthropic for Claude), under that provider's terms; GeoStrix itself sends nothing over the network. Switch this on only for a project you may share with that provider.")}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-base)", color: "var(--color-text)", cursor: isDesktop ? "pointer" : "default" }}>
            <input type="checkbox" checked={on} disabled={!isDesktop} onChange={(e) => flip(e.target.checked)} aria-label={tr("Let my AI app read this project")} />
            <b>{tr("Let my AI app read this project")}</b>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, ...small }} title={tr("Off: it turns itself off when GeoStrix closes. On: it is still on next time GeoStrix starts.")}>
            <input type="checkbox" checked={remember} disabled={!isDesktop} onChange={(e) => { setRemember(e.target.checked); if (on) mcpSetEnabled(true, e.target.checked); }} aria-label={tr("Keep it on when GeoStrix restarts")} />
            {tr("Keep it on when GeoStrix restarts")}
          </label>
          {/* TASKS.csv #3932 (Matt's decision, 2026-11-21) — the second switch: off by default, only while access is on, off with it (electron/mcpHost.js setChanges) */}
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: "var(--font-size-base)", color: on ? "var(--color-text)" : "var(--color-text-muted)", cursor: on ? "pointer" : "default" }}>
            <input type="checkbox" checked={!!st?.changes} disabled={!isDesktop || !on} onChange={async (e) => { setMsg(""); const r = await mcpSetChanges(e.target.checked); if (!r?.ok) setMsg(r?.error || tr("It could not be switched on.")); }} aria-label={tr("Allow AI apps to make changes")} />
            {tr("Allow AI apps to make changes")}
          </label>
          <div style={{ ...small, marginLeft: 24 }}>{tr("Off by default. When on, the AI app can also colour the holes, show or hide layers, point the view, and add sections, best-intercept sets and Layout pages. Each change shows here and is one Undo step; nothing is deleted, overwritten or saved, and each download is asked for. Turns off with AI App Access.")}</div>
          {msg && <div role="alert" style={{ ...small, color: "var(--color-danger-fg)", marginTop: 6 }}>{msg}</div>}
          <div style={{ ...small, marginTop: 8 }}>{tr("It can list holes, assays, logs and sections and compute grade statistics and best intercepts. It changes nothing unless you also tick 'Allow AI apps to make changes' below, and cannot open files or use any password. It works over a private connection on this computer only (no network port); each AI app is asked about once.")}{/* #3932 — was 'Read-only … It cannot change the project', above the changes switch */}</div>
          {/* TASKS.csv #3932 (Main) — each change an AI app made this session, with its own Undo (the same as its toast's): it is not lost when the toast is dismissed, nor when access is switched off */}
          {changes.length > 0 && (
            <>
              <div style={heading}>{tr("Changes made by AI apps")}</div>
              {changes.slice().reverse().map((c) => (
                <div key={c.id} style={{ ...small, display: "flex", gap: 8, alignItems: "center", color: c.undone ? "var(--color-text-muted)" : "var(--color-text-secondary)" }}>
                  <span style={{ minWidth: 70 }}>{when(c.at)}</span>
                  <span style={{ flex: 1, textDecoration: c.undone ? "line-through" : "none" }}>{c.message}</span>
                  {c.undone ? <span>{tr("Undone")}</span> : c.canUndo ? <button className="gs-btn gs-btn--sm" type="button" onClick={() => c.undo()} title={tr("Undo this change")}>{tr("Undo")}</button> : null}
                </div>
              ))}
            </>
          )}
          {on && (
            <>
              <div style={heading}>{tr("Connect an AI app")}</div>
              <div style={small}>{tr("Add this entry to the AI app's configuration (for Claude Desktop: Settings > Developer > Edit Config), then restart that app.")}</div>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: "var(--font-size-sm)", lineHeight: 1.4, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 5, padding: 8, margin: "6px 0" }}>{cfg?.text || "…"}</pre>
              <button className="gs-btn" type="button" onClick={copy} disabled={!cfg}>{copied ? tr("Copied") : tr("Copy the entry")}</button>
              <div style={heading}>{tr("Connected now")}</div>
              {st.clients?.length ? st.clients.map((c) => <div key={c.name} style={small}>{tr("{name}: connected at {time}, {n} call(s)", { name: c.name, time: when(c.since), n: c.calls })}</div>) : <div style={small}>{tr("No AI app is connected.")}</div>}
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="gs-btn gs-btn--danger" type="button" onClick={() => mcpStop()}>{tr("Stop")}</button>
                {st.allowed?.length > 0 && <button className="gs-btn" type="button" onClick={() => mcpForgetClients()} title={st.allowed.join(", ")}>{tr("Forget the apps I always allowed")}</button>}
              </div>
              <div style={heading}>{tr("What they asked for")}</div>
              {act.length === 0 && <div style={small}>{tr("Nothing yet.")}</div>}
              {act.slice().reverse().slice(0, 30).map((a, i) => (
                <div key={`${a.at}-${i}`} style={{ ...small, display: "flex", gap: 8, color: a.ok ? "var(--color-text-secondary)" : "var(--color-warn-text)" }}>
                  <span style={{ minWidth: 70 }}>{when(a.at)}</span><span style={{ minWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.client}</span>
                  <span style={{ flex: 1 }}>{a.tool || tr("not allowed")}{a.change ? tr(" (change)") : ""}{a.rows != null ? tr(" — {n} row(s)", { n: a.rows }) : ""}{a.refused ? tr(" — refused ({why})", { why: a.refused }) : ""}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
