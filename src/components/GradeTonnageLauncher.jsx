// TASKS.csv #1577 (review #1497, Lawyers) — grade-tonnage was only behind a scale icon in Geophysics > Block models; 3D Modelling's
// Grade estimation pane, where the estimates are made, now opens it too. Lists the grade estimates (GeoStrix's own and geoML), not a
// support index or a kriging variance, which are not grades.
import React, { useMemo, useState } from "react";
import { Scale } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { lazyModal } from "../lib/lazyModal.jsx";
import { isGradeTonnageModel } from "../lib/gradeTonnage.js";
import { pBtn, smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";
const GradeTonnageModal = lazyModal(() => import("./GradeTonnageModal.jsx"));

export const isGradeEstimate = (m) => isGradeTonnageModel(m) && m?.cells?.length > 0 && (/^estimate-|^geoml$/.test(String(m.source || "")) || !!m.params?.element);

export default function GradeTonnageLauncher() {
  const { voxelModels = [], project } = useStore();
  const models = useMemo(() => voxelModels.filter(isGradeEstimate), [voxelModels]);
  const [id, setId] = useState("");
  const [open, setOpen] = useState(false);
  if (!models.length) return null;
  const key = (m) => String(m.id ?? m.name);
  const model = models.find((m) => key(m) === id) || models[models.length - 1];
  return (
    <div style={{ marginBottom: 16 }}>
      {models.length > 1 && (
        <select value={key(model)} onChange={(e) => setId(e.target.value)} style={{ ...smallSel, width: "100%", marginBottom: 4 }} aria-label={tr("Block model for the grade-tonnage table")}>
          {models.map((m) => <option key={key(m)} value={key(m)}>{m.name}</option>)}
        </select>
      )}
      <button type="button" onClick={() => setOpen(true)} style={pBtn} title={tr("Tonnage and mean grade above a series of cutoffs (an exploration target, not a Mineral Resource)")}>
        <Scale size={14} />{" "}{models.length > 1 ? tr("Grade-tonnage table…") : tr("Grade-tonnage table: {name}…", { name: model.name })}
      </button>
      {open && <GradeTonnageModal model={model} epsg={project?.epsg ?? null} onClose={() => setOpen(false)} />}
    </div>
  );
}
