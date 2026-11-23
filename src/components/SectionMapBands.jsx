// TASKS.csv #4041 — the map layers on the section (lib/sectionMaps.js): each polygon or raster layer a band just under the ground line, one
// under the other, its units coloured as in Maps and named where the span is wide enough; each line layer (faults, contacts) a tick across
// the ground and the bands where it crosses the line, with its dip when the feature has one; the layers' credits (Macrostrat's CC BY) at the
// bottom left. Without a terrain the bands run along the top of the plot. Drawn inside the plot's clip, so it goes with every export.
import React from "react";
import { bandLayers, creditsOf } from "../lib/sectionMaps.js";

const lum = (h) => { const n = parseInt(String(h).slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

// layers: the shown layers (shownMapLayers); profile: [{ d, z }] or null; sx(d) / sz(z): the plot's scales; top / bottom / left: the plot's edges
export default function SectionMapBands({ layers, profile, sx, sz, fs, top, bottom, left, clipId }) {
  const { bands, ticks } = bandLayers(layers);
  if (!bands.length && !ticks.length) return null;
  const prof = profile && profile.length > 1 ? profile : null;
  const groundY = (d) => {
    if (!prof) return top;
    if (d <= prof[0].d) return sz(prof[0].z);
    for (let i = 1; i < prof.length; i++) if (d <= prof[i].d) { const a = prof[i - 1], b = prof[i], t = (d - a.d) / ((b.d - a.d) || 1); return sz(a.z + (b.z - a.z) * t); }
    return sz(prof[prof.length - 1].z);
  };
  const bh = fs(10), gap = 2, total = bands.length * (bh + gap);
  // the band's top line between d0 and d1, following the ground (its vertices inside the span), offset o px under it
  const edge = (d0, d1, o) => { const ds = [d0, ...(prof || []).map((p) => p.d).filter((d) => d > d0 && d < d1), d1]; return ds.map((d) => [sx(d), groundY(d) + o]); };
  const credits = creditsOf(layers);
  return (
    <g data-section-maps="" clipPath={clipId ? `url(#${clipId})` : undefined}>
      {bands.map((l, k) => {
        const o = gap + k * (bh + gap);
        return (
          <g key={l.id} data-map-band={l.id} opacity={l.kind === "raster" ? 0.95 : 0.9}>
            {l.spans.map((s, i) => {
              const up = edge(s.from, s.to, o), down = up.map(([x, y]) => [x, y + bh]).reverse(), w = sx(s.to) - sx(s.from), mid = (s.from + s.to) / 2;
              const fit = s.label && w > s.label.length * fs(8) * 0.56 + 6;
              return (
                <g key={i}>
                  <polygon points={[...up, ...down].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill={s.colour} stroke="none"><title>{s.label ? `${l.name}: ${s.label}` : l.name}</title></polygon>
                  {fit && <text x={sx(mid)} y={groundY(mid) + o + bh * 0.76} fontSize={fs(8)} textAnchor="middle" fill={lum(s.colour) > 0.55 ? "#1a2028" : "#ffffff"} pointerEvents="none">{s.label}</text>}
                </g>
              );
            })}
          </g>
        );
      })}
      {ticks.map((l) => l.ticks.map((t, i) => {
        const x = sx(t.at), y = groundY(t.at), named = t.label && t.label !== l.name ? t.label : "";
        const text = [named, t.dip != null ? `${Math.round(t.dip)}°` : ""].filter(Boolean).join(" ");
        return (
          <g key={`${l.id}:${i}`} data-map-tick={l.id}>
            <line x1={x} y1={y - fs(7)} x2={x} y2={y + total + fs(4)} stroke={t.colour} strokeWidth={2}><title>{named ? `${l.name}: ${named}` : l.name}</title></line>
            {text && <text x={x + 3} y={y + total + fs(12)} fontSize={fs(8)} fill={t.colour} stroke="#ffffff" strokeWidth={2} paintOrder="stroke">{text}</text>}
          </g>
        );
      }))}
      {credits.length > 0 && <text x={left + 4} y={bottom - 4} fontSize={fs(7.5)} fill="#55606e" stroke="#ffffff" strokeWidth={2} paintOrder="stroke">{credits.join(" · ")}</text>}
    </g>
  );
}
