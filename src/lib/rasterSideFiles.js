// TASKS.csv #2857 (review GSC geophysics) — the files of one raster import, however they came (the dialog, a drop on the raster sidebar, a drop
// on the Maps plan): each image with its world file (#1855), Geosoft .xml (#2830) and .prj of the same name; a .prj was read as a bad
// TIFF and a dropped world file was set aside. Unreadable images (ECW, MrSID, JPEG 2000: #2854) are returned for their advice. Pure.
// TASKS.csv #4066 — an ER Mapper .ers header comes with its DATA file, the file of the same name with no extension (or the name the header's
// DataFile gives; one GSQ set names it stem.dat): it is paired here and handed on through ersDataOf(file), so the callers keep passing the header file as they pass a .gxf.
import { sideXmlFor } from "./geosoftXml.js";

const isWorld = (f) => /\.(tfw|tifw|tiffw|wld)$/i.test(f.name), isXml = (f) => /\.xml$/i.test(f.name), isPrj = (f) => /\.prj$/i.test(f.name);
const isImage = (f) => /\.(tiff?|gxf|grd|ers)$/i.test(f.name), isUnreadable = (f) => /\.(ecw|sid|jp2|j2k)$/i.test(f.name);
const stem = (f) => String(f.name).replace(/\.[^.]+$/, "").toLowerCase();
const stemOfFull = (n) => String(n).toLowerCase().replace(/\.(tiff?|gxf|grd|ers)\.[^.]+$/, ""); // 'a.tif.prj' -> 'a'

// header file -> its data file (set by rasterFileSet; a File cannot be given another property the callers would pass on)
const ersData = new WeakMap();
export const ersDataOf = (file) => ersData.get(file) || null;
export const setErsData = (file, data) => { if (file && data) ersData.set(file, data); }; // the Browser panel reads the sibling itself
export const noExtension = (f) => !/\.[^./\\]+$/.test(String(f.name));

// files: File-like { name } -> { images: [{ file, world, xml, prj, data }], orphans: [side files with no image], unreadable: [files], ignored: [files] }
export function rasterFileSet(files) {
  const all = Array.from(files || []);
  const worlds = all.filter(isWorld), xmls = all.filter(isXml), prjs = all.filter(isPrj), images = all.filter(isImage);
  const used = new Set();
  const pick = (list, f) => { const s = stem(f), full = String(f.name).toLowerCase(); const g = list.find((w) => stem(w) === s || stemOfFull(w.name) === s || String(w.name).toLowerCase().startsWith(`${full}.`)); if (g) used.add(g); return g || null; };
  // an ER Mapper header's data file: no extension, the header's name without .ers
  const lower = (x) => String(x.name).toLowerCase();
  const dataFor = (f) => { if (!/\.ers$/i.test(f.name)) return null; const want = String(f.name).replace(/\.ers$/i, "").toLowerCase(); const g = all.find((b) => lower(b) === want) || all.find((b) => lower(b) === `${want}.dat`); if (g) { used.add(g); ersData.set(f, g); } return g || null; }; // stem, else stem.dat (a GSQ set of UBC sections)
  const out = images.map((file) => { const xml = sideXmlFor(file, xmls); if (xml) used.add(xml); return { file, world: pick(worlds, file), xml, prj: pick(prjs, file), data: dataFor(file) }; });
  const orphans = [...worlds, ...xmls, ...prjs].filter((f) => !used.has(f));
  return { images: out, orphans, unreadable: all.filter(isUnreadable), ignored: all.filter((f) => !isImage(f) && !isWorld(f) && !isXml(f) && !isPrj(f) && !isUnreadable(f) && !used.has(f)) };
}
