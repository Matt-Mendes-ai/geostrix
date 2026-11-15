// TASKS.csv #3624 (Fireweed rehearsal) — Save, close and reopen brought back the data, colours and hole checks but not the camera: the file had none, and the
// view opened on the whole 27 x 18 km with the 143 checked holes a speck. The camera is kept in viewerUiState.camera (a few numbers), written a moment after
// the camera stops moving (orbiting does not mark the project unsaved: lib/viewerDirty.js leaves it out), and read back when the project opens.
import { useEffect, useRef } from "react";

const r = (v) => Math.round(v * 1000) / 1000;
// the camera's own numbers, or null while it is not ready
export const cameraSnapshot = (cs) => (cs && cs.target && [cs.theta, cs.phi, cs.radius, cs.target.x, cs.target.y, cs.target.z].every(Number.isFinite)
  ? { theta: r(cs.theta), phi: r(cs.phi), radius: r(cs.radius), target: { x: r(cs.target.x), y: r(cs.target.y), z: r(cs.target.z) } } : null);
export const cameraKey = (c) => (c ? `${c.theta}|${c.phi}|${c.radius}|${c.target.x}|${c.target.y}|${c.target.z}` : "");

// a saved camera put back on the live one (camState: the ref); true when it was valid. The scene's first auto-fit is then not wanted (hasAutoFitRef).
export function applySavedCamera(saved, camState, cameraRef, hasAutoFitRef) {
  const c = cameraSnapshot(saved && { ...saved, target: saved.target });
  if (!c || !(c.radius > 0) || !camState.current?.target) return false;
  const cs = camState.current;
  cs.theta = c.theta; cs.phi = c.phi; cs.radius = c.radius; cs.target.set(c.target.x, c.target.y, c.target.z);
  hasAutoFitRef.current = true;
  cameraRef.current?.__update?.();
  return true;
}

// every second: if the camera moved and has been still for a second, hand it to setSaved (the view's one writer then puts it in viewerUiState.camera)
export function useSavedCamera(camState, projectReady, setSaved) {
  const last = useRef(""), prev = useRef("");
  useEffect(() => {
    if (!projectReady) return undefined;
    last.current = cameraKey(cameraSnapshot(camState.current)); prev.current = last.current; // the opening view is the baseline: written only once it moves
    const id = setInterval(() => {
      const snap = cameraSnapshot(camState.current), key = cameraKey(snap);
      const still = key === prev.current;
      prev.current = key;
      if (!snap || !still || key === last.current) return;
      last.current = key;
      setSaved(snap);
    }, 1000);
    return () => clearInterval(id);
  }, [projectReady, camState, setSaved]);
}
