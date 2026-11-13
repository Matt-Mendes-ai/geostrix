// TASKS.csv #1034 (review #1016) — the drillhole database as tables the CSV importer reads back unaided (lib/drillholeTables.js):
// one layer as a CSV, or collars + survey + every log (+ custom layers and assays, #1701) as a .zip of CSVs. Moved out of ViewerModule
// at its size cap (#1084): ctx = { collars, survey, layers, customLayers, assays, assayElements, project, setNotices }.
import { saveFile } from "../../lib/desktop.js";
import { notice, errorNotice } from "../../lib/notices.js";
import { t as tr } from "../../lib/i18n.js";
import { version as APP_VERSION } from "../../../package.json";

export async function exportDrillholeTablesWith(ctx, kind, key, label) {
  const { collars, survey, layers, customLayers, assays, assayElements, project, setNotices } = ctx;
  try {
    const T = await import("../../lib/drillholeTables.js"); // on demand
    const tx = await import("../../lib/tiedExport.js"), ex = await tx.exportCrs(project); if (!ex) return; const epsg = ex.epsg; // #1021 — the stamp's CRS
    const W = (rows) => tx.rowsToWorld(rows, ex.tie); // #2322 — a tied local grid: collar x / y and the azimuths through its tie (unchanged otherwise)
    if (kind === "all") {
      const files = T.drillholeTableFiles({ collars: W(collars), survey: W(survey), layers, customLayers, assays, assayElements, epsg, version: APP_VERSION }); // custom layers, assays: #1701
      if (!files.length) { setNotices((p) => [...p, notice("Nothing to export: no collars, survey or hole logs are loaded.")]); return; }
      const { buildZip } = await import("../../lib/shapefile.js");
      const enc = new TextEncoder();
      const zip = buildZip(files.map((f) => ({ name: f.name, data: enc.encode(`﻿${f.text}`) }))); // BOM: Excel reads accents (#1097)
      const res = await saveFile({ quiet: true, suggestedName: `${(project?.name || "drillholes").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}_tables.zip`, filters: [{ name: "ZIP of CSV tables", extensions: ["zip"] }], content: zip /* #1040 bytes */ });
      if (!res?.ok) { if (res?.error) throw new Error(res.error); return; }
      setNotices((p) => [...p, notice("Exported {n} drillhole tables ({files}) as CSV in a .zip. Dips are negative = down and azimuths grid, so they import back with the defaults.", { n: files.length, files: files.map((f) => f.name).join(", ") })]);
      return;
    }
    const files = T.drillholeTableFiles({ collars: kind === "collars" ? W(collars) : [], survey: kind === "survey" ? W(survey) : [], layers: kind === "layer" ? { [key]: layers[key] || [] } : {}, epsg, version: APP_VERSION });
    if (!files.length) { setNotices((p) => [...p, notice("Nothing to export for \"{label}\" — it has no rows.", { label })]); return; }
    const res = await saveFile({ quiet: "success", suggestedName: files[0].name, filters: [{ name: "CSV", extensions: ["csv"] }], content: files[0].text });
    if (res?.ok) setNotices((p) => [...p, notice("Exported \"{label}\" as a CSV table that imports back with the defaults (dips negative = down, azimuths grid).", { label })]);
  } catch (err) {
    setNotices((p) => [...p, errorNotice(tr("Table export failed: {message}", { message: err.message }))]);
  }
}
