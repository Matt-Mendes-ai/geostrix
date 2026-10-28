// TASKS.csv #397 — planned holes for the rig and the field crew. The CSV export had grid azimuth only;
// aligning a rig and staking a collar need latitude/longitude and the azimuth against TRUE north (gyro,
// GPS compass) and MAGNETIC north (a handheld compass), which differ from grid north by the grid
// convergence and the magnetic declination (IGRF-14, already used by #396). KML (Google Earth, phones) and
// GPX (handheld GPS) carry the collars, and KML also the collar-to-toe line.
// TASKS.csv #1017 — the hole's whole planned trace in plan (lift and drift included, not a straight collar-to-toe chord),
// in the KML and as a GPX track too.
//
// Pure: reprojection + IGRF, no UI. `trace(hole)` gives the hole's world polyline ({x, y, z}) for the toe.
import { reprojectXY } from "./reproject.js";
import { azimuthToGridOffset, wrap360, setIgrfModule } from "./azimuthRef.js";
import * as igrf from "./igrf.js"; // #552 — this module is loaded on demand, so it brings IGRF with it
import { colors } from "./theme.js"; // TASKS.csv #1121
setIgrfModule(igrf);

const r7 = (v) => (Number.isFinite(v) ? Number(v.toFixed(7)) : "");
const r2 = (v) => (Number.isFinite(v) ? Number(v.toFixed(2)) : "");

export function rigRows(holes, epsg, isoDate, trace) {
  return holes.map((h) => {
    const pts = trace(h) || [];
    const toe = pts.length ? pts[pts.length - 1] : null;
    const ll = reprojectXY(h.x, h.y, epsg, 4326);
    const tll = toe ? reprojectXY(toe.x, toe.y, epsg, 4326) : null;
    const mag = azimuthToGridOffset("magnetic", h.x, h.y, epsg, isoDate); // grid = magnetic + D + c
    const conv = mag?.convergence ?? azimuthToGridOffset("true", h.x, h.y, epsg)?.convergence;
    return {
      name: h.name || "", x: h.x, y: h.y, z: h.z,
      lat: r7(ll?.y), lon: r7(ll?.x),
      azimuth_grid: r2(h.azimuth),
      azimuth_true: Number.isFinite(conv) ? r2(wrap360(h.azimuth - conv)) : "",
      azimuth_magnetic: mag ? r2(wrap360(h.azimuth - mag.offset)) : "",
      declination_deg: mag ? r2(mag.declination) : "", convergence_deg: Number.isFinite(conv) ? r2(conv) : "",
      declination_date: mag ? isoDate : "",
      dip: h.dip, length: h.length,
      toe_x: toe ? r2(toe.x) : "", toe_y: toe ? r2(toe.y) : "", toe_z: toe ? r2(toe.z) : "",
      toe_lat: r7(tll?.y), toe_lon: r7(tll?.x),
      notes: h.notes || "",
    };
  }).map((row, i) => {
    // #1017 — the trace in lon / lat, kept off the CSV columns (non-enumerable: Papa.unparse and Object.keys skip it)
    const pts = trace(holes[i]) || [], step = Math.max(1, Math.ceil(pts.length / 200));
    const ll = pts.filter((_, k) => k % step === 0 || k === pts.length - 1).map((p) => reprojectXY(p.x, p.y, epsg, 4326)).filter(Boolean).map((q) => [r7(q.x), r7(q.y)]);
    Object.defineProperty(row, "traceLonLat", { value: ll, enumerable: false });
    return row;
  });
}

const esc = (s) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));

// TASKS.csv #1121 — colors.planned as KML aabbggrr, for the trace and a tinted collar circle (Google Earth's default
// was a yellow pushpin). The placemark_circle href is one of Google Earth's built-in icons, resolved by the viewer;
// GeoStrix fetches nothing.
const KML_PLANNED = `ff${colors.planned.slice(5, 7)}${colors.planned.slice(3, 5)}${colors.planned.slice(1, 3)}`;
export function rigKML(rows, docName) {
  const marks = rows.filter((r) => r.lat !== "" && r.lon !== "").map((r) => {
    const desc = `Azimuth: ${r.azimuth_true !== "" ? `${r.azimuth_true}° true, ` : ""}${r.azimuth_magnetic !== "" ? `${r.azimuth_magnetic}° magnetic (${r.declination_date}), ` : ""}${r.azimuth_grid}° grid. Dip ${r.dip}°. Length ${r.length} m.${r.notes ? ` ${r.notes}` : ""}`;
    const line = r.toe_lat !== "" ? `
    <Placemark><name>${esc(r.name)} trace (plan)</name><styleUrl>#trace</styleUrl><LineString><tessellate>1</tessellate><coordinates>${(r.traceLonLat?.length > 1 ? r.traceLonLat : [[r.lon, r.lat], [r.toe_lon, r.toe_lat]]).map(([lo, la]) => `${lo},${la},0`).join(" ")}</coordinates></LineString></Placemark>` : "";
    return `
    <Placemark><name>${esc(r.name)}</name><description>${esc(desc)}</description><styleUrl>#collar</styleUrl><Point><coordinates>${r.lon},${r.lat},0</coordinates></Point></Placemark>${line}`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(docName)}</name>
    <Style id="collar"><IconStyle><color>${KML_PLANNED}</color><scale>0.9</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>
    <Style id="trace"><LineStyle><color>${KML_PLANNED}</color><width>3</width></LineStyle></Style>${marks}
  </Document>
</kml>
`;
}

export function rigGPX(rows) {
  const wpts = rows.filter((r) => r.lat !== "" && r.lon !== "").map((r) =>
    `  <wpt lat="${r.lat}" lon="${r.lon}"><ele>${r2(r.z)}</ele><name>${esc(r.name)}</name><desc>${esc(`Az ${r.azimuth_true !== "" ? `${r.azimuth_true} T / ` : ""}${r.azimuth_magnetic !== "" ? `${r.azimuth_magnetic} M / ` : ""}${r.azimuth_grid} G, dip ${r.dip}, ${r.length} m`)}</desc><sym>Flag</sym></wpt>`).join("\n");
  // #1017 — each hole's planned trace in plan as a track, beside its collar waypoint
  const trks = rows.filter((r) => r.traceLonLat?.length > 1).map((r) => `  <trk><name>${esc(`${r.name} trace (plan)`)}</name><trkseg>${r.traceLonLat.map(([lo, la]) => `<trkpt lat="${la}" lon="${lo}"/>`).join("")}</trkseg></trk>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GeoStrix" xmlns="http://www.topografix.com/GPX/1/1">
${wpts}${trks ? `
${trks}` : ""}
</gpx>
`;
}
