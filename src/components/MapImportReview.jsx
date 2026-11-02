// TASKS.csv #1325 — what a batch of map files holds, sorted (lib/mapImportReview.js), before anything lands on the map. Only map layers start ticked.
import React, { useState } from "react";
import { X } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { IMPORT_CLASSES } from "../lib/mapImportReview.js";
import { featureCountText } from "../lib/featureCount.js";
import { t as tr } from "../lib/i18n.js";

const CLASS_TEXT = () => ({
  map: [tr("Map layers for this area"), tr("They sit together on your property.")],
  grid: [tr("Reference grids"), tr("Grids drawn for the report's figures. The 3D View has its own grid.")],
  labels: [tr("Text labels"), tr("Words placed on the figures. They import as dots: the text itself is not drawn.")],
  regional: [tr("Regional or elsewhere"), tr("Location maps, much larger than your property or far from it. One of these zooms the view far out.")],
  page: [tr("No position on the map"), tr("Legends, scale bars, page frames and section drawings. Their coordinates are page or section units, so they would land far from your data.")],
});
const sizeText = (m) => (m >= 1000 ? tr("{v} km across", { v: (m / 1000).toFixed(m >= 10000 ? 0 : 1) }) : tr("{v} m across", { v: Math.round(m) }));

export default function MapImportReview({ rows, onCancel, onConfirm }) {
  const [on, setOn] = useState(() => new Set(rows.filter((r) => r.cls === "map").map((r) => r.table.name)));
  useEscapeKey(onCancel);
  useFocusTrap();
  const text = CLASS_TEXT();
  const flip = (names, v) => setOn((s) => { const n = new Set(s); names.forEach((x) => (v ? n.add(x) : n.delete(x))); return n; });
  const count = rows.filter((r) => on.has(r.table.name)).length;
  return (
    <div style={overlay}>
      <div role="dialog" aria-modal="true" aria-label={tr("Choose what to import")} style={{ width: 640, maxWidth: "94vw", maxHeight: "86vh", display: "flex", flexDirection: "column", background: "var(--color-bg)", borderRadius: 10, boxShadow: "0 12px 40px rgba(0,0,0,0.3)", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--color-border)" }}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600 }}>{tr("Choose what to import")}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("These {n} tables are not all map layers. Only the ones that belong on this map are ticked.", { n: rows.length })}</div>
          </div>
          <button type="button" onClick={onCancel} aria-label={tr("Close")} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", padding: 2 }}><X size={18} /></button>
        </div>
        <div style={{ overflow: "auto", padding: "4px 16px 12px" }}>
          {IMPORT_CLASSES.map((cls) => {
            const group = rows.filter((r) => r.cls === cls);
            if (!group.length) return null;
            const names = group.map((r) => r.table.name), all = names.every((n) => on.has(n));
            return (
              <div key={cls} style={{ marginTop: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                  <input type="checkbox" checked={all} onChange={(e) => flip(names, e.target.checked)} />{text[cls][0]} ({group.length})
                </label>
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", margin: "2px 0 6px 22px" }}>{text[cls][1]}</div>
                {group.map((r) => {
                  const n = r.table.layers.reduce((a, l) => a + l.features.length, 0);
                  return (
                    <label key={r.table.name} style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 22, padding: "2px 0", fontSize: "var(--font-size-sm)" }}>
                      <input type="checkbox" checked={on.has(r.table.name)} onChange={(e) => flip([r.table.name], e.target.checked)} />
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.table.name}>{r.table.name}</span>
                      <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>{r.table.layers.length === 1 ? featureCountText(n, r.table.layers[0].geomType) : tr("{n} features", { n: n.toLocaleString() })}{r.cls === "page" ? "" : ` · ${sizeText(r.sizeM)}`}</span>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button type="button" onClick={onCancel} style={{ padding: "7px 14px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", cursor: "pointer", font: "inherit", color: "inherit" }}>{tr("Cancel")}</button>
          <button type="button" onClick={() => onConfirm(on)} disabled={!count} style={{ padding: "7px 14px", borderRadius: 6, border: "none", background: "var(--color-primary)", color: "#fff", cursor: count ? "pointer" : "default", font: "inherit", fontWeight: 600 }}>{tr("Import {n} tables", { n: count })}</button>
        </div>
      </div>
    </div>
  );
}
