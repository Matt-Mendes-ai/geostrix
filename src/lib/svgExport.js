// TASKS.csv #1089 (review #1016, software artist) — an <svg> from the page as a standalone figure. XMLSerializer copies the
// markup only: the font came from app.css (so the files, and the PNGs drawn from them in an isolated <img>, fell back to
// Times New Roman), and the exported root kept UI chrome (a border, rounded corners, a var() background that no longer
// resolves) and width="100%" with no height. #525 fixed this for the level plan only. Every SVG / PNG figure export
// goes through exportSvgMarkup: the font named on the root, explicit width / height from the viewBox, the chrome
// dropped, a white background rect painted first. The page's own <svg> is not changed.
import { furnitureLayout } from "./figureFurniture.js"; // TASKS.csv #1048 / #1068
import { printPt, printPx, PLACED_W } from "./theme.js"; // TASKS.csv #1090
export const FIGURE_FONT = "'Exo 2', 'Segoe UI', system-ui, sans-serif";
const SVG_NS = "http://www.w3.org/2000/svg";

// svg: an SVGSVGElement. furniture (#1048 / #1068): a caption and colour keys drawn in a band under the figure
// (lib/figureFurniture.js), in the exported copy only; furniture.placement "top" puts it above (a strip log's title
// belongs at the head of a long page). -> { markup, width, height }
//
// TASKS.csv #1090 (review #1016, software artist) — print floor. A figure is drawn at screen size and Layout scales it to
// fit the page (at most PLACED_W page px wide), so a 1,100 px section's 8-10 px labels printed at 3.5-4.4 pt, a strip
// log's at 4.3-5.7 pt. In the exported copy, text whose size would print under printPt.caption (7 pt) at that placement
// is raised to it, and the caption / key band is drawn at printPt.small. printFloor: false keeps the screen sizes.
export function exportSvgMarkup(svg, { background = "#ffffff", furniture = null, printFloor = true } = {}) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", SVG_NS);
  const vb = svg.viewBox?.baseVal;
  const w = vb && vb.width ? vb.width : Number(svg.getAttribute("width")) || svg.clientWidth || 800;
  const k = w / PLACED_W, floorPx = printFloor ? printPx(printPt.caption) * k : 0;
  if (floorPx > 0 && typeof window !== "undefined" && window.getComputedStyle) {
    // sizes read from the live figure (attribute, inline style, CSS or inherited), set on the same text in the copy
    const live = svg.querySelectorAll("text"), copy = clone.querySelectorAll("text");
    for (let i = 0; i < live.length && i < copy.length; i++) {
      const px = parseFloat(window.getComputedStyle(live[i]).fontSize);
      if (Number.isFinite(px) && px > 0 && px < floorPx) copy[i].style.fontSize = `${+floorPx.toFixed(2)}px`;
    }
  }
  let h = vb && vb.height ? vb.height : Number(svg.getAttribute("height")) || svg.clientHeight || 600;
  const x0 = vb && vb.width ? vb.x : 0;
  let y0 = vb && vb.height ? vb.y : 0;
  const band = furniture ? furnitureLayout(furniture, w, printFloor ? { fontSize: Math.max(11, printPx(printPt.small) * k) } : {}) : { height: 0, items: [] }; // #1090
  if (band.height) {
    const doc = clone.ownerDocument, g = doc.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "ge-figure-caption");
    const atTop = furniture.placement === "top", top = atTop ? y0 - band.height : y0 + h;
    // an opaque ground for the band: a figure whose content runs past its own frame (the level plan's block slice)
    // would otherwise show through the caption
    const ground = doc.createElementNS(SVG_NS, "rect");
    ground.setAttribute("x", String(x0)); ground.setAttribute("y", String(top)); ground.setAttribute("width", String(w)); ground.setAttribute("height", String(band.height));
    ground.setAttribute("fill", background || "#ffffff");
    g.appendChild(ground);
    for (const it of band.items) {
      if (it.type === "text") {
        const t = doc.createElementNS(SVG_NS, "text");
        t.setAttribute("x", String(x0 + it.x)); t.setAttribute("y", String(top + it.y)); t.setAttribute("font-size", String(+it.size.toFixed(2)));
        t.setAttribute("fill", it.fill); if (it.weight !== 400) t.setAttribute("font-weight", String(it.weight));
        t.textContent = it.text;
        g.appendChild(t);
      } else {
        const r = doc.createElementNS(SVG_NS, it.shape === "dot" ? "circle" : "rect");
        if (it.shape === "dot") { r.setAttribute("cx", String(x0 + it.x + it.w / 2)); r.setAttribute("cy", String(top + it.y + it.h / 2)); r.setAttribute("r", String(it.w / 2)); }
        else if (it.shape === "line") { r.setAttribute("x", String(x0 + it.x)); r.setAttribute("y", String(top + it.y + it.h / 2 - 1)); r.setAttribute("width", String(it.w)); r.setAttribute("height", "2"); }
        else { r.setAttribute("x", String(x0 + it.x)); r.setAttribute("y", String(top + it.y)); r.setAttribute("width", String(it.w)); r.setAttribute("height", String(it.h)); }
        r.setAttribute("fill", it.fill);
        g.appendChild(r);
      }
    }
    clone.appendChild(g);
    h += band.height;
    if (atTop) y0 -= band.height;
    clone.setAttribute("viewBox", `${x0} ${y0} ${w} ${h}`);
  }
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  if (!clone.getAttribute("font-family")) clone.setAttribute("font-family", FIGURE_FONT);
  for (const k of ["border", "border-radius", "background", "background-color", "box-shadow", "cursor"]) clone.style?.removeProperty?.(k);
  clone.querySelectorAll?.("[data-ui-only]").forEach((n) => n.remove()); // TASKS.csv #1059 — on-screen controls (e.g. "Copy here") stay out of the figure
  if (background) {
    const r = clone.ownerDocument.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", String(x0)); r.setAttribute("y", String(y0));
    r.setAttribute("width", String(w)); r.setAttribute("height", String(h)); r.setAttribute("fill", background);
    clone.insertBefore(r, clone.firstChild);
  }
  return { markup: new XMLSerializer().serializeToString(clone), width: w, height: h };
}
