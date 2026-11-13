// TASKS.csv #3194 (Matt, 2026-11-13: "we should be able to snapshot the map view to layout") — the Maps plan's current view sent to the
// Layout page as a normal plan-map image, the way Geochem's plan map is (#1864: store addLayoutImage, LayoutModule's queue). The plan is north
// up at a known scale, so the element carries what a top-down, true-scale viewport carries (its centre, the metres it spans): Layout's scale
// bar ("Assign scale bar to this map"), its plan '1 : n' and its labelled coordinate grid (UtmGridOverlay) read them as they read a viewport's.
// Loaded on use (MapsPlanView's 'Snapshot to Layout', the 3D View's words for the same thing).
import { legendGroupsToItems, mapLayerLegendGroups, boundaryLegendGroups, rasterLegendGroups } from "./legendGroups.js";

// src: the plan canvas as a PNG data URL; pxW / pxH: its pixels (the canvas is drawn at the screen's pixel ratio); view: { cx, cy, mPerPx }
// (metres per CSS pixel); size: { w, h } (CSS pixels); the layers drawn; collarLegend: [{ label, colour }] when the collars are coloured.
// -> addLayoutImage's payload
// collars / samples: how many the plan draws in its plain colours (a row each when the collars are not coloured by a value)
export function mapSnapshotPayload({ src, pxW, pxH, view, size, mapLayers = [], boundaries = [], rasters = [], collarLegend = null, collarTitle = "", collars = 0, samples = 0, label = "Map view" }) {
  const widthM = size.w * view.mPerPx, heightM = size.h * view.mPerPx;
  const groups = [
    ...rasterLegendGroups((rasters || []).filter((r) => r.visible !== false)),
    ...mapLayerLegendGroups(mapLayers),
    ...boundaryLegendGroups(boundaries),
    ...(collarLegend?.length ? [{ key: "collars", label: collarTitle || "Collars", items: collarLegend.map((l) => [l.label, l.colour, { kind: "point" }]) }] : []),
    // the plan's plain marks (MapsPlanView: collars #1a2028, surface samples grey)
    ...(!collarLegend?.length && collars > 0 ? [{ key: "holes", label: "Drillholes", items: [[`Collars (${collars.toLocaleString("en-US")})`, "#1a2028", { kind: "point" }]] }] : []),
    ...(samples > 0 ? [{ key: "samples", label: "Surface samples", items: [[`Samples (${samples.toLocaleString("en-US")})`, "#5a6068", { kind: "point" }]] }] : []),
  ];
  return {
    label, src, naturalW: pxW, naturalH: pxH,
    worldWidthAtCaptureM: widthM, // the scale bar and the plan '1 : n' (a planMap image, #1864)
    planMap: true, mapsView: true,
    // a north-up, true-scale plan: what layoutGeometry's utmGridReady / vpToWorld read for the coordinate grid
    planView: true, trueScale: true, targetWorld: { x: view.cx, y: view.cy }, worldHeightAtTarget: heightM, cameraAzimuthDeg: 0,
    legendItems: legendGroupsToItems(groups),
  };
}
