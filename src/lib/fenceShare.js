// TASKS.csv #4004 — the fence series' azimuth as the 3D View has it (session state, viewer/drillLines.js), so the Maps plan draws the same box: a
// box is turned to the azimuth (lib/fenceBox.js). The box itself is saved in viewerUiState.fenceArea; the Maps plan asks the 3D View to change it
// (module action "fence-area"), so one place keeps it.
import { useSyncExternalStore } from "react";

let azimuth = 0;
const subs = new Set();
export function shareFenceAzimuth(a) {
  const v = Number(a);
  if (!Number.isFinite(v) || v === azimuth) return;
  azimuth = v;
  subs.forEach((f) => f());
}
export const fenceAzimuth = () => azimuth;
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const useFenceAzimuth = () => useSyncExternalStore(subscribe, fenceAzimuth);
