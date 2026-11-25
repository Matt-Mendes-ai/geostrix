// TASKS.csv #3954 — the one area line every online fetch dialog shows: the areas the project has (lib/fetchAreas.js: the project area, the
// terrain, the satellite image, a boundary or claim with a margin...), an area drawn on the map, its size, and for a fetch that can clip, "Clip
// to the outline" when a boundary or claim is chosen. The choice is remembered per fetch on this computer. Loaded with the dialogs that use it.
import React, { useEffect, useState } from "react";
import { t as tr } from "../lib/i18n.js";
import { areaSizeText } from "../lib/areaSize.js";
import { rememberedFetchArea, rememberFetchArea, startingOption, optionBox, rememberedFetchMargin, rememberFetchMargin } from "../lib/fetchAreas.js";
import NumberInput from "./NumberInput.jsx";

const store = () => { try { return window.localStorage; } catch { return null; } };

// fetch: the fetch's name for the remembered choice; options: fetchAreaOptions' list (lon / lat), or null while it is being built
// -> { id, choose(id), drawn, setDrawn(bbox), option (null for a drawn area), margin, setMargin(m), bboxLonLat (a boundary or claim with the margin) }
export function useFetchArea(fetch, options) {
  const [id, setId] = useState(null);
  const [drawn, setDrawnState] = useState(null);
  const [margin, setMarginState] = useState(() => rememberedFetchMargin(store(), fetch)); // #3954 — Matt: "a margin box to the area choice"
  const setMargin = (m) => { setMarginState(m); rememberFetchMargin(store(), fetch, m); };
  useEffect(() => { if (options && id == null) setId(startingOption(options, rememberedFetchArea(store(), fetch))?.id ?? null); }, [options, id, fetch]);
  const choose = (v) => { setId(v); if (v !== "drawn") rememberFetchArea(store(), fetch, v); };
  const setDrawn = (b) => { setDrawnState(b); if (b) setId("drawn"); };
  const option = id === "drawn" ? null : (options || []).find((o) => o.id === id) || null;
  const bboxLonLat = id === "drawn" ? drawn : optionBox(option, margin);
  return { id, choose, drawn, setDrawn, option, margin, setMargin, bboxLonLat };
}

const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };

// area: useFetchArea's; onDraw: open the map picker; clip / onClip: only for a fetch that can clip (terrain, images); disabled: while busy
export default function AreaChooser({ options, area, onDraw, clip, onClip, disabled = false }) {
  const has = (options || []).length > 0 || !!area.drawn;
  const outline = !!area.option?.outline?.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-area-chooser="">
      <div style={{ ...note, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: "var(--color-text)" }}>{tr("Area")}</span>
        {has && (
          <select aria-label={tr("Area")} value={area.id ?? ""} disabled={disabled} onChange={(e) => area.choose(e.target.value)} style={{ maxWidth: 300, fontSize: "var(--font-size-sm)", padding: "3px 6px", borderRadius: 4, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}>
            {(options || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            {area.drawn && <option value="drawn">{tr("Drawn on the map")}</option>}
          </select>
        )}
        {area.option?.coreLonLat && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{tr("Margin (m)")}
            <NumberInput value={area.margin} min={0} step={50} disabled={disabled} onChange={(m) => area.setMargin(m)} aria-label={tr("Margin (m)")} style={{ width: 64, fontSize: "var(--font-size-sm)", padding: "3px 6px", borderRadius: 4, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }} />
          </label>
        )}
        <button type="button" disabled={disabled} onClick={onDraw} className="gs-btn gs-btn--sm" style={{ width: "auto", padding: "4px 8px" }}>{tr("Draw an area…")}</button>
        {area.bboxLonLat && <span data-area-size="">{areaSizeText(area.bboxLonLat)}</span>}
      </div>
      {onClip && outline && (
        <label style={{ ...note, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={!!clip} disabled={disabled} onChange={(e) => onClip(e.target.checked)} />{tr("Clip to the outline")}
        </label>
      )}
      {!has && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("No project area yet: draw an area on the map, or load holes, samples or a map first.")}</div>}
    </div>
  );
}
