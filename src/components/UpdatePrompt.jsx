// TASKS.csv #915 — "Let's make a pop up window show up at the center of the app notifying to update if the version is
// old" (Matt). The status-bar notice (#37) was easy to miss; this dialog follows the same updater events: "available"
// (download, or for the portable zip the releases page), "downloading" (progress), "downloaded" (restart and install -
// main.js asks about unsaved work first, #461). "Later" hides it for this session; the status-bar notice stays.
import React from "react";
import { X, Download, RefreshCw } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { overlay, panel, header, btn } from "../lib/modalStyles.js";
import { downloadUpdate, installUpdate } from "../lib/desktop.js";
import { version as APP_VERSION } from "../../package.json";
import { t as tr } from "../lib/i18n.js";

const RELEASES = "https://github.com/Matt-Mendes-ai/geostrix/releases";

export default function UpdatePrompt({ updater, onLater }) {
  useEscapeKey(onLater);
  const { event, version } = updater;
  const notes = version ? `${RELEASES}/tag/v${version}` : `${RELEASES}/latest`;
  const small = { fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", lineHeight: 1.5 };
  return (
    <div style={overlay}>
      <div style={panel({ width: 440 })} role="dialog" aria-modal="true" aria-label={tr("Update available")}>
        <div style={header}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-text)", fontSize: "var(--font-size-lg)", fontWeight: 600 }}>
            <RefreshCw size={16} />{" "}{event === "downloaded" ? tr("Update ready to install") : tr("Update available")}
          </span>
          <X role="button" tabIndex={0} size={16} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onLater} aria-label={tr("Later")} />
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ ...small, color: "var(--color-text)" }}>
            {tr("GeoStrix v{v} is available. You have v{current}.", { v: version || "?", current: APP_VERSION })}{" "}
            <a href={notes} target="_blank" rel="noreferrer">{tr("What's new")}</a>
          </div>
          {event === "available" && updater.portable && (
            <div style={small}>{tr("This is the portable (zip) copy: download the new zip and replace this folder with it. Your projects are separate files and are not touched.")}</div>
          )}
          {event === "available" && !updater.portable && (
            <div style={small}>{tr("It downloads in the background while you keep working; GeoStrix then restarts to install it, asking about unsaved work first.")}</div>
          )}
          {event === "downloading" && (
            <div>
              <div style={small}>{tr("Downloading… {p}%", { p: updater.percent || 0 })}</div>
              <div style={{ height: 6, borderRadius: 3, background: "var(--color-bg-subtle)", overflow: "hidden", marginTop: 6 }}>
                <div style={{ height: "100%", width: `${updater.percent || 0}%`, background: "var(--color-accent)", transition: "width 0.3s" }} />
              </div>
            </div>
          )}
          {event === "downloaded" && (
            <div style={small}>{tr("Restart now to install it. Later keeps the install button in the status bar for this session.")}</div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onLater} style={{ ...btn(false), padding: "7px 14px" }}>{tr("Later")}</button>
            {event === "available" && (updater.portable
              ? <a href={`${RELEASES}/latest`} target="_blank" rel="noreferrer" onClick={onLater} style={{ ...btn(true), padding: "7px 14px", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}><Download size={14} />{" "}{tr("Download the new zip")}</a>
              : <button onClick={() => downloadUpdate()} style={{ ...btn(true), padding: "7px 14px", display: "flex", alignItems: "center", gap: 6 }}><Download size={14} />{" "}{tr("Download and install")}</button>)}
            {event === "downloaded" && <button onClick={() => installUpdate()} style={{ ...btn(true), padding: "7px 14px", display: "flex", alignItems: "center", gap: 6 }}><RefreshCw size={14} />{" "}{tr("Restart and install")}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
