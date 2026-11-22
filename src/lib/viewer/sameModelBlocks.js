// TASKS.csv #3989 (d) — 'Add as block model' added a copy every time: Matt's legend listed three identical 'Model units: solids from 13 surface(s)'
// groups, two from clicks seconds apart on the same result, one from an earlier run of the same model; 'Add unit volumes' did the same. The
// same result again (same title and time) is replaced; an earlier result of the same model (same title, another time) is replaced or kept, as
// the user answers. A block model is named 'Model units: {title} ({when})' (ViewerModule addLithBlockModel), so its name says both, which also
// covers block models saved before this change; a unit volume carries params.model (the title) and params.builtAt. Loaded on use.
import { askChoice } from "../confirmDialog.js";
import { t as tr } from "../i18n.js";

export const blockModelName = (lb) => `Model units: ${lb.title} (${lb.when})`;

// -> { same: [ids of this very result], earlier: [ids of earlier results of the same model] }
export function sameModelBlocks(voxelModels, lb) {
  const name = blockModelName(lb), prefix = `Model units: ${lb.title} (`;
  const same = [], earlier = [];
  for (const v of voxelModels || []) {
    if (typeof v?.name !== "string") continue;
    if (v.name === name) same.push(v.id);
    else if (v.name.startsWith(prefix) && v.name.endsWith(")") && !v.name.slice(prefix.length, -1).includes(" (")) earlier.push(v.id);
  }
  return { same, earlier };
}
export function sameModelVolumes(surfaces, lb) {
  const when = lb.builtAtIso || lb.when, same = [], earlier = [], runs = new Set();
  for (const s of surfaces || []) {
    if (s?.type !== "unit_volume" || s.params?.model !== lb.title) continue;
    if (s.params.builtAt === when) same.push(s.id); else { earlier.push(s.id); runs.add(s.params.builtAt); }
  }
  return { same, earlier, runs: runs.size }; // runs: how many earlier results (a result is several volumes)
}

const ASK = {
  blocks: [() => tr("An earlier result of this model is already a block model. Replace it, or keep both?"), (n) => tr("{n} earlier results of this model are already block models. Replace them, or keep them all?", { n })],
  volumes: [() => tr("Unit volumes of an earlier result of this model are already listed. Replace them, or keep both?"), (n) => tr("Unit volumes of {n} earlier results of this model are already listed. Replace them, or keep them all?", { n })],
};
// the ids to remove before adding, asking about earlier results -> { drop: [ids], cancelled }
export async function toReplace({ same, earlier, runs = earlier.length }, kind, ask = askChoice) {
  if (!earlier.length) return { drop: same, cancelled: false };
  const a = await ask(runs === 1 ? ASK[kind][0]() : ASK[kind][1](runs),
    [{ label: tr("Replace"), value: "replace", primary: true }, { label: runs === 1 ? tr("Keep both") : tr("Keep all"), value: "keep" }]);
  if (a == null) return { drop: [], cancelled: true };
  return { drop: a === "replace" ? [...same, ...earlier] : same, cancelled: false };
}
