// TASKS.csv #1974 — the 3D slice's status line, in the interface language (it was English only; moved out of ViewerModule,
// which is at its size cap). slice3d: { on, mode, pos, thickness, azimuth }; ext: the slice range ({ y0, y1 } in local z); oz:
// the local origin's z.
import { t as tr } from "./i18n.js";

export function sliceReadoutText(slice3d, ext, oz = 0) {
  if (!slice3d?.on) return "";
  if (!ext) return tr("Load drillholes to set the slice range.");
  if (slice3d.mode === "horizontal") {
    const elev = ext.y0 + slice3d.pos * (ext.y1 - ext.y0) + oz, h = slice3d.thickness / 2;
    return slice3d.thickness > 0 ? tr("Showing {a}–{b} m elevation", { a: Math.round(elev - h), b: Math.round(elev + h) }) : tr("Showing everything below {v} m elevation", { v: Math.round(elev) });
  }
  return slice3d.thickness > 0 ? tr("Vertical slab {t} m thick, striking {az}°", { t: slice3d.thickness, az: slice3d.azimuth }) : tr("Everything on one side of a vertical cut striking {az}°", { az: slice3d.azimuth });
}
