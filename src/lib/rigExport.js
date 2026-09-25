// TASKS.csv #397 — planned holes for the rig and the field crew. The CSV export had grid azimuth only;
// aligning a rig and staking a collar need latitude/longitude and the azimuth against TRUE north (gyro,
// GPS compass) and MAGNETIC north (a handheld compass), which differ from grid north by the grid
// convergence and the magnetic declination (IGRF-14, already used by #396). KML (Google Earth, phones) and
// GPX (handheld GPS) carry the collars, and KML also the collar-to-toe line.
//
// Pure: reprojection + IGRF, no UI. `trace(hole)` gives the hole's world polyline ({x, y, z}) for the toe.
import { reprojectXY } from "./reproject.js";
import { azimuthToGridOffset, wrap360 } from "./azimuthRef.js";

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
  });
}

const esc = (s) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));

export function rigKML(rows, docName) {
  const marks = rows.filter((r) => r.lat !== "" && r.lon !== "").map((r) => {
    const desc = `Azimuth: ${r.azimuth_true !== "" ? `${r.azimuth_true}° true, ` : ""}${r.azimuth_magnetic !== "" ? `${r.azimuth_magnetic}° magnetic (${r.declination_date}), ` : ""}${r.azimuth_grid}° grid. Dip ${r.dip}°. Length ${r.length} m.${r.notes ? ` ${r.notes}` : ""}`;
    const line = r.toe_lat !== "" ? `
    <Placemark><name>${esc(r.name)} trace (plan)</name><styleUrl>#trace</styleUrl><LineString><tessellate>1</tessellate><coordinates>${r.lon},${r.lat},0 ${r.toe_lon},${r.toe_lat},0</coordinates></LineString></Placemark>` : "";
    return `
    <Placemark><name>${esc(r.name)}</name><description>${esc(desc)}</description><styleUrl>#collar</styleUrl><Point><coordinates>${r.lon},${r.lat},0</coordinates></Point></Placemark>${line}`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(docName)}</name>
    <Style id="collar"><IconStyle><scale>0.9</scale></IconStyle></Style>
    <Style id="trace"><LineStyle><color>ff1a7fe2</color><width>3</width></LineStyle></Style>${marks}
  </Document>
</kml>
`;
}

export function rigGPX(rows) {
  const wpts = rows.filter((r) => r.lat !== "" && r.lon !== "").map((r) =>
    `  <wpt lat="${r.lat}" lon="${r.lon}"><ele>${r2(r.z)}</ele><name>${esc(r.name)}</name><desc>${esc(`Az ${r.azimuth_true !== "" ? `${r.azimuth_true} T / ` : ""}${r.azimuth_magnetic !== "" ? `${r.azimuth_magnetic} M / ` : ""}${r.azimuth_grid} G, dip ${r.dip}, ${r.length} m`)}</desc><sym>Flag</sym></wpt>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GeoStrix" xmlns="http://www.topografix.com/GPX/1/1">
${wpts}
</gpx>
`;
}
