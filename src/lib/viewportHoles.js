// TASKS.csv #3371 (review #3195) — the holes a Layout viewport draws. 'Fit the holes at a round scale' framed every collar (70 holes over
// 29 x 15 km, 1:200,000) while the view drew only the 16 checked ones, and a scale picked afterwards stayed centred on all 70: blank
// ground. The fit now takes the holes the frame's view shows: its theme's hole visibility, else the view state captured with it (a
// 'Current view' frame), else the live 3D View's when the frame follows it. visibleHoles: { hole_id: false } = hidden, absent = shown.

export function viewportHoleVisibility(vp, themes = [], liveUi = null) {
  if (!vp) return null;
  const theme = vp.themeId ? (themes || []).find((t) => t.id === vp.themeId) : null;
  if (theme) return theme.visibleHoles || null;
  if (vp.themeId) return null; // a stale theme: nothing known, all holes
  if (vp.viewState) return vp.viewState.visibleHoles || null;
  return liveUi?.visibleHoles || null;
}

// -> { ids: Set of the shown located holes, or null for all of them, shown, all } (located = a collar with x and y). With every hole
// hidden the fit falls back to all of them, as before: a view showing none has nothing better to frame.
export function fitHoleSet(collars, visibleHoles) {
  const located = (collars || []).filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y));
  const all = located.length;
  if (!visibleHoles) return { ids: null, shown: all, all };
  const shown = located.filter((c) => visibleHoles[c.hole_id] !== false);
  if (!shown.length || shown.length === all) return { ids: null, shown: all, all };
  return { ids: new Set(shown.map((c) => c.hole_id)), shown: shown.length, all };
}
