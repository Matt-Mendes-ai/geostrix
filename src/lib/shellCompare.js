// TASKS.csv #3679 — a block model reported on the whole grid beside its element's grade shell: at Tom West the default estimate put 16.8 Mm³
// at or above 2 % Zn where the 2 % shell encloses 4.6 Mm³, and nothing in the Grade-tonnage table pointed to the shell. The table now says
// how the two compare at the shell's cut-off when the model was not restricted to a solid and none is chosen.
import { meshVolume } from "./unitVolumes.js";

// model: a block model ({ cells: [{ value, dx, dy, dz }], params: { element, restrictedToVolumeName? } }); solids: the closed generated
// surfaces ({ id, name, vertices, indices, params: { tool, element, cutoff } }). -> null or { id, name, cutoff, shellM3, modelM3 }
export function shellComparison(model, solids) {
  const el = model?.params?.element;
  if (!el || model.params.restrictedToVolumeName || model.params.restrictedToVolume) return null;
  let sh = null;
  for (const s of solids || []) if (s?.params?.tool === "numeric grade shell" && s.params.element === el && Number.isFinite(s.params.cutoff)) sh = s; // the newest
  if (!sh) return null;
  const shellM3 = Math.abs(meshVolume(sh.vertices, sh.indices));
  let modelM3 = 0;
  for (const c of model.cells || []) if (c.value >= sh.params.cutoff) modelM3 += (c.dx || 0) * (c.dy || 0) * (c.dz || 0);
  return shellM3 > 0 ? { id: sh.id, name: sh.name, cutoff: sh.params.cutoff, shellM3, modelM3 } : null;
}
