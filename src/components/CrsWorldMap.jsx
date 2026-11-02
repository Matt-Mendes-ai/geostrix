// TASKS.csv #1330 — where a CRS applies, on a small world map: its area of use from the EPSG registry (#835), or worked out for a UTM zone. The outline is hand-drawn and coarse on
// purpose: it answers "which part of the world", needs no network, and weighs almost nothing. Loaded with the dialog that shows it.
import React, { useEffect, useState } from "react";
import { crsAreaOf, crsName, loadEpsgRegistry, onEpsgRegistry } from "../lib/reproject.js";
import { crsMapArea, areaRects, areaText, WORLD_OUTLINE } from "../lib/crsMapArea.js";
import { t as tr } from "../lib/i18n.js";

const path = WORLD_OUTLINE.map((ring) => `M${ring.map(([lon, lat]) => `${lon + 180} ${90 - lat}`).join("L")}Z`).join("");

export default function CrsWorldMap({ epsg, point = null, width = 220 }) {
  const [, setTick] = useState(0);
  useEffect(() => { const off = onEpsgRegistry(() => setTick((n) => n + 1)); loadEpsgRegistry().catch(() => {}); return off; }, []);
  if (!epsg) return null;
  const area = crsMapArea(crsAreaOf(epsg), crsName(epsg));
  const rects = area ? areaRects(area) : [];
  const text = area ? areaText(area) : null;
  return (
    <figure style={{ margin: 0, width, flexShrink: 0 }}>
      <svg viewBox="0 0 360 180" width={width} role="img" aria-label={text ? tr("World map: this CRS applies over {area}", { area: text }) : tr("World map: no area of use is listed for this CRS")} style={{ display: "block", background: "#dfe9f2", border: "1px solid var(--color-border)", borderRadius: 4 }}>
        <path d={path} fill="#c9cdbf" stroke="none" />
        {rects.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill="#e5197d" fillOpacity="0.32" stroke="#b00f5e" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />)}
        {/* a small grid is a speck at this scale: a ring shows where it is */}
        {rects.length === 1 && rects[0].w < 8 && rects[0].h < 8 && <circle cx={rects[0].x + rects[0].w / 2} cy={rects[0].y + rects[0].h / 2} r="7" fill="none" stroke="#b00f5e" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
        {point && Number.isFinite(point.lon) && Number.isFinite(point.lat) && <circle cx={point.lon + 180} cy={90 - point.lat} r="3.2" fill="#1a2028" stroke="#ffffff" strokeWidth="1" vectorEffect="non-scaling-stroke"><title>{tr("Your project")}</title></circle>}
      </svg>
      <figcaption style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 2 }}>{text || tr("No area of use listed for this CRS.")}{point ? ` ${tr("Dot: your project.")}` : ""}</figcaption>
    </figure>
  );
}
