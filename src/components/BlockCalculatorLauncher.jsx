// TASKS.csv #3164 (part 2) — the block calculator's button in 3D Modelling's Grade estimation pane, beside the grade-tonnage table. Shown
// when the project has a block model; the dialog is lazy-loaded.
import React, { useState } from "react";
import { Calculator } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { lazyModal } from "../lib/lazyModal.jsx";
import { pBtn } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";
const BlockCalculatorModal = lazyModal(() => import("./BlockCalculatorModal.jsx"));

export default function BlockCalculatorLauncher() {
  const { voxelModels = [] } = useStore();
  const [open, setOpen] = useState(false);
  if (!voxelModels.some((m) => m.cells?.length)) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <button type="button" onClick={() => setOpen(true)} style={pBtn} title={tr("A new block model from a formula over block models on the same blocks (calcined grade, a metal equivalent, a value per tonne)")}>
        <Calculator size={14} />{" "}{tr("Block calculator…")}
      </button>
      {open && <BlockCalculatorModal onClose={() => setOpen(false)} />}
    </div>
  );
}
