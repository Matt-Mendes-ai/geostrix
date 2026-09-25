// TASKS.csv #404 — parameter stamps for tabular outputs (intercepts, composites, block models), the
// JORC Table 1 / NI 43-101 audit-trail point: a CSV of intercepts or composites that does not say which
// cutoff, dilution, minimum length, below-detection rule, cap and QAQC handling produced it cannot be
// reproduced or checked later. Grade shells and meshes already do this (meshExport.js provenanceLines);
// this is the CSV counterpart. Lines go at the top of the file prefixed with "# " — GeoStrix's own CSV
// importers skip them (Papa comments: "#"), and most CSV readers either do the same or show them as
// leading rows that are easy to delete.

export const NOT_A_RESOURCE = "GeoStrix exploration output — not a Mineral Resource estimate; must not be reported publicly as one under NI 43-101 or JORC.";

// How assay values were read at import (geochem.js readAssayCell / parseAssayValue), which every
// downstream grade depends on.
export const ASSAY_READING_RULES = "Assay reading: '<x' (below detection) = x/2; '>x' (over-range) = x, a minimum; negative codes -0.005 style = half the absolute value unless chosen otherwise at import, <= -99 = not assayed.";

export function stampLines({ tool, version, epsg, params = [] }) {
  return [
    NOT_A_RESOURCE,
    `Tool: ${tool}${version ? ` | GeoStrix ${version}` : ""} | generated ${new Date().toISOString()}`,
    ...(epsg ? [`Project CRS: EPSG:${epsg}`] : []),
    ...params.filter(Boolean),
  ];
}

export function withStamp(csvText, lines) {
  return `${lines.map((l) => `# ${String(l).replace(/\r?\n/g, " ")}`).join("\n")}\n${csvText}`;
}
