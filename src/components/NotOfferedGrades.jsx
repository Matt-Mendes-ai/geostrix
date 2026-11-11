// TASKS.csv #2436 (review #2325, WA uranium) — the block models a grade pane (Pit shell, Stope outlines) leaves out, and why, whether or not
// another model is offered: a gamma eU3O8 estimate with the unit "as logged" was dropped from both lists without a line.
import React, { useMemo } from "react";
import { notOfferedGrades } from "../lib/gradeCandidate.js";
import { categoricalModels } from "../lib/geologyForward.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, marginTop: 4 };
const few = (names) => names.slice(0, 4).join(", ") + (names.length > 4 ? ", …" : "");

export default function NotOfferedGrades({ voxelModels = [] }) {
  const { units, other } = useMemo(() => { const cat = new Set(categoricalModels(voxelModels)); return notOfferedGrades(voxelModels, (x) => cat.has(x)); }, [voxelModels]);
  if (!units.length && !other.length) return null;
  return (<>
    {units.length > 0 && <div style={note}>{tr("Not offered: {list}: its unit is not a grade unit. Set the unit of the layer it was estimated from (ppm, g/t, %) and estimate it again.", { list: few(units.map((u) => `"${u.name}" (${u.unit})`)) })}</div>}
    {other.length > 0 && <div style={note}>{tr("Not offered: {list}. Geophysical, categorical and estimation-quality models are not grades.", { list: few(other.map((n) => `"${n}"`)) })}</div>}
  </>);
}
