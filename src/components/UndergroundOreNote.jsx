// TASKS.csv #2277 (review #2174, WA lode gold, Mine Design) — on a deposit drilled from underground the pit tools gave no verdict: the
// 500 m depth test was measured from a false ground (a surface through the cuddy collars) and never fired, and Pit design went on to a
// 52-bench, 5.3 km-ramp open pit. This says how deep the ore-grade blocks lie below the highest collar, the nearest the surface the data
// knows, and calls it an underground question when they are deep. Shown in Pit shell, Nested pits and Pit design (they share the shell).
import React, { useMemo } from "react";
import { useStore } from "../lib/store.jsx";
import { oreDepthBelowCollars, undergroundOreVerdict } from "../lib/pitShell.js";
import { t as tr } from "../lib/i18n.js";

const warn = { fontSize: "var(--font-size-xs)", color: "var(--color-warn-text-strong)", lineHeight: 1.4, marginTop: 4 };

export default function UndergroundOreNote({ model, cutoff }) {
  const { collars = [], survey = [] } = useStore();
  const d = useMemo(() => (model ? oreDepthBelowCollars(model.cells, Number(cutoff), collars, survey) : null), [model, cutoff, collars, survey]);
  if (!undergroundOreVerdict(d)) return null;
  const r = (v) => Math.round(v).toLocaleString();
  return (
    <div role="note" style={warn}>
      {d.underground
        ? tr("The ore-grade blocks lie {min}–{max} m below the highest collar ({top} m RL; {median} m at the median), and the collars look underground: this is an underground question (Stope outlines), not an open pit.", { min: r(d.min), max: r(d.max), top: r(d.top), median: r(d.median) })
        : tr("The ore-grade blocks lie {min}–{max} m below the highest collar ({top} m RL; {median} m at the median): deep for an open pit. Compare Stope outlines before reading this pit as a mine.", { min: r(d.min), max: r(d.max), top: r(d.top), median: r(d.median) })}
    </div>
  );
}
