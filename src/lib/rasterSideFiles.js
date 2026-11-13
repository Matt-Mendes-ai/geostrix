// TASKS.csv #2857 (review GSC geophysics) — the files of one raster import, however they came (the dialog, a drop on the raster sidebar, a drop
// on the Maps plan): each image with its world file (#1855), Geosoft .xml (#2830) and .prj of the same name; a .prj was read as a bad
// TIFF and a dropped world file was set aside. Unreadable images (ECW, MrSID, JPEG 2000: #2854) are returned for their advice. Pure.
import { sideXmlFor } from "./geosoftXml.js";

const isWorld = (f) => /\.(tfw|tifw|tiffw|wld)$/i.test(f.name), isXml = (f) => /\.xml$/i.test(f.name), isPrj = (f) => /\.prj$/i.test(f.name);
const isImage = (f) => /\.(tiff?|gxf|grd)$/i.test(f.name), isUnreadable = (f) => /\.(ecw|sid|jp2|j2k)$/i.test(f.name);
const stem = (f) => String(f.name).replace(/\.[^.]+$/, "").toLowerCase();
const stemOfFull = (n) => String(n).toLowerCase().replace(/\.(tiff?|gxf|grd)\.[^.]+$/, ""); // 'a.tif.prj' -> 'a'

// files: File-like { name } -> { images: [{ file, world, xml, prj }], orphans: [side files with no image], unreadable: [files], ignored: [files] }
export function rasterFileSet(files) {
  const all = Array.from(files || []);
  const worlds = all.filter(isWorld), xmls = all.filter(isXml), prjs = all.filter(isPrj), images = all.filter(isImage);
  const used = new Set();
  const pick = (list, f) => { const s = stem(f), full = String(f.name).toLowerCase(); const g = list.find((w) => stem(w) === s || stemOfFull(w.name) === s || String(w.name).toLowerCase().startsWith(`${full}.`)); if (g) used.add(g); return g || null; };
  const out = images.map((file) => { const xml = sideXmlFor(file, xmls); if (xml) used.add(xml); return { file, world: pick(worlds, file), xml, prj: pick(prjs, file) }; });
  const orphans = [...worlds, ...xmls, ...prjs].filter((f) => !used.has(f));
  return { images: out, orphans, unreadable: all.filter(isUnreadable), ignored: all.filter((f) => !isImage(f) && !isWorld(f) && !isXml(f) && !isPrj(f) && !isUnreadable(f)) };
}
