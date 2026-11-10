// TASKS.csv #2378 — "Model the units from": the Lithology value (default) or one of its category extra fields, for every modelling tool
// (they read unitLayers / modelLayers). Session-only, like Model area and the stack's units. A field no longer on the rows falls back to
// the Lithology value.
import { useMemo, useState } from "react";
import { unitSourceFields, applyUnitSource } from "../../lib/unitSource.js";

export function useUnitSource(layers) {
  const [picked, setUnitField] = useState("");
  const unitFields = useMemo(() => unitSourceFields(layers?.litho), [layers?.litho]);
  const unitField = picked && unitFields.some((f) => f.name === picked) ? picked : "";
  const unitLayers = useMemo(() => applyUnitSource(layers, unitField), [layers, unitField]);
  return { unitField, setUnitField, unitFields, unitLayers };
}
