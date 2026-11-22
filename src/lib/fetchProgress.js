// TASKS.csv #3976 (Matt, first-time test: "we need a progress bar when fetching terrain and imagery") — a download (terrain, satellite imagery,
// Macrostrat, a spectral scene) shows in the status bar's task slot as the grade shell does: a bar with the share done, the stage ("Reading
// GEM-15 tiles 12 of 40", "Filling gaps", "Building the terrain"), the time left once it is steady (not before 3 s), and Cancel, which aborts
// the reads through the job's signal (#3963). One helper, so a new source gets it by calling step(); imported only by the fetching modules.
//
// stages: [[key, weight], ...] in their order (the weights are normalized). step(key, done, total, text): the share of that stage done; the
// overall share is the stages before it plus this one's part, never going back and held under 100 % until end().
import { t as tr } from "./i18n.js";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0);

// the overall share for stage index i at done of total (pure)
export function stagedShare(weights, i, done, total) {
  const sum = weights.reduce((a, w) => a + Math.max(0, w), 0) || 1;
  const before = weights.slice(0, Math.max(0, i)).reduce((a, w) => a + Math.max(0, w), 0);
  const part = total > 0 ? clamp01(done / total) : 0;
  return clamp01((before + Math.max(0, weights[i] || 0) * part) / sum);
}

// seconds left from the time spent and the share done, or null while it is not steady: under 3 s, or under 2 % done (pure)
export function secondsLeft(elapsedS, share) {
  if (!(elapsedS >= 3) || !(share >= 0.02) || share >= 1) return null;
  return Math.max(1, Math.round((elapsedS * (1 - share)) / share));
}
export const timeText = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : tr("{n} s", { n: s }));

let seq = 0;
// setTaskProgress: the store's status-bar setter. -> { step(key, done, total, text), end(), share() }
export function startFetchProgress(setTaskProgress, { label, stages = [["read", 1]], onCancel = null, now = () => Date.now() } = {}) {
  const id = `fetch-${++seq}`, keys = stages.map((s) => s[0]), weights = stages.map((s) => Number(s[1]) || 0), t0 = now();
  let best = 0, eta = null, ended = false, words = label, ticker = null;
  const put = (entry) => setTaskProgress?.((cur) => (cur && cur.onCancel && cur.fetchId !== id ? cur : entry)); // never covers another cancellable task (#2379)
  // nothing counted yet (a source that counts whole tiles, one tile for a small area: GLO-30): a moving bar and the time spent, as GemPy's (#2383),
  // refreshed each second, instead of a bar standing at 0 %
  const show = () => {
    const elapsedS = Math.round((now() - t0) / 1000);
    put(best > 0 ? { label: words, pct: Math.round(best * 100), fetchId: id, ...(onCancel ? { onCancel } : {}) }
      : { label: words, pct: 0, indeterminate: true, elapsedS, fetchId: id, ...(onCancel ? { onCancel } : {}) });
  };
  const step = (key, done, total, text) => {
    if (ended) return;
    const i = Math.max(0, keys.indexOf(key));
    best = Math.min(0.99, Math.max(best, stagedShare(weights, i, done, total)));
    const left = secondsLeft((now() - t0) / 1000, best);
    if (left != null) eta = eta == null ? left : Math.round(0.7 * eta + 0.3 * left); // smoothed: a slow tile does not make it jump
    words = [label, text].filter(Boolean).join(": ") + (eta != null && left != null ? tr(" — about {t} left", { t: timeText(eta) }) : "");
    show();
    if (best === 0 && !ticker && typeof setInterval === "function") ticker = setInterval(() => { if (best > 0 || ended) { clearInterval(ticker); ticker = null; } else show(); }, 1000);
  };
  const end = () => { ended = true; if (ticker) { clearInterval(ticker); ticker = null; } setTaskProgress?.((cur) => (cur && cur.fetchId === id ? null : cur)); };
  return { step, end, share: () => best };
}
