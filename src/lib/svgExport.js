// TASKS.csv #1089 (review #1016, software artist) — an <svg> from the page as a standalone figure. XMLSerializer copies the
// markup only: the font came from app.css (so the files, and the PNGs drawn from them in an isolated <img>, fell back to
// Times New Roman), and the exported root kept UI chrome (a border, rounded corners, a var() background that no longer
// resolves) and width="100%" with no height. #525 fixed this for the level plan only. Every SVG / PNG figure export
// goes through exportSvgMarkup: the font named on the root, explicit width / height from the viewBox, the chrome
// dropped, a white background rect painted first. The page's own <svg> is not changed.
export const FIGURE_FONT = "'Exo 2', 'Segoe UI', system-ui, sans-serif";
const SVG_NS = "http://www.w3.org/2000/svg";

// svg: an SVGSVGElement. -> { markup, width, height }
export function exportSvgMarkup(svg, { background = "#ffffff" } = {}) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", SVG_NS);
  const vb = svg.viewBox?.baseVal;
  const w = vb && vb.width ? vb.width : Number(svg.getAttribute("width")) || svg.clientWidth || 800;
  const h = vb && vb.height ? vb.height : Number(svg.getAttribute("height")) || svg.clientHeight || 600;
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  if (!clone.getAttribute("font-family")) clone.setAttribute("font-family", FIGURE_FONT);
  for (const k of ["border", "border-radius", "background", "background-color", "box-shadow", "cursor"]) clone.style?.removeProperty?.(k);
  if (background) {
    const r = clone.ownerDocument.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", vb ? String(vb.x) : "0"); r.setAttribute("y", vb ? String(vb.y) : "0");
    r.setAttribute("width", String(w)); r.setAttribute("height", String(h)); r.setAttribute("fill", background);
    clone.insertBefore(r, clone.firstChild);
  }
  return { markup: new XMLSerializer().serializeToString(clone), width: w, height: h };
}
