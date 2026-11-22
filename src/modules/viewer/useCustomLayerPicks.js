// TASKS.csv #4007 — the Custom layers list in bulk (lib/viewer/customLayerBulk.js says what each part is): the rows picked with Ctrl / Shift + click, and the
// delete of several layers at once. One setCustomLayers makes one change to the project, so Undo brings them all back in one step.
import { useState, useRef, useMemo } from "react";
import { t as tr } from "../../lib/i18n.js";
import { confirmDestructive } from "../../lib/confirmDestructive.js";
import { pickClick, pickedIn, importSiblings, displayNames, layerImportKey } from "../../lib/viewer/customLayerBulk.js";

export function useCustomLayerPicks({ customLayers, setCustomLayers, layerGroupsRef }) {
  const [picked, setPicked] = useState(() => new Set());
  const anchor = useRef(null);
  const order = useMemo(() => customLayers.map((l) => l.id), [customLayers]);
  const names = useMemo(() => displayNames(customLayers), [customLayers]);
  const importSize = useMemo(() => { // layers per import, by layer id
    const keys = customLayers.map(layerImportKey), by = new Map();
    for (const k of keys) if (k) by.set(k, (by.get(k) || 0) + 1);
    return new Map(customLayers.map((l, i) => [l.id, keys[i] ? by.get(keys[i]) : 0]));
  }, [customLayers]);
  const pickedIds = useMemo(() => pickedIn(picked, order), [picked, order]);

  // a click on a row: true when it was a pick (Ctrl / Meta / Shift), so the row does not also show or hide its layer
  const clickRow = (e, id) => {
    const r = pickClick({ picked, anchor: anchor.current, order }, id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
    if (!r) return false;
    anchor.current = r.anchor; setPicked(r.picked);
    return true;
  };
  const clearPicks = () => { anchor.current = null; setPicked(new Set()); };

  // the layers with these ids removed from the scene and the project in one change, once the person agrees
  const removeMany = async (ids, question) => {
    if (!ids.length || !(await confirmDestructive(question, { undoable: true }))) return false;
    const gone = new Set(ids);
    for (const id of ids) { const g = layerGroupsRef.current[id]; if (g) { g.parent?.remove(g); delete layerGroupsRef.current[id]; } }
    setCustomLayers((p) => p.filter((l) => !gone.has(l.id)));
    clearPicks();
    return true;
  };
  const deleteAll = () => removeMany(order, tr("Delete the {n} custom layers?", { n: order.length }));
  const deletePicked = () => removeMany(pickedIds, pickedIds.length === 1
    ? tr("Remove the custom layer \"{name}\"?", { name: customLayers.find((l) => l.id === pickedIds[0])?.name ?? "" }) // the wording the row's own trash uses
    : tr("Delete the {n} picked layers?", { n: pickedIds.length }));
  const deleteImport = (layer) => {
    const sibs = importSiblings(customLayers, layer);
    return removeMany(sibs.map((l) => l.id), tr("Delete the {n} layers of \"{source}\"?", { n: sibs.length, source: layerImportKey(layer) || layer.name }));
  };
  return { picked, pickedIds, names, clickRow, clearPicks, deleteAll, deletePicked, deleteImport, hasSiblings: (layer) => (importSize.get(layer.id) || 0) > 1 };
}
