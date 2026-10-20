import React, { useEffect, useRef, useState } from "react";

// TASKS.csv #632 — placing control points on a scanned / PDF figure precisely. The dialog shows a big scan at
// ≤ 680 px, so one click was several source pixels (a few metres in the #630 test). Here: scroll to zoom at the
// cursor (×1–×32, pixels shown sharp above ×2), drag to pan, drag a point to fine-tune it, + / − / Fit buttons,
// and crosshair markers centred exactly on each point. Coordinates handed back are source-image pixels (fractions
// allowed — at ×8 a click resolves an eighth of a pixel).
//   image: { bitmap (HTMLImageElement | HTMLCanvasElement), width, height }
//   points: [{ id, px, py }]; onAdd(px, py); onMove(id, px, py)
const ZOOM_MAX = 32;
const HIT_PX = 10; // screen px around a point that grab it instead of adding / panning

export default function ImageTiePointCanvas({ image, points, onAdd, onMove, maxSize = 680, ariaLabel = "Click to add a control point" }) {
  const fit = Math.min(1, maxSize / Math.max(image.width, image.height));
  const W = Math.round(image.width * fit), H = Math.round(image.height * fit);
  const [view, setView] = useState({ zoom: 1, cx: image.width / 2, cy: image.height / 2 });
  const canvasRef = useRef(null), boxRef = useRef(null), dragRef = useRef(null);
  useEffect(() => { setView({ zoom: 1, cx: image.width / 2, cy: image.height / 2 }); }, [image]);

  const s = fit * view.zoom; // screen px per source px
  const ox = view.cx - W / (2 * s), oy = view.cy - H / (2 * s);
  const toScreen = (px, py) => [(px - ox) * s, (py - oy) * s];
  const toSource = (x, y) => [ox + x / s, oy + y / s];
  const clampView = (v) => {
    const zoom = Math.min(ZOOM_MAX, Math.max(1, v.zoom)), ss = fit * zoom;
    const hw = W / (2 * ss), hh = H / (2 * ss);
    return { zoom, cx: Math.min(image.width - hw, Math.max(hw, v.cx)), cy: Math.min(image.height - hh, Math.max(hh, v.cy)) };
  };

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = view.zoom < 2; // sharp source pixels when zoomed in, for precise clicks
    ctx.fillStyle = "#ececec"; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(image.bitmap, ox, oy, W / s, H / s, 0, 0, W, H);
  }, [image, view, W, H, ox, oy, s]);

  // measured from the canvas (inside the frame's 1 px border), not the frame: the border used to shift every point by a screen pixel
  const local = (e) => { const r = canvasRef.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const zoomAt = (factor, x = W / 2, y = H / 2) => setView((v) => {
    const ss = fit * v.zoom, sx = v.cx - W / (2 * ss) + x / ss, sy = v.cy - H / (2 * ss) + y / ss; // source point under (x, y)
    const zoom = Math.min(ZOOM_MAX, Math.max(1, v.zoom * factor)), ns = fit * zoom;
    return clampView({ zoom, cx: sx - x / ns + W / (2 * ns), cy: sy - y / ns + H / (2 * ns) });
  });

  // wheel needs a non-passive listener to stop the dialog scrolling
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const onWheel = (e) => { e.preventDefault(); const [x, y] = local(e); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, x, y); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const [x, y] = local(e);
    const hit = points.map((p) => { const [sx, sy] = toScreen(p.px, p.py); return { p, d: Math.hypot(sx - x, sy - y) }; }).filter((h) => h.d <= HIT_PX).sort((a, b) => a.d - b.d)[0];
    dragRef.current = { x, y, moved: false, pointId: hit?.p.id || null, start: { ...view } };
    boxRef.current.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const [x, y] = local(e);
    if (!d.moved && Math.hypot(x - d.x, y - d.y) < 3) return;
    d.moved = true;
    if (d.pointId) { const [px, py] = toSource(x, y); onMove(d.pointId, clampPx(px, image.width), clampPx(py, image.height)); }
    else { const ss = fit * d.start.zoom; setView(clampView({ zoom: d.start.zoom, cx: d.start.cx - (x - d.x) / ss, cy: d.start.cy - (y - d.y) / ss })); }
  };
  const onPointerUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved || d.pointId) return;
    const [x, y] = local(e);
    const [px, py] = toSource(x, y);
    if (px >= 0 && py >= 0 && px <= image.width && py <= image.height) onAdd(round2(px), round2(py));
  };
  const onKeyDown = (e) => {
    if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomAt(1.5); }
    else if (e.key === "-") { e.preventDefault(); zoomAt(1 / 1.5); }
    else if (e.key === "0") { e.preventDefault(); setView({ zoom: 1, cx: image.width / 2, cy: image.height / 2 }); }
  };

  const btn = { width: 28, height: 26, border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)", color: "var(--color-text)", cursor: "pointer", fontSize: "var(--font-size-base)", lineHeight: 1 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
        <button type="button" style={btn} onClick={() => zoomAt(1.5)} aria-label="Zoom in" title="Zoom in (+)">+</button>
        <button type="button" style={btn} onClick={() => zoomAt(1 / 1.5)} aria-label="Zoom out" title="Zoom out (−)">−</button>
        <button type="button" style={{ ...btn, width: "auto", padding: "0 8px" }} onClick={() => setView({ zoom: 1, cx: image.width / 2, cy: image.height / 2 })} title="Whole image (0)">Fit</button>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>×{view.zoom.toFixed(view.zoom < 10 ? 1 : 0)}</span>
        <span>· scroll to zoom, drag to pan, drag a point to move it</span>
      </div>
      <div ref={boxRef} role="button" tabIndex={0} aria-label={ariaLabel} onKeyDown={onKeyDown}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { dragRef.current = null; }}
        style={{ position: "relative", width: W, height: H, cursor: "crosshair", border: "1px solid var(--color-border)", background: "#ececec", overflow: "hidden", touchAction: "none", userSelect: "none" }}>
        <canvas ref={canvasRef} width={W} height={H} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
        <svg width={W} height={H} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="true">
          {points.map((p, i) => {
            const [x, y] = toScreen(p.px, p.py);
            if (x < -20 || y < -20 || x > W + 20 || y > H + 20) return null;
            return (
              <g key={p.id} transform={`translate(${x} ${y})`}>
                <circle r="7" fill="none" stroke="#fff" strokeWidth="3" />
                <circle r="7" fill="none" stroke="#c0392b" strokeWidth="1.5" />
                <path d="M-11 0H-3M3 0H11M0 -11V-3M0 3V11" stroke="#c0392b" strokeWidth="1.5" />
                <circle r="1.2" fill="#c0392b" />
                <text x="10" y="-9" fontSize="11" fontWeight="600" fill="#c0392b" stroke="#fff" strokeWidth="3" paintOrder="stroke">{i + 1}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

const round2 = (v) => Math.round(v * 100) / 100;
const clampPx = (v, max) => round2(Math.min(max, Math.max(0, v)));
