// TASKS.csv #3251 — the memory an online fetch may take on this computer (imagery at Full resolution, terrain at Full detail): at most
// FETCH_RAM_SHARE of its memory (desktop problemReportInfo: os.totalmem; FETCH_ASSUMED_RAM_GB where it cannot be read, as #3215 does for
// GemPy), so a fetch on a modest computer is refused with its figures before it starts, not after the window freezes.
import { useEffect, useState } from "react";
import { problemReportInfo } from "./desktop.js";

export const FETCH_RAM_SHARE = 0.25;
export const FETCH_ASSUMED_RAM_GB = 16;

// MB a fetch may take with ramGB of memory (null: not read)
export const fetchBudgetMB = (ramGB) => Math.round(FETCH_RAM_SHARE * (ramGB > 0 ? ramGB : FETCH_ASSUMED_RAM_GB) * 1000);
export const fetchFits = (memoryMB, ramGB) => !(memoryMB > fetchBudgetMB(ramGB));

// this computer's memory in GB, read once per mount (null until read, and in the browser build)
export function useMachineMemoryGB() {
  const [gb, setGb] = useState(null);
  useEffect(() => {
    let live = true;
    problemReportInfo().then((i) => { if (live && i?.memoryGB?.total > 0) setGb(i.memoryGB.total); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return gb;
}

// a square of sideM metres at the middle of a lon / lat box, no larger than the box: 'Full resolution for a smaller area'
export function centreBox([lonMin, latMin, lonMax, latMax], sideM) {
  const lat = (latMin + latMax) / 2, lon = (lonMin + lonMax) / 2;
  const dLon = Math.min((lonMax - lonMin) / 2, sideM / 2 / (111320 * Math.cos((lat * Math.PI) / 180)));
  const dLat = Math.min((latMax - latMin) / 2, sideM / 2 / 110574);
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}
