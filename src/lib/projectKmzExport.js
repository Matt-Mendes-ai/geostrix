// TASKS.csv #3068 — File > Export project as KMZ…: the renderer half of projectKmz.js. Finds where the project sits on Earth (its CRS, or a
// local grid's tie), recomputes the surface samples' anomaly classes as the 3D View draws them, draws each layer's legend on a canvas, warns
// before writing a very large file, zips doc.kml (deflated) with the icons, legends and raster images, and saves it.
import { t as tr } from "./i18n.js";
import { buildProjectKml, estimateProjectKmz, DOT_ICON, STRIKE_ICON } from "./projectKmz.js";
import { buildKmz } from "./kmzZip.js";
import { lonLatTransform } from "./overlayExport.js";
import { ensureExportCrs } from "./projectCrsRequest.js";
import { tieOf, localToWorld } from "./localGridTie.js";
import { rlOffsetOf, rlToElevation } from "./localGridDatum.js";
import { rasterLegendGroups } from "./legendGroups.js";
import { b64ToBytes } from "./base64.js";
import { rgbaToPng, strikeSymbolPng } from "./strikeIcon.js";
import { structureIconSet } from "./structureKmzIcons.js"; // #3068 part 2 — the icon set the outcrop KMZ uses too
import { saveFile, safeFileName, EXPORT_RESULT_EVENT } from "./desktop.js";

export const KMZ_WARN_BYTES = 150 * 1024 * 1024; // above this the export asks first

// a white disc the KML colours (collars, samples, points)
export function dotPng(size = 32) {
  const rgba = new Uint8Array(size * size * 4), c = (size - 1) / 2, r = size / 2 - 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - c, y - c), a = Math.max(0, Math.min(1, r - d + 0.5)), i = (y * size + x) * 4;
    const edge = d > r - 2.5; // a dark rim so a pale class still reads on imagery
    rgba[i] = rgba[i + 1] = rgba[i + 2] = edge ? 40 : 255; rgba[i + 3] = Math.round(255 * a);
  }
  return rgbaToPng(size, size, rgba);
}

// TASKS.csv #3250 (Matt, 2026-11-13: Google Earth "files/raster_1.webp — Unsupported image type") — rasters keep their picture as WebP
// (raster.js, imagery and web-layer fetches) and Google Earth reads only PNG / JPEG / GIF in a KMZ: a WebP picture is redrawn as PNG
// (transparency kept) before it is written. -> the data URL to write
export async function kmzImageUrl(url) {
  if (!/^data:image\/webp[;,]/i.test(String(url || "")) || typeof document === "undefined") return url;
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cv.getContext("2d").drawImage(img, 0, 0);
    const png = cv.toDataURL("image/png");
    return png.startsWith("data:image/png") ? png : null;
  } catch { return null; } // left out (and counted as not written) rather than written as a picture Google Earth refuses
}

function dataUrlBytes(url) {
  const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(String(url || "")); // not webp: Google Earth refuses it (#3250, kmzImageUrl)
  return m ? { bytes: b64ToBytes(m[2]), ext: m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase() } : null;
}

// a legend group ({ label, items: [[label, colour]], ramp?: { colors, minLabel, maxLabel } }) drawn on a canvas -> { bytes, width, height }
export function legendCanvasPng(group) {
  if (typeof document === "undefined") return null;
  const items = (group.items || []).filter(([, c]) => c).slice(0, 30);
  const font = "12px Segoe UI, Arial, sans-serif", head = "bold 12px Segoe UI, Arial, sans-serif", row = 18, pad = 8;
  const cv = document.createElement("canvas"), g = cv.getContext("2d");
  g.font = font;
  const rampH = group.ramp ? 34 : 0;
  const more = (group.items || []).length > items.length ? 1 : 0;
  const textW = Math.max(120, ...items.map(([l]) => g.measureText(String(l)).width + 26), (g.font = head, g.measureText(group.label).width));
  cv.width = Math.ceil(Math.min(360, textW + pad * 2));
  cv.height = Math.ceil(pad * 2 + 18 + items.length * row + rampH + more * row);
  g.fillStyle = "rgba(255,255,255,0.92)"; g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = "#8a96a3"; g.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);
  g.fillStyle = "#1f2933"; g.font = head; g.textBaseline = "middle";
  g.fillText(group.label, pad, pad + 8, cv.width - pad * 2);
  g.font = font;
  let y = pad + 18;
  for (const [label, color] of items) {
    g.fillStyle = color; g.fillRect(pad, y + 3, 14, 12); g.strokeStyle = "#55606e"; g.strokeRect(pad + 0.5, y + 3.5, 13, 11);
    g.fillStyle = "#1f2933"; g.fillText(String(label), pad + 20, y + 9, cv.width - pad * 2 - 20);
    y += row;
  }
  if (more) { g.fillStyle = "#55606e"; g.fillText(tr("+ {n} more", { n: group.items.length - items.length }), pad, y + 9); y += row; }
  if (group.ramp?.colors?.length) {
    const cols = group.ramp.colors, bw = cv.width - pad * 2, step = bw / cols.length;
    cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(pad + i * step, y + 2, Math.ceil(step), 12); });
    g.fillStyle = "#1f2933"; g.textAlign = "left"; g.fillText(group.ramp.minLabel ?? "", pad, y + 24);
    g.textAlign = "right"; g.fillText(group.ramp.maxLabel ?? "", cv.width - pad, y + 24); g.textAlign = "left";
  }
  const bytes = dataUrlBytes(cv.toDataURL("image/png"))?.bytes;
  return bytes ? { bytes, width: cv.width, height: cv.height } : null;
}

// store: the useStore() value. -> { ok, filePath?, counts?, cancelled? }
export async function exportProjectKmz(store, { confirm = (m) => window.confirm(m), include = null } = {}) { // include: TASKS.csv #3087 — the parts ticked
  const project = store.project || {};
  // where the coordinates are on Earth: a local grid through its tie, else the project CRS (asked for when never chosen)
  const tie = tieOf(project);
  let toLonLat, crsLabel, epsgUsed = null; // epsgUsed: the CRS the export resolved (it may have just been chosen)
  if (tie) {
    const tf = await lonLatTransform(tie.epsg);
    if (!tf) return { ok: false, error: tr("The local grid's tie has no coordinate system.") };
    toLonLat = (x, y) => { const p = localToWorld(tie, x, y); return tf(p.x, p.y); };
    crsLabel = `EPSG:${tie.epsg} (local grid tie)`;
  } else {
    const epsg = await ensureExportCrs(project);
    if (!epsg) return { ok: false, cancelled: true };
    epsgUsed = epsg;
    toLonLat = await lonLatTransform(epsg);
    crsLabel = `EPSG:${epsg}`;
  }
  const rl = rlOffsetOf(project);
  const altOf = rl == null ? (z) => z : (z) => rlToElevation(z, rl);
  const ui = store.viewerUiState || {};
  const ctx = {
    projectName: project.name || "GeoStrix project", epsg: tie ? null : epsgUsed,
    collars: store.collars, survey: store.survey, desurveyMethod: store.desurveyMethod, layers: store.layers, customLayers: store.customLayers,
    assays: store.assays, assayElements: store.assayElements, surfaceSamples: store.surfaceSamples, surfaceStructures: store.surfaceStructures,
    mapLayers: store.mapLayers, boundaries: store.boundaries, plannedHoles: store.plannedHoles, sections: store.sections, rasters: store.rasters,
    designLines: store.designLines, designStrings: store.designStrings, // #3087
    generatedSurfaces: store.generatedSurfaces, voxelModels: store.voxelModels, terrain: store.terrain, sectionImages: store.sectionImages, // #3087 part 2
    layerGroups: store.layerGroups, ui,
  };
  const est = estimateProjectKmz(ctx);
  if (est > KMZ_WARN_BYTES && !confirm(tr("This project's KMZ would hold about {mb} MB of KML before compression. Google Earth may be slow to open a file this large. Export anyway?", { mb: Math.round(est / 1048576).toLocaleString() }))) return { ok: false, cancelled: true };
  // the surface samples' anomaly classes, as the 3D View colours them (its settings are saved in layerStyles.surface_anomaly)
  const cfg = ui.layerStyles?.surface_anomaly;
  if (cfg && cfg.mode !== "medium" && (store.surfaceSamples || []).length) {
    try {
      const m = await import("./anomalyMap.js");
      const units = Object.fromEntries((store.surfaceElements || []).map((e) => [e.symbol, e.unit]));
      const a = m.anomalyClasses(store.surfaceSamples, cfg, { units, mapLayers: store.mapLayers, thresholds: store.geochemThresholds });
      if (a) ctx.anomaly = { ...a, label: m.anomalyLegendGroup(a)?.label || a.label };
    } catch { /* by medium, as when no classes are set */ }
  }
  // #3250 — every raster picture and colour-bar picture as PNG / JPEG for Google Earth
  const kmzUrl = new Map();
  const urls = [...(store.rasters || []).flatMap((r) => [r?.dataUrl, r?.legendImage?.dataUrl]), ...(store.sectionImages || []).map((im) => im?.dataUrl)]; // section images: #3087 part 2
  for (const u of urls) if (u && !kmzUrl.has(u)) kmzUrl.set(u, await kmzImageUrl(u));
  const asKmz = (u) => (kmzUrl.has(u) ? kmzUrl.get(u) : u);
  const rasterImage = (r) => {
    const img = dataUrlBytes(asKmz(r.dataUrl));
    if (!img) return null;
    const lg = r.legendImage?.dataUrl ? null : rasterLegendGroups([{ ...r, visible: true }])[0];
    return { ...img, legend: lg && (lg.items?.length || lg.ramp) ? lg : null };
  };
  // the structures' USGS symbols (true strike from the project CRS; on a local grid, the grid bearing)
  const icons = (store.surfaceStructures || []).length ? await structureIconSet(store.surfaceStructures, { px: 64, epsg: tie ? null : ctx.epsg }) : { files: [], iconOf: () => null };
  const out = buildProjectKml(ctx, { toLonLat, altOf, legendPng: legendCanvasPng, rasterImage, crsLabel, structureIconOf: (row, set) => icons.iconOf(row, set), include, imageBytes: (u) => dataUrlBytes(asKmz(u)) });
  const kmz = await buildKmz([
    { name: "doc.kml", data: new TextEncoder().encode(out.kml), deflate: true },
    { name: DOT_ICON, data: dotPng() },
    ...(out.kml.includes(STRIKE_ICON) ? [{ name: STRIKE_ICON, data: strikeSymbolPng(64) }] : []), // #3068 part 2 — only for a reading with no USGS symbol
    ...out.files,
    ...icons.files.filter((f) => out.kml.includes(f.name)),
  ]);
  const res = await saveFile({ quiet: true, suggestedName: `${safeFileName(ctx.projectName, "project")}.kmz`, filters: [{ name: "KMZ (Google Earth)", extensions: ["kmz"] }], content: kmz });
  if (res?.ok) {
    const c = out.counts;
    const file = String(res.filePath || "").split(/[\\/]/).pop() || `${ctx.projectName}.kmz`;
    // TASKS.csv #3087 part 2 — the models left out, and how many went in
    const skipText = (s) => (s.kind === "assays" ? tr("{n} assay element(s) the 3D View neither shows nor classes are left out.", { n: s.n })
      : s.kind === "model" ? tr("The model \"{name}\" has {n} triangles, more than a KMZ model can take, and is left out.", { name: s.name, n: s.n.toLocaleString() })
        : s.kind === "model-place" ? tr("The model \"{name}\" could not be placed on the map and is left out.", { name: s.name })
          : s.kind === "image" ? tr("The section image \"{name}\" has no picture and is left out.", { name: s.name })
            : tr("The raster \"{name}\" has no image and is left out.", { name: s.name }));
    const left = [...(c.models ? [c.models === 1 ? tr("1 3D model.") : tr("{n} 3D models.", { n: c.models.toLocaleString() })] : []), ...c.skipped.map(skipText)];
    const message = [tr("Saved {file} ({mb} MB): {h} drillholes, {l} layers, {r} rasters, {g} legends.", { file, mb: (kmz.length / 1048576).toFixed(1), h: c.holes.toLocaleString(), l: c.layers.toLocaleString(), r: c.rasters.toLocaleString(), g: c.legends.toLocaleString() }), ...left].join(" ");
    try { window.dispatchEvent(new CustomEvent(EXPORT_RESULT_EVENT, { detail: { ok: true, filePath: res.filePath || null, message } })); } catch { /* no window */ }
  } else if (res?.error) {
    try { window.dispatchEvent(new CustomEvent(EXPORT_RESULT_EVENT, { detail: { ok: false, error: res.error, name: "KMZ" } })); } catch { /* no window */ }
  }
  return { ...res, counts: out.counts, bytes: kmz.length };
}
