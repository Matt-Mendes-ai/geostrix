// TASKS.csv #1048 / #1068 (review #1016, software artist + structural geologist) — the caption and key of an exported
// figure. Every figure export serialized only its <svg>; what a reader needs to interpret it (which net, n, filters, the
// statistics, what the colours mean, which hole) sat in the dialog's HTML around it, so a Terzaghi-corrected contour
// plot exported indistinguishable from the raw one and a strip log could not be identified without its file name.
// furnitureLayout lays a caption block and colour keys out in a band under the figure; exportSvgMarkup (svgExport.js)
// draws it into the CLONE it serializes, so the on-screen figure does not change. Pure: no DOM.
//
// furniture: { title?, caption: [line, ...], keys: [{ title?, items: [{ label, color, shape?: "dot" | "box" | "line" }] }] }
// width: the figure's width (SVG units). -> { height, items: [{ type: "text", x, y, text, size, weight, fill }
//   | { type: "swatch", x, y, w, h, fill, shape }] } with y measured from the top of the band
const CHAR_W = 0.56; // average glyph width / font size for the figure font (Exo 2 / Segoe UI), close enough to wrap on

export function wrapText(text, maxChars) {
  const out = [];
  for (const para of String(text ?? "").split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
      else { out.push(line); line = word; }
      while (line.length > maxChars) { out.push(line.slice(0, maxChars)); line = line.slice(maxChars); } // one very long token
    }
    out.push(line);
  }
  return out;
}

export function furnitureLayout(furniture, width, { fontSize = 11, pad = 10, text = "#1a2028", muted = "#55606e" } = {}) {
  const f = furniture || {}, items = [];
  const caption = (f.caption || []).filter((l) => l != null && String(l).trim());
  const keys = (f.keys || []).filter((k) => k?.items?.length);
  if (!f.title && !caption.length && !keys.length) return { height: 0, items };
  const usable = Math.max(40, width - 2 * pad), lineH = fontSize * 1.35;
  let y = pad;
  if (f.title) {
    for (const l of wrapText(f.title, Math.floor(usable / (CHAR_W * fontSize * 1.2)))) { y += fontSize * 1.2 * 1.3; items.push({ type: "text", x: pad, y, text: l, size: fontSize * 1.2, weight: 700, fill: text }); }
    y += 2;
  }
  const maxChars = Math.floor(usable / (CHAR_W * fontSize));
  for (const c of caption) for (const l of wrapText(c, maxChars)) { y += lineH; items.push({ type: "text", x: pad, y, text: l, size: fontSize, weight: 400, fill: muted }); }
  const sw = fontSize * 0.9, ks = fontSize * 0.95;
  for (const k of keys) {
    y += 4;
    let x = pad;
    if (k.title) { y += lineH; items.push({ type: "text", x, y, text: k.title, size: ks, weight: 600, fill: text }); x += k.title.length * CHAR_W * ks + 10; }
    else y += lineH;
    for (const it of k.items) {
      const label = String(it.label ?? ""), w = sw + 4 + label.length * CHAR_W * ks + 12;
      if (x > pad && x + w > pad + usable) { x = pad; y += lineH; }
      items.push({ type: "swatch", x, y: y - sw + 1, w: sw, h: sw, fill: it.color || "#999999", shape: it.shape || "box" });
      items.push({ type: "text", x: x + sw + 4, y, text: label, size: ks, weight: 400, fill: text });
      x += w;
    }
  }
  return { height: Math.ceil(y + pad), items };
}

// TASKS.csv #1068 — the stereonet / rose caption: which net, how many picks of what, Terzaghi, the statistics, the keys.
// Export text stays English (project data and file text are English; see CLAUDE.md). o: what the dialog shows —
// { view, projection, roseMode, roseBin, plotted, filtered, total, source, typeFilter, domainName, stats, shape,
//   showMean, contour (null when contours are off), contourLevels, contourColors, types: [{ label, color }], roseN, date }
export function stereonetFurniture(o) {
  const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "?"), s = o.stats;
  const caption = [];
  caption.push(o.view === "rose"
    ? `Rose diagram of ${o.roseMode === "dipdir" ? "dip directions (0-360°)" : "strikes (bidirectional)"}, ${o.roseBin}° bins; petal area proportional to count${o.roseN != null ? `, n = ${o.roseN}` : ""}`
    : `${o.projection === "equalAngle" ? "Equal-angle (Wulff)" : "Equal-area (Schmidt)"} net, lower hemisphere, poles to planes`);
  const missing = o.filtered - o.plotted;
  caption.push(`n = ${o.plotted.toLocaleString("en-US")} of ${o.filtered.toLocaleString("en-US")} picks plotted (${o.total.toLocaleString("en-US")} in all)${missing > 0 ? `; ${missing} without a dip direction (alpha only) not plotted` : ""} · source: ${o.source === "downhole" ? "downhole picks" : o.source === "surface" ? "outcrop measurements" : "downhole and outcrop"} · type: ${!o.typeFilter || o.typeFilter === "all" ? "all" : o.typeFilter} · domain: ${o.domainName || "whole property"}`);
  const tz = s?.terzaghi;
  caption.push(tz?.applied ? `Terzaghi-weighted: ${tz.weighted} of ${s.n} picks weighted by 1/sin(alpha)${tz.unweighted ? `, ${tz.unweighted} at weight 1` : ""}${tz.cappedCount ? `, ${tz.cappedCount} at the ×${tz.maxWeight} cap` : ""}; effective n = ${f1(s.nEff)}` : "Not Terzaghi-weighted");
  if (s && (o.view === "rose" || o.showMean)) {
    let st = `Mean plane ${f1(s.meanDip)}° / ${f1(s.meanDipDir)}° (dip / dip direction), pole ${f1(s.meanPlunge)}° → ${f1(s.meanTrend)}°`;
    st += s.noPreferred ? "; no preferred orientation (k < 3, or random by Bingham's test): no confidence cone" : `; k = ${s.k === Infinity ? "∞" : f1(s.k)}, α95 = ${f1(s.alpha95)}°`;
    st += `; S = ${s.s1.toFixed(2)} / ${s.s2.toFixed(2)} / ${s.s3.toFixed(2)}`;
    if (o.shape === "girdle") st += `; girdle: fold (β) axis ${f1(s.betaPlunge)}° → ${f1(s.betaTrend)}°`;
    caption.push(st);
  }
  if (o.contour) caption.push(`Kamb density contours in σ above a uniform spread of the same n; counting circle ${f1(o.contour.countingAngleDeg)}°, n = ${o.contour.n}, peak ${f1(o.contour.maxSigma)}σ${o.contour.n < 20 ? ". Low sample count: treat the contours as indicative only" : ""}`);
  caption.push(`GeoStrix${o.date ? ` · ${o.date}` : ""}`);
  const keys = [];
  if (o.view !== "rose" && (o.types || []).length > 1) keys.push({ title: "Structure type", items: o.types.map((t) => ({ label: t.label, color: t.color, shape: "dot" })) });
  if (o.contour) keys.push({ title: "Kamb σ", items: o.contourLevels.map((lv, k) => ({ label: k === o.contourLevels.length - 1 ? `≥ ${lv}` : `${lv}–${o.contourLevels[k + 1]}`, color: o.contourColors[k] })) });
  return { caption, keys };
}

// TASKS.csv #1048 (also exploration geologist #8) — the strip log's title block and code keys: the hole ID was only in
// the dialog header and the file name. o: { holeId, collar ({ x, y, z, azimuth, dip, length }), maxDepth, pxPerMeter,
// tracks: [{ title, items: [{ label, color }] }] (the codes shown in each colour track), date }
export function stripLogFurniture(o) {
  const c = o.collar || {}, num = (v, d = 0) => (Number.isFinite(+v) && v !== "" && v != null ? (+v).toFixed(d) : null);
  const at = [num(c.x, 1) && `E ${num(c.x, 1)}`, num(c.y, 1) && `N ${num(c.y, 1)}`, num(c.z, 1) && `RL ${num(c.z, 1)}`].filter(Boolean).join(", ");
  const att = num(c.azimuth, 1) != null && num(c.dip, 1) != null ? `azimuth ${num(c.azimuth, 1)}°, dip ${num(c.dip, 1)}° (at the collar)` : null;
  const caption = [
    [at && `Collar ${at}`, att].filter(Boolean).join(" · ") || "Collar position not loaded",
    `Depth 0-${num(o.maxDepth, 1)} m along the hole${num(c.length) ? ` (EOH ${num(c.length, 1)} m)` : ""} · ${o.pxPerMeter} px per metre · GeoStrix${o.date ? ` · ${o.date}` : ""}`,
  ];
  const MAX = 40;
  const keys = (o.tracks || []).filter((t) => t.items?.length).map((t) => ({ title: t.title, items: t.items.length > MAX ? [...t.items.slice(0, MAX - 1), { label: `+${t.items.length - MAX + 1} more`, color: "#ffffff" }] : t.items }));
  return { placement: "top", title: `Strip log: ${o.holeId}`, caption, keys };
}

// TASKS.csv #1048 — the PNG scale under Chromium's canvas side limit (32,767 px): at 2x a strip log taller than ~16,380
// SVG units (2,700 m at 6 px/m, 405 m at 40 px/m) gave a blank / failed canvas with no word. -> { scale, reduced }
export function pngScaleFor(w, h, want = 2, maxSide = 32000) {
  const scale = Math.min(want, maxSide / Math.max(1, w), maxSide / Math.max(1, h));
  return { scale, reduced: scale < want };
}

// TASKS.csv #1017 — the furniture of four more figure exports, moved out of their dialogs so a test can read them
// (stereonet and strip log above). Export text stays English. date: "YYYY-MM-DD".

// Fence diagram: the holes, the section bearing and how it was chosen, the exaggeration, the off-section flag, the
// correlation-band caveat, the lithology key. colorOf(code) -> colour.
export function fenceFurniture({ holeIds, azimuth, fitted, ve, offsetLimit, bands, codes = [], colorOf, date }) {
  return {
    title: `Fence diagram: ${holeIds.join(", ")}`,
    caption: [`Section bearing ${azimuth.toFixed(1)}° (${fitted ? "best fit through the collars" : "fixed"}) · vertical exaggeration ${ve}x · holes more than ${offsetLimit} m off the section flagged amber${bands ? " · shaded bands join the shallowest shared code between adjacent holes: an interpretation, not a measurement" : ""}`, `GeoStrix · ${date}`],
    keys: codes.length ? [{ title: "Lithology", items: codes.map((c) => ({ label: c, color: colorOf(c) })) }] : [],
  };
}

// Tadpole plot: the hole, how to read the tails, alpha or true dip, the type and lithology keys (a type key only when
// there is more than one type)
export function tadpoleFurniture({ hole, alpha, picks, types = [], typeColor, lithoCodes = [], lithColor, date }) {
  return {
    title: `Tadpole plot: ${hole || "hole"}`,
    caption: [`Each dot sits at its ${alpha ? "alpha (angle to the core axis)" : "true dip"} and its depth; the tail points in the structure's dip direction, north up the page. A hollow dot is an alpha-only pick (core not oriented): no tail.`,
      `${picks} pick(s) · GeoStrix · ${date}`],
    keys: [...(types.length > 1 ? [{ title: "Structure type", items: types.map((t) => ({ label: t, color: typeColor(t), shape: "dot" })) }] : []),
      ...(lithoCodes.length ? [{ title: "Lithology", items: lithoCodes.map((v) => ({ label: v, color: lithColor(v) })) }] : [])],
  };
}

// Geochemical diagram: the diagram's own caption, how many samples were plotted of how many (and how many the lithology
// filter hid), the below-detection rule, the colour key (more than 40 entries: 39 and a "+n more" line).
// hidden: samples hidden by the lithology filter, or null when no filter is on
export function geochemFurniture({ title, caption, plotted, total, spider, hidden = null, keyTitle = "", keyItems = [], date }) {
  return {
    title,
    caption: [caption, `${plotted} of ${total} samples ${spider ? "have at least one plottable element" : "plotted"}${hidden != null ? `; ${hidden} hidden by the lithology filter` : ""}. Below-detection values substituted at half the detection limit.`, `GeoStrix · ${date}`],
    keys: keyItems.length ? [{ title: keyTitle, items: keyItems.length > 40 ? [...keyItems.slice(0, 39), { label: `+${keyItems.length - 39} more`, color: "#ffffff" }] : keyItems }] : [],
  };
}

// Level plan: the legend under the plan, drawn into the PNG (the first 60 entries and a "+n more" line). legend: [[label,
// colour], ...]. null when there is nothing to key.
export function levelPlanFurniture(legend = []) {
  return legend.length ? { keys: [{ title: "Legend", items: legend.slice(0, 60).map(([label, color]) => ({ label, color })).concat(legend.length > 60 ? [{ label: `+${legend.length - 60} more`, color: "#ffffff" }] : []) }] } : null;
}
