// TASKS.csv #2378 — "Model the units from": the Lithology value (default) or one of its category extra fields, for every modelling tool
// (they read unitLayers / modelLayers). Session-only, like Model area and the stack's units. A field no longer on the rows falls back to
// the Lithology value.
import { useMemo, useState } from "react";
import { unitSourceFields, unitSourceLayers, applyUnitSource } from "../../lib/unitSource.js";

export function useUnitSource(layers, customLayers) {
  const [picked, setUnitField] = useState("");
  // #2529 — the Lithology fields, then the other coded interval layers (Weathering, custom layers of codes)
  const unitFields = useMemo(() => [...unitSourceFields(layers?.litho), ...unitSourceLayers(layers, customLayers)], [layers, customLayers]);
  const unitField = picked && unitFields.some((f) => f.name === picked) ? picked : "";
  const unitLayers = useMemo(() => applyUnitSource(layers, unitField, customLayers), [layers, unitField, customLayers]);
  return { unitField, setUnitField, unitFields, unitLayers };
}
