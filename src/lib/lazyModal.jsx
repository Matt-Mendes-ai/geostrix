import React, { Suspense } from "react";

// TASKS.csv #301 — defer a modal's code until it is actually opened.
//
// The problem this solves: ViewerModule.jsx statically imported ~16 modals that only ever render
// behind a boolean ("stereonetOpen && <StereonetModal .../>"). A static import means the modal AND
// everything it imports lands in the startup bundle regardless, so opening the app paid for the
// stereonet maths, the variogram engine, the mesh-query BVH and the fence-projection code even if the
// user only ever looked at a drillhole trace. #224 had already established the fix for exactly this
// (SQLWorkspaceModal was lazied because it dragged in sql.js's wasm) — this generalises that.
//
// Why a helper rather than React.lazy at each site: React.lazy alone throws unless the element is
// rendered inside a <Suspense> boundary, so the plain approach needs BOTH an import change and a
// wrapper at every render site — sixteen edits scattered through a 380KB file, each one a chance to
// wrap the wrong element or miss one and only find out when a user clicks. Bundling the Suspense in
// here makes each conversion a single-line import swap with the render sites untouched, which is both
// safer to apply and impossible to half-do.
//
// fallback={null} matches #224's existing choice: these chunks come off local disk in a few
// milliseconds, and flashing a spinner into a modal that is about to paint anyway reads as a glitch.
export function lazyModal(loader) {
  const Inner = React.lazy(loader);
  // Called once per module at import time, so this component identity is stable across renders —
  // defining it per-render would remount the modal (and lose its state) on every parent update.
  return function LazyModal(props) {
    return (
      <Suspense fallback={null}>
        <Inner {...props} />
      </Suspense>
    );
  };
}
