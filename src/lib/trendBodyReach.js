// TASKS.csv #2780 (split from #2538; DECISION 2026-11-12, Matt: 'follow your recommendations') — a closed body under a structural trend. The
// automatic search came from the logged runs (about twice the median run) and was used as the trend ellipsoid's MAJOR axis, so the ratios
// shrank it across the layer: a 5 : 5 : 1 trend made a 4 m search 0.8 m across, and along the layer it never reached the next hole. Now the
// runs' reach is the reach ACROSS the plane (what the logged runs measure), multiplied by the trend's ratio along the plane, and at least the
// hole spacing along it, so a node between two holes reaches one. Pure.

// autoRadiusM: the automatic search from the runs (autoBodyParams' radius); scales: trendSearchScales ({ major 1, semiMajor, minor });
// spacingM: the hole spacing. -> { alongM (the major semi-axis now), acrossM, bySpacing, runsAcrossM, oldAlongM, oldAcrossM } (the old: the runs' reach as the major axis)
export function trendBodyReach(autoRadiusM, scales, spacingM) {
  const r = Number(autoRadiusM), major = Number(scales?.major) || 1, minor = Number(scales?.minor) || 1;
  if (!(r > 0)) return null;
  const k = minor / major; // max / min: how much longer the ellipsoid is along the plane than across it
  const alongM = Math.max(r * k, Number(spacingM) > 0 ? Number(spacingM) : 0);
  return { alongM, acrossM: alongM / k, bySpacing: alongM > r * k, runsAcrossM: r, oldAlongM: r, oldAcrossM: r / k }; // bySpacing: the hole spacing, not the runs, set the long axis
}
