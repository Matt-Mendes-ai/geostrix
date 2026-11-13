// TASKS.csv #3144 (the rest of #3117 / #3055, WA iron) — a level of detail for the assay markers drawn along the hole: when a typical sample
// is a few pixels on screen, a hole's consecutive samples of the same colour (class) are drawn as one marker. Fe on WA iron's 147,891 samples
// orbited at 20 fps against 30 with no assays, four elements at 12. The coarse set is built once, the first time it is needed, beside the
// full one (lib/viewer/assayKeep.js); the render loop switches between them as the camera moves (assayLodTick), with a margin so the
// switch does not flicker at the threshold. Only the view changes: every sample stays in the full set, and a merged marker's tip names
// its range and the number of samples.

export const LOD_ON_PX = 3, LOD_OFF_PX = 4.5; // a typical sample under 3 px: coarse; back to full above 4.5 px
export const RUN_GAP_M = 0.05; // consecutive: the next sample starts within 5 cm of the last one's end

// rows: one hole's assay rows; colourOf(v) -> the marker colour, or null when the value is not drawn (cut off); isPx(row): a pXRF
// reading (a cube of its own, never merged). -> runs [{ from, to, color, rows, px, lo, hi }] in depth order
export function sampleRuns(rows, sym, colourOf, isPx = () => false, gap = RUN_GAP_M) {
  const sorted = [...rows].filter((r) => Number.isFinite(r.from) && Number.isFinite(r.to)).sort((a, b) => a.from - b.from);
  const out = [];
  let run = null;
  for (const r of sorted) {
    const v = r.values?.[sym];
    const color = v == null ? null : colourOf(v);
    if (color == null) { run = null; continue; }
    if (isPx(r)) { out.push({ from: r.from, to: r.to, color, rows: [r], px: true, lo: v, hi: v }); run = null; continue; }
    if (run && run.color === color && r.from - run.to <= gap) {
      run.to = Math.max(run.to, r.to); run.rows.push(r); if (v < run.lo) run.lo = v; if (v > run.hi) run.hi = v;
      continue;
    }
    run = { from: r.from, to: r.to, color, rows: [r], px: false, lo: v, hi: v };
    out.push(run);
  }
  return out;
}

// a run's marker size: the samples' sizes, weighted by their lengths
export function runSize(run, sizeOf) {
  let w = 0, s = 0;
  for (const r of run.rows) { const L = Math.max(1e-3, r.to - r.from); w += L; s += L * sizeOf(r); }
  return w > 0 ? s / w : sizeOf(run.rows[0]);
}

// a typical sample's length (m): the median over at most 4,001 rows, spread through the table
export function typicalSampleM(rows) {
  const step = Math.max(1, Math.floor((rows?.length || 0) / 4000)), L = [];
  for (let i = 0; i < (rows?.length || 0); i += step) { const r = rows[i], d = r.to - r.from; if (d > 0 && Number.isFinite(d)) L.push(d); }
  if (!L.length) return null;
  L.sort((a, b) => a - b);
  return L[Math.floor(L.length / 2)];
}

// which set to draw: coarse under LOD_ON_PX a sample, full again above LOD_OFF_PX (was: the current state)
export const lodWanted = (sampleM, metresPerPx, was) => {
  if (!(sampleM > 0) || !(metresPerPx > 0)) return false;
  const px = sampleM / metresPerPx;
  return was ? px < LOD_OFF_PX : px < LOD_ON_PX;
};
