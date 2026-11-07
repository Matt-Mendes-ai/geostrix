// TASKS.csv #1487 — the Templates list's 'On this computer' section: templates kept for every project (userData, the desktop
// app only). Load replaces the page as a project template does; delete asks first.
import React, { useEffect, useState } from "react";
import { HardDrive, Trash2 } from "./icons.js";
import { activateOnKey } from "../lib/a11y.js";
import { confirmDestructive } from "../lib/confirmDestructive.js";
import { hasComputerTemplates } from "../lib/desktop.js";
import { readComputerTemplates, removeComputerTemplate } from "../lib/computerTemplates.js";
import { t as tr } from "../lib/i18n.js";

export default function ComputerTemplates({ onLoad, refreshKey = 0, onMessage }) {
  const [list, setList] = useState(null);
  const [ver, setVer] = useState(0);
  useEffect(() => {
    if (!hasComputerTemplates()) return undefined;
    let live = true;
    readComputerTemplates().then((r) => { if (!live) return; setList(r.list); if (!r.ok) onMessage?.(r.error); });
    return () => { live = false; };
  }, [refreshKey, ver]);
  if (!hasComputerTemplates()) return null;
  const hover = { onMouseEnter: (e) => { e.currentTarget.style.background = "var(--color-hover-bg)"; }, onMouseLeave: (e) => { e.currentTarget.style.background = "transparent"; } };
  return (
    <div aria-label={tr("Templates on this computer")}>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", padding: "6px 7px 2px", borderTop: "1px solid var(--color-border)", marginTop: 4 }}>
        {tr("On this computer (every project)")}
      </div>
      {list && !list.length && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", padding: "2px 7px 4px", lineHeight: 1.4 }}>
        {tr("None yet. Keep one here with the drive icon beside a template saved in this project.")}
      </div>}
      {(list || []).map((t) => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", borderRadius: 4 }} {...hover}>
          <HardDrive size={12} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} aria-hidden="true" />
          <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onLoad(t)} style={{ flex: 1, fontSize: "var(--font-size-base)", color: "var(--color-text)", cursor: "pointer" }}>{t.name}</span>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("{elements} el.", { elements: t.elements.length })}</span>
          <Trash2 role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }}
            aria-label={tr("Delete the template \"{name}\" from this computer", { name: t.name })} title={tr("Delete the template \"{name}\" from this computer", { name: t.name })}
            onClick={async () => {
              if (!confirmDestructive(tr("Delete the template \"{name}\" from this computer? Every project loses it.", { name: t.name }))) return;
              const r = await removeComputerTemplate(t.id);
              if (!r.ok) onMessage?.(r.error);
              setVer((v) => v + 1);
            }} />
        </div>
      ))}
    </div>
  );
}
