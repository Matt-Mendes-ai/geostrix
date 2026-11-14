// TASKS.csv #1993 — a .geoh5 file's objects as GeoStrix project objects: lib/geoh5.js reads it into OMF's element shapes and lib/omfImport.js's
// conversion makes the point / line / surface objects and the block models (cell budget, crop, colours), so both formats behave alike.
// Loaded on demand (the Geophysics tab's import), with h5wasm behind it.
import { parseGeoh5 } from "./geoh5.js";
import { elementsToProjectObjects } from "./omfImport.js";
import { t as tr } from "./i18n.js";

export async function geoh5ToProjectObjects(arrayBuffer, maxCells, opts = {}) {
  const ws = await parseGeoh5(arrayBuffer);
  const res = elementsToProjectObjects(ws.elements, maxCells, opts, "geoh5");
  const grids = ws.elements.filter((e) => e.grid2d && e.attributes?.length).map((e) => e.name);
  if (grids.length) res.notes.push(tr("2D grids ({names}) are shown as block models one cell thick, coloured by their values.", { names: grids.join(", ") }));
  if (ws.distanceUnit && !/^m(et(er|re)s?)?$/i.test(ws.distanceUnit.trim())) res.notes.push(tr("The file's distance unit is {u}: its coordinates are used as they are, not converted to metres.", { u: ws.distanceUnit }));
  res.notes.push(tr("A geoh5 file carries no coordinate system: its coordinates are used as they are, in the project's."));
  return { ...res, version: ws.version };
}
