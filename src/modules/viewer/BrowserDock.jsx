// TASKS.csv #3906 (the #3901 redesign) — the Browser panel (folders, favourites, databases) at the foot of the StrixViewer sidebar, closed by
// default: a one-line "Browser" row opens it, and the choice is remembered on this computer (localStorage, like its height, #206). A
// beginner adds files with Add data or a drop; the panel waits for those who browse. Moved here from ViewerModule.jsx (its size cap).
import React, { Suspense, useState } from "react";
import { ChevronDown, ChevronRight } from "../../components/icons.js";
import PanelSplitHandle from "../../components/PanelSplitHandle.jsx";
import { useBrowserPanelHeight } from "../../lib/useBrowserPanelHeight.js";
import { activateOnKey } from "../../lib/a11y.js";
import { t as tr } from "../../lib/i18n.js";
const DbBrowserPanel = React.lazy(() => import("../../components/DbBrowserPanel.jsx")); // startup budget (#476): loads when opened

const OPEN_KEY = "geostrix-browser-panel-open";
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) === "1"; } catch (_) { return false; } };

export default function BrowserDock({ onImportFile, onImportRows, onError }) {
  const [height, setHeight] = useBrowserPanelHeight(); // TASKS.csv #206
  const [open, setOpenState] = useState(readOpen);
  const setOpen = (v) => { setOpenState(v); try { localStorage.setItem(OPEN_KEY, v ? "1" : "0"); } catch (_) { /* not kept */ } };
  return (<>
    <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setOpen(!open)} aria-expanded={open} title={open ? tr("Hide the Browser panel") : tr("Show the Browser panel")}
      style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", flexShrink: 0, cursor: "pointer", borderTop: "1px solid var(--color-border)", fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-title)", color: "var(--color-text-secondary)" }}>
      {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{tr("Browser")}
    </div>
    {open && (<>
      <PanelSplitHandle height={height} onResize={setHeight} invert title={tr("Drag to resize the Browser panel")} />
      <div style={{ height, flexShrink: 0 }}>
        <Suspense fallback={null}><DbBrowserPanel onImportFile={onImportFile} onImportRows={onImportRows} onError={onError} /></Suspense>
      </div>
    </>)}
  </>);
}
