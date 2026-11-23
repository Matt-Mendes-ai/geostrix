// TASKS.csv #4028 — a geoML result (lib/geomlResult.js) belongs to the project it landed in: stamped with the store's project counter when it appears, dropped when that moves
// (New, Open, a tab switch or close: the same counter the custom layers follow, #2361).
import { useEffect, useSyncExternalStore } from "react";
import { subscribeResult, getResult, stampResult, clearResult } from "../../lib/geomlResult.js";

export function useGeomlResultScope(viewerUiStateSeq) {
  const res = useSyncExternalStore(subscribeResult, getResult);
  useEffect(() => {
    if (!res) return;
    if (res.seq == null) stampResult(viewerUiStateSeq);
    else if (res.seq !== viewerUiStateSeq) clearResult();
  }, [res, viewerUiStateSeq]);
}
