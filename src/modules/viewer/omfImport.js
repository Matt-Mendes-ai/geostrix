// TASKS.csv #3895 (Matt, 2026-11-17: "we should be able to import .omf"; a consultant's .omf volume solid dropped on the 3D view was refused) —
// an Open Mining Format file dropped on StrixViewer, or picked with Add data, goes to the SAME reader as Geophysics > OMF (lib/omfImport.js, in a
// worker: points, lines and surfaces become omfObjects, listed in StrixViewer's sidebar; volumes become block models). No second parser.
// - An OMF gives coordinates but seldom their CRS: a project whose CRS was never chosen is asked once (the project CRS dialog); the answer is
//   the project's, so the next import is not asked again. "Decide later" imports as the file is.
// - Speed first: a file over OMF_MAX_MB is refused with a plain message before it is read; the volumes are reduced to the cell budget (the one
//   Geophysics sets, remembered on this computer); a result over BIG_BLOCKS blocks is asked about, as Geophysics does.
import { omfToProjectObjectsAsync } from "../../lib/omfImport.js";
import { MAX_CELLS } from "../../lib/voxel.js";
import { clampCellBudget } from "../../lib/estimationMeta.js";
import { requestProjectCrs } from "../../lib/projectCrsRequest.js";
import { notice, errorNotice, infoNotice } from "../../lib/notices.js";
import { t as tr, fmtNum } from "../../lib/i18n.js";

export const OMF_MAX_MB = 1024, BIG_BLOCKS = 500000;
export const isOmfName = (name) => /\.omf$/i.test(String(name || ""));

// env: { project, cellBudget, addOmfObject, addVoxelModel, setNotices, confirm, read } (read: the reader, replaceable in tests)
export async function importOmfFile(file, env) {
  const { project, cellBudget = null, addOmfObject, addVoxelModel, setNotices, confirm = (m) => window.confirm(m), read = omfToProjectObjectsAsync } = env;
  const say = (n) => setNotices((p) => [...p, n]);
  const mb = file.size / 1048576;
  if (mb > OMF_MAX_MB) { say(errorNotice(tr("{name} is {mb} MB, more than the {cap} MB an OMF can be read here in one go. Export a smaller area or fewer elements from the program that wrote it.", { name: file.name, mb: fmtNum(Math.round(mb)), cap: fmtNum(OMF_MAX_MB) }))); return { added: 0 }; }
  // the coordinate system, once per project
  if (!project?.crsSet && !project?.localGrid) {
    await requestProjectCrs(tr("{name}: an OMF gives coordinates but not the coordinate system they are in. Choose it: it becomes the project's, and the next import uses it.", { name: file.name }));
  }
  say(infoNotice(tr("Reading {name} ({mb} MB)…", { name: file.name, mb: fmtNum(Math.max(0.1, Math.round(mb * 10) / 10)) })));
  let res;
  try {
    res = await read(await file.arrayBuffer(), clampCellBudget(cellBudget) || MAX_CELLS, {});
  } catch (err) { say(errorNotice(tr("{name}: couldn't read the OMF ({message}).", { name: file.name, message: err?.message || String(err) }))); return { added: 0 }; }
  const blocks = res.voxelModels.reduce((n, m) => n + (m.cells?.length || 0), 0);
  if (blocks > BIG_BLOCKS && !confirm(tr("\"{name}\" holds {n} blocks, about {gb} GB of memory while open, which can slow a laptop. Import it? (A lower cell budget coarsens it.)", { name: file.name, n: blocks.toLocaleString(), gb: (blocks * 0.4e-6).toFixed(1) }))) {
    say(notice(tr("\"{name}\" was not imported.", { name: file.name }))); return { added: 0 };
  }
  res.omfObjects.forEach((o) => addOmfObject(o));
  res.voxelModels.forEach((m) => addVoxelModel(m));
  const count = (k) => res.omfObjects.filter((o) => o.kind === k).length;
  const pointsCount = count("points"), linesCount = count("lines"), surfacesCount = count("surface"), volumesCount = res.voxelModels.length;
  const parts = [];
  if (pointsCount) parts.push(tr("{pointsCount} point set(s)", { pointsCount }));
  if (linesCount) parts.push(tr("{linesCount} line set(s)", { linesCount }));
  if (surfacesCount) parts.push(tr("{surfacesCount} surface(s)", { surfacesCount }));
  if (volumesCount) parts.push(tr("{volumesCount} block model(s)", { volumesCount }));
  let msg = parts.length ? tr("Imported \"{name}\" — {parts}.", { name: file.name, parts: parts.join(", ") }) : tr("\"{name}\" parsed but nothing usable was found.", { name: file.name });
  if (res.notes?.length) msg += ` ${res.notes.join(" ")}`;
  if (res.choices?.length) msg += ` ${tr("A volume also holds other values: Geophysics > OMF adds another as a block model.")}`;
  if (res.skipped?.length) msg += tr(" Skipped: {skipped}.", { skipped: res.skipped.join("; ") });
  say(parts.length ? infoNotice(msg) : errorNotice(msg));
  return { added: res.omfObjects.length + volumesCount };
}
