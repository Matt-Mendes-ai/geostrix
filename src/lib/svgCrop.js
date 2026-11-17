// TASKS.csv #3867 (Scottie Gold review) — Export PDF took 5-8 s and 10 MB for a 22-page document, most of it three pages of one split strip log. The review blamed the whole 0.63 MB drawing
// carried by every slice; measured here (a 254 kB log with lithology patterns, split over 2 pages: 13.3 MB and 1.9-4.1 s against 0.30 MB and 0.6 s unsplit) the weight is the PATTERN FILLS:
// Chromium writes a pattern-filled rect as one pattern object with a 100 kB bitmap per tile, 434 of them, and the same log with flat fills is 0.04 MB. Cropping the drawing to each slice's ranges
// changed nothing (the PDF writer already drops what the clip hides). So a slice's picture is now its own copy where (1) only the elements that touch its page's ranges remain, and (2) every
// tiled pattern fill is drawn as the vector shapes of its tile, repeated over the part of the rect the ranges show (a clip path keeps the rect's edge): the same picture, a few kB per tile.
// Pure over a DOM-like tree (children, tagName, remove(), getAttribute, ...); the browser part below measures each element with getBoundingClientRect.
import { b64ToBytes, bytesToB64 } from "./base64.js";

const KEEP_TAGS = new Set(["defs", "style", "title", "desc", "metadata", "clippath", "mask", "pattern", "lineargradient", "radialgradient", "filter", "marker", "symbol"]);
const GROUP_TAGS = new Set(["g", "a", "svg"]);
const tagOf = (el) => String(el.tagName || "").replace(/^.*:/, "").toLowerCase();

// Remove every leaf of `root` whose vertical extent (rectOf(el) -> { top, bottom } in the picture's own px, null = unknown) misses all `ranges` ([a, b] px, +- margin); a group left empty goes too.
// Definitions (patterns, clip paths, styles) stay. -> { kept, removed }
export function cropLeaves(root, ranges, rectOf, { margin = 3 } = {}) {
  let kept = 0, removed = 0;
  const walk = (el) => {
    for (const ch of [...el.children]) {
      const tag = tagOf(ch);
      if (KEEP_TAGS.has(tag)) continue;
      if (ch.children.length) {
        walk(ch);
        if (!ch.children.length && GROUP_TAGS.has(tag) && tag !== "svg") { ch.remove(); removed++; }
        continue;
      }
      const r = rectOf(ch);
      if (!r || !(Number.isFinite(r.top) && Number.isFinite(r.bottom))) { kept++; continue; }
      if (ranges.some(([a, b]) => r.bottom >= a - margin && r.top <= b + margin)) kept++; else { ch.remove(); removed++; }
    }
  };
  walk(root);
  return { kept, removed };
}

const SVG_NS = "http://www.w3.org/2000/svg";
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
// Replace each rect painted with a tiled <pattern> (patternUnits userSpaceOnUse, a width, a height and a viewBox, no patternTransform) by a clipped group holding the tile's shapes repeated
// over the rect's part inside `yRanges` (user-space y, [lo, hi] pairs; null: the whole rect). Tiles are placed on the pattern's own grid (multiples of its width / height from the origin),
// as the renderer places them. A fill that cannot be expanded is left alone. -> number of rects replaced
export function expandPatternFills(root, yRanges = null, { maxTiles = 60000 } = {}) {
  const doc = root.ownerDocument || root;
  const patterns = new Map();
  for (const p of root.getElementsByTagName("pattern")) {
    const id = p.getAttribute("id"), w = num(p.getAttribute("width")), h = num(p.getAttribute("height"));
    const vb = (p.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    if (!id || !(w > 0) || !(h > 0) || vb.length !== 4 || !(vb[2] > 0) || !(vb[3] > 0) || vb.some((v) => !Number.isFinite(v))) continue;
    if ((p.getAttribute("patternUnits") || "userSpaceOnUse") !== "userSpaceOnUse" || p.getAttribute("patternTransform") || p.getAttribute("x") || p.getAttribute("y")) continue;
    patterns.set(id, { p, w, h, vb });
  }
  if (!patterns.size) return 0;
  let tiles = 0, replaced = 0, clipN = 0;
  const defs = root.getElementsByTagName("defs")[0] || root.insertBefore(doc.createElementNS(SVG_NS, "defs"), root.firstChild);
  for (const r of [...root.getElementsByTagName("rect")]) {
    const m = /^url\(#([^)]+)\)$/.exec((r.getAttribute("fill") || "").trim());
    const pat = m && patterns.get(m[1]);
    if (!pat || r.closest?.("pattern, clipPath, mask, defs")) continue;
    const x = num(r.getAttribute("x")) ?? 0, y = num(r.getAttribute("y")) ?? 0, w = num(r.getAttribute("width")), h = num(r.getAttribute("height"));
    if (!(w > 0) || !(h > 0) || r.getAttribute("transform")) continue;
    const spans = (yRanges || [[-Infinity, Infinity]]).map(([a, b]) => [Math.max(y, a), Math.min(y + h, b)]).filter(([a, b]) => b > a);
    // merge overlapping spans
    spans.sort((u, v) => u[0] - v[0]); const merged = [];
    for (const s of spans) { const l = merged[merged.length - 1]; if (l && s[0] <= l[1]) l[1] = Math.max(l[1], s[1]); else merged.push([...s]); }
    let n = 0; for (const [a, b] of merged) n += Math.ceil((x + w) / pat.w - Math.floor(x / pat.w)) * Math.ceil(b / pat.h - Math.floor(a / pat.h) + 1e-9);
    if (tiles + n > maxTiles) continue;
    const cid = `ge-pc-${++clipN}`, clip = doc.createElementNS(SVG_NS, "clipPath"); clip.setAttribute("id", cid);
    for (const [a, b] of merged) { const cr = doc.createElementNS(SVG_NS, "rect"); cr.setAttribute("x", String(x)); cr.setAttribute("y", String(a)); cr.setAttribute("width", String(w)); cr.setAttribute("height", String(b - a)); clip.appendChild(cr); }
    defs.appendChild(clip);
    const g = doc.createElementNS(SVG_NS, "g"); g.setAttribute("clip-path", `url(#${cid})`);
    if (r.getAttribute("opacity")) g.setAttribute("opacity", r.getAttribute("opacity"));
    if (r.getAttribute("style")) g.setAttribute("style", r.getAttribute("style"));
    if (!pat.tileId) { // the tile's shapes once, as a <symbol> with the pattern's viewBox (it clips to it, as a pattern tile does); every repeat is a <use> of it
      pat.tileId = `ge-tile-${m[1]}`;
      const tg = doc.createElementNS(SVG_NS, "symbol"); tg.setAttribute("id", pat.tileId); tg.setAttribute("viewBox", pat.vb.join(" "));
      if (pat.p.getAttribute("preserveAspectRatio")) tg.setAttribute("preserveAspectRatio", pat.p.getAttribute("preserveAspectRatio"));
      for (const c of pat.p.childNodes) tg.appendChild(c.cloneNode(true));
      defs.appendChild(tg);
    }
    for (const [a, b] of merged) {
      for (let ty = Math.floor(a / pat.h) * pat.h; ty < b; ty += pat.h) for (let tx = Math.floor(x / pat.w) * pat.w; tx < x + w; tx += pat.w) {
        const t = doc.createElementNS(SVG_NS, "use");
        t.setAttribute("href", `#${pat.tileId}`); t.setAttribute("x", String(+tx.toFixed(3))); t.setAttribute("y", String(+ty.toFixed(3))); t.setAttribute("width", String(pat.w)); t.setAttribute("height", String(pat.h));
        g.appendChild(t); tiles++;
      }
    }
    r.parentNode.replaceChild(g, r);
    replaced++;
  }
  return replaced;
}

const decode = (src) => { const m = /^data:image\/svg\+xml;base64,/.exec(src || ""); if (!m) return null; return new TextDecoder().decode(b64ToBytes(src.slice(m[0].length))); };
const encode = (text) => `data:image/svg+xml;base64,${bytesToB64(new TextEncoder().encode(text))}`;

// TASKS.csv #3875 (follow-up of #3867) - an UNSPLIT strip log printed its patterns as bitmaps too (0.3 MB for the log measured there, soft at print size). The picture a strip log is added as has its
// tiled pattern fills drawn as vector tiles, as a split page's has: the same cropStripLogSlices with the one range [0, height]. A picture with no <pattern>, or one this cannot lay out (no browser), is returned as it came.
export function patternsAsVectors(src, naturalH, opts = {}) {
  const text = decode(src);
  if (!text || !/<pattern[\s>]/.test(text) || !(naturalH > 0)) return src;
  let out = null; try { out = cropStripLogSlices(src, [[0, naturalH]], opts); } catch { out = null; }
  return out?.[0] || src;
}

// The picture's SVG data URL cropped to each slice's ranges. slices: [[a, b], ...][] (one list of ranges per slice), in the picture's px. -> [data URL] in the same order, or null when the source cannot
// be cropped here (not an SVG data URL, no layout available): the caller keeps the whole picture then. Browser only (it lays the drawing out off screen to measure it).
export function cropStripLogSlices(src, slices, { document: doc = typeof document !== "undefined" ? document : null, DOMParser: DP = typeof DOMParser !== "undefined" ? DOMParser : null } = {}) {
  const text = decode(src);
  if (!text || !doc || !DP || !doc.body) return null;
  const parsed = new DP().parseFromString(text, "image/svg+xml");
  const root = parsed.documentElement;
  if (!root || tagOf(root) !== "svg" || parsed.getElementsByTagName("parsererror").length) return null;
  const vb = (root.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || !(vb[2] > 0) || !(vb[3] > 0)) return null;
  const holder = doc.createElement("div");
  holder.setAttribute("aria-hidden", "true");
  holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${vb[2]}px;height:${vb[3]}px;overflow:hidden;visibility:hidden;pointer-events:none`;
  const live = doc.importNode(root, true);
  live.setAttribute("width", String(vb[2])); live.setAttribute("height", String(vb[3]));
  holder.appendChild(live);
  doc.body.appendChild(holder);
  try {
    const rootRect = live.getBoundingClientRect();
    if (!(rootRect.height > 0)) return null;
    const sy = vb[3] / rootRect.height, bandPx = -vb[1];
    // each leaf's vertical extent once, in picture px (the drawing's viewBox spans the whole picture, so its top edge is 0)
    const leaves = [...live.querySelectorAll("*")].filter((e) => !e.children.length && !KEEP_TAGS.has(tagOf(e)) && !e.closest("defs, pattern, clipPath, mask, marker, symbol"));
    const extent = new Map(leaves.map((e) => { const r = e.getBoundingClientRect(); return [e, r.width === 0 && r.height === 0 ? null : { top: (r.top - rootRect.top) * sy, bottom: (r.bottom - rootRect.top) * sy }]; }));
    const out = [];
    for (const ranges of slices) {
      const copy = parsed.documentElement.cloneNode(true), map = new Map();
      const a = [...live.querySelectorAll("*")], b = [...copy.querySelectorAll("*")];
      if (a.length !== b.length) return null;
      a.forEach((e, i) => map.set(b[i], e));
      cropLeaves(copy, ranges, (el) => extent.get(map.get(el)) ?? null);
      expandPatternFills(copy, ranges.map(([a, b]) => [a - bandPx, b - bandPx])); // picture px -> the drawing's user space (its viewBox starts at y = -band)
      out.push(encode(new XMLSerializer().serializeToString(copy)));
    }
    return out;
  } finally { holder.remove(); }
}
