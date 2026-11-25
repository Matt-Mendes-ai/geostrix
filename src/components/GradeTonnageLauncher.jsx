// TASKS.csv #1577 (review #1497, Lawyers) — grade-tonnage was only behind a scale icon in Geophysics > Block models; 3D Modelling's
// Grade estimation pane, where the estimates are made, now opens it too. Lists the grade estimates (GeoStrix's own and geoML), not a
// support index or a kriging variance, which are not grades.
import React, { useMemo, useState } from "react";
import { Scale } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { lazyModal } from "../lib/lazyModal.jsx";
import { smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";
import { stampEpsg } from "../lib/provenance.js"; // TASKS.csv #2195
import { tonnageModels, openingModel, isGradeEstimate } from "../lib/tonnageModels.js"; // TASKS.csv #3594 — in lib, testable

const GradeTonnageModal = lazyModal(() => import("./GradeTonnageModal.jsx"));

export { isGradeEstimate };

export default function GradeTonnageLauncher() {
  const { voxelModels = [], project } = useStore();
  const models = useMemo(() => tonnageModels(voxelModels), [voxelModels]); // #3594: no density model
  const [id, setId] = useState("");
  const [open, setOpen] = useState(false);
  if (!models.length) return null;
  const key = (m) => String(m.id ?? m.name);
  const model = models.find((m) => key(m) === id) || openingModel(models); // #3594: the latest set's primary element
  return (
    <div style={{ marginBottom: 16 }}>
      {models.length > 1 && (
        <select value={key(model)} onChange={(e) => setId(e.target.value)} style={{ ...smallSel, width: "100%", marginBottom: 4 }} aria-label={tr("Block model for the grade-tonnage table")}>
          {models.map((m) => <option key={key(m)} value={key(m)}>{m.name}</option>)}
        </select>
      )}
      <button className="gs-btn gs-btn--block" type="button" onClick={() => setOpen(true)} title={tr("Tonnage and mean grade above a series of cutoffs (an exploration target, not a Mineral Resource)")}>
        <Scale size={14} />{" "}{models.length > 1 ? tr("Grade-tonnage table…") : tr("Grade-tonnage table: {name}…", { name: model.name })}
      </button>
      {open && <GradeTonnageModal model={model} epsg={stampEpsg(project)} onClose={() => setOpen(false)} />}
    </div>
  );
}
