// TASKS.csv #311 — figure furniture (title / legend / scale bar) drawn OVER the 3D viewport.
//
// WHY THIS EXISTS. GeoStrix already has a good figure pipeline — the Layout tab's A4 page, north
// arrow, real px-per-metre scale bar and viewport-synced legend. This row is not about replacing any
// of that. It is about the path people actually take: an exploration geologist snips the 3D View
// with the OS snipping tool at 11pm and pastes it into a deck. That snip previously contained no
// key, no scale and no title, which reads as a working view rather than a figure next to a Leapfrog
// or Micromine screenshot in the same document. This puts the minimum figure furniture into the view
// itself, and defers to Layout for anything more (page templates, north arrow, PDF export).
//
// THREE THINGS THIS FILE IS DELIBERATE ABOUT:
//
// 1. IT COSTS NOTHING PER FRAME. #312 took the 3D view from 5.6 fps to 142.9 fps and performance is
//    this project's standing priority above features, so an overlay that forced a re-render or a
//    repaint per frame would be a bad trade even if it looked perfect. This is plain absolutely-
//    positioned DOM (no WebGL geometry, no extra draw calls, nothing in the render loop). The one
//    piece that must track the camera — the scale bar — is updated IMPERATIVELY through
//    `camSignalRef`, which ViewerModule's updateCamera()/resize() call. updateCamera runs on real
//    camera CHANGES (drag/wheel/fit/reset), NOT every frame, and the update below early-returns
//    without touching the DOM whenever the rounded bar and its label are unchanged — so an idle or
//    merely-rotating view does zero layout work. No React state is involved in that path at all, so
//    a camera move never re-renders this component.
//
// 2. THE SCALE BAR IS HONEST ABOUT PERSPECTIVE. A perspective camera has no single scale: the
//    frustum widens with distance, so a bar that is correct at the orbit target is wrong at the near
//    and far planes. Rather than print an authoritative-looking bar that is quietly wrong at the
//    depth the reader cares about, the bar states the depth it is valid at ("at view centre") right
//    on the figure, and the popover that toggles it explains the drift and points at Layout's
//    orthographic true-scale capture (#69) for a figure where the scale must hold everywhere. All of
//    its arithmetic comes from src/lib/figureScale.js, the same module LayoutModule now uses — there
//    is deliberately only ONE metres-per-pixel derivation in the app.
//
// 3. THE LEGEND SHOWS WHAT IS SWITCHED ON, NOT THE WHOLE PROJECT. See buildOverlayLegend in
//    ViewerModule for the derivation and its one documented limit (it does not frustum-cull).
import React, { useRef, useEffect, useCallback } from "react";
import { metresPerPixelAtTarget, chooseScaleBar } from "../lib/figureScale.js";

const MAX_BAR_PX = 190;
// The AxisGizmo occupies the bottom-left 76px + 12px margin of the canvas (see AxisGizmo.js's own
// getRect), so the scale bar starts to the right of it rather than on top of it.
const SCALE_LEFT_PX = 12 + 76 + 14;
// A legend longer than this stops being figure furniture and starts being a data panel. Truncating
// SILENTLY would be the dishonest option (a reader would assume the key is complete), so the
// remainder is stated explicitly instead.
const MAX_LEGEND_ITEMS = 14;

const card = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  boxShadow: "0 1px 4px rgba(0,0,0,0.10)",
  fontFamily: "'Exo 2', system-ui, sans-serif",
};

export default function ViewportFigureOverlay({ config, title, legendGroups, camStateRef, cameraRef, mountRef, camSignalRef }) {
  const barRectRef = useRef(null);
  const barTextRef = useRef(null);
  const barMidRef = useRef(null);
  const barSvgRef = useRef(null);
  const barHalfRef = useRef(null);
  const lastRef = useRef({ px: -1, label: "" });
  const heightRef = useRef(0); // cached canvas pixel height — see updateBar for why this is cached rather than read each time

  const showScale = config.enabled && config.scale;

  // Imperative, DOM-diffed scale-bar update. Called by ViewerModule on every real camera change and
  // on canvas resize — never from a rAF loop, and never through React state (see this file's header).
  const updateBar = useCallback((sizeChanged) => {
    const svg = barSvgRef.current;
    if (!svg) return; // scale bar switched off, or not mounted
    const cam = cameraRef.current, cs = camStateRef.current, mount = mountRef.current;
    if (!cam || !cs || !mount) return;
    // MEASURED, not assumed. mount.clientHeight is a LAYOUT READ, and this function runs right after
    // the previous call may have written SVG attributes — so reading it every time forced a
    // synchronous whole-document layout flush on each camera change that moved the bar: 0.47 ms per
    // change, against ~0.001 ms for all five DOM writes put together. (The writes were the obvious
    // suspect and were NOT the cost; that was checked directly before this cache was added, in the
    // spirit of #304/#238's "don't ship an unmeasured optimisation".) The canvas height only changes
    // when the canvas is resized, and ViewerModule's resize() is the one caller that passes
    // sizeChanged — so the cache cannot go stale without being invalidated.
    if (sizeChanged || !(heightRef.current > 0)) heightRef.current = mount.clientHeight;
    const mpp = metresPerPixelAtTarget(cam.fov, cs.radius, heightRef.current);
    const bar = chooseScaleBar(mpp, MAX_BAR_PX);
    if (!bar) return;
    const px = Math.round(bar.px);
    if (px === lastRef.current.px && bar.label === lastRef.current.label) return; // nothing changed — no DOM write, no repaint
    lastRef.current = { px, label: bar.label };
    // The card shrink-wraps the bar (a fixed-width box leaves an obvious empty gutter to the right of
    // a short bar, which looks wrong in a figure). That is affordable because each of these six DOM
    // writes measures ~0.001 ms — they were never the expensive part of this function; see the
    // layout-read note above for what actually was.
    svg.setAttribute("width", String(px + 2));
    barRectRef.current?.setAttribute("width", String(px));
    barHalfRef.current?.setAttribute("width", String(px / 2));
    barMidRef.current?.setAttribute("x", String(1 + px / 2));
    barMidRef.current?.setAttribute("width", String(px / 2)); // the light half is painted explicitly, not left to the card background showing through
    if (barTextRef.current) {
      barTextRef.current.setAttribute("x", String(px + 1));
      barTextRef.current.textContent = bar.label;
    }
  }, [cameraRef, camStateRef, mountRef]);

  useEffect(() => {
    if (!camSignalRef) return undefined;
    camSignalRef.current = showScale ? updateBar : null;
    if (showScale) { lastRef.current = { px: -1, label: "" }; heightRef.current = 0; updateBar(true); }
    return () => { if (camSignalRef.current === updateBar) camSignalRef.current = null; };
  }, [camSignalRef, updateBar, showScale]);

  if (!config.enabled) return null;

  const items = [];
  (legendGroups || []).forEach((g) => g.items.forEach(([label, color]) => items.push({ label, color, group: g.label })));
  const shown = items.slice(0, MAX_LEGEND_ITEMS);
  const hiddenCount = items.length - shown.length;
  const showLegend = config.legend && items.length > 0;
  const showTitle = config.title && !!title;

  return (
    // pointerEvents: none on every layer of this overlay. #304's hover picking and every orbit drag
    // go to the canvas underneath; an overlay that swallowed pointer events would break hovering
    // silently, which is exactly the failure this project's picking harness exists to catch.
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="true">
      {showTitle && (
        <div style={{ ...card, position: "absolute", top: 12, left: 12, maxWidth: 340, padding: "6px 11px", fontSize: 13, fontWeight: 600, color: "var(--color-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {title}
        </div>
      )}
      {showLegend && (
        <div style={{ ...card, position: "absolute", top: showTitle ? 48 : 12, left: 12, padding: "7px 11px 8px", maxWidth: 250 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--color-text-caption)", marginBottom: 5 }}>Legend</div>
          {shown.map((it, i) => (
            <div key={`${it.group}|${it.label}|${i}`} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2.5 }}>
              <span style={{ width: 12, height: 12, flexShrink: 0, background: it.color, border: "1px solid var(--color-border-light)", borderRadius: 2 }} />
              <span style={{ fontSize: 11, color: "var(--color-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={`${it.group}: ${it.label}`}>{it.label}</span>
            </div>
          ))}
          {hiddenCount > 0 && (
            <div style={{ fontSize: 10, color: "var(--color-text-caption)", marginTop: 4 }}>
              + {hiddenCount} more not shown — filter categories, or build the figure in Layout
            </div>
          )}
        </div>
      )}
      {showScale && (
        <div style={{ ...card, position: "absolute", bottom: 12, left: SCALE_LEFT_PX, padding: "6px 9px 4px" }}>
          <svg ref={barSvgRef} width={MAX_BAR_PX + 2} height="26" style={{ display: "block", overflow: "visible" }}>
            {/* Alternating half-bar, the same idiom Layout's own scale element draws. Colours are
                hard-coded rather than var()-driven ONLY where the swatch must read as ink on paper;
                the surrounding card uses the design tokens. */}
            <rect ref={barHalfRef} x="1" y="2" width={MAX_BAR_PX / 2} height="7" style={{ fill: "var(--color-text)" }} />
            <rect ref={barMidRef} x={1 + MAX_BAR_PX / 2} y="2" width="0" height="7" style={{ fill: "var(--color-bg)" }} />
            <rect ref={barRectRef} x="1" y="2" width={MAX_BAR_PX} height="7" strokeWidth="1" style={{ fill: "none", stroke: "var(--color-text)" }} />
            <text x="1" y="21" fontSize="10.5" fontFamily="'Exo 2', system-ui, sans-serif" style={{ fill: "var(--color-text-secondary)" }}>0</text>
            <text ref={barTextRef} x={MAX_BAR_PX + 1} y="21" fontSize="10.5" textAnchor="end" fontFamily="'Exo 2', system-ui, sans-serif" style={{ fill: "var(--color-text)" }}>—</text>
          </svg>
          {/* The honesty label. This is not decoration: without it the bar claims a single scale for
              a perspective projection that does not have one. See figureScale.js's header. */}
          <div style={{ fontSize: 9.5, color: "var(--color-text-caption)", marginTop: 1, letterSpacing: 0.2 }}>at view centre</div>
        </div>
      )}
    </div>
  );
}
