// TASKS.csv #4054 — the geoML panel's block sizes (rock units, grade), remembered on this computer like the app's other personal UI settings
// (useBrowserPanelHeight.js, useSidebarWidth.js): a typed block size is a preference for how this person models, not project data. The panel's other
// settings (the Quality, the unit ticked) live only while it is open; a block size is kept because it is a number the person chose on purpose and must
// find again, with the warning beside it when it suits the next project badly.
import { useCallback, useState } from "react";
import { cleanBlockM } from "./geomlBlockSize.js";

const KEY = "geostrix-geoml-block-size";

function readStored() {
  try {
    const o = JSON.parse(window.localStorage.getItem(KEY) || "{}");
    return { unit: cleanBlockM(o?.unit), grade: cleanBlockM(o?.grade) };
  } catch (_) { return { unit: null, grade: null }; } // no storage, or damaged: nothing typed
}

// -> { unit, grade, setUnit(v), setGrade(v) }: each a block size in metres or null (not set: the Quality's size); v is cleaned, null / "" clears it
export function useGeomlBlockSize() {
  const [v, setV] = useState(readStored);
  const put = useCallback((part, next) => {
    setV((cur) => {
      const out = { ...cur, [part]: cleanBlockM(next) };
      try { window.localStorage.setItem(KEY, JSON.stringify(out)); } catch (_) { /* ignore */ }
      return out;
    });
  }, []);
  const setUnit = useCallback((n) => put("unit", n), [put]);
  const setGrade = useCallback((n) => put("grade", n), [put]);
  return { unit: v.unit, grade: v.grade, setUnit, setGrade };
}
