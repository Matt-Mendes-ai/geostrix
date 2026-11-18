// TASKS.csv #3876 (#3791's leftover) — the time left of a long run, from its recent speed. Estimation's kriging run said "about 1 min left" at
// 6 % and "about 3 min left" at 16 %: the straight line from the whole run's average (#3256) is fooled by a fast start (the first blocks are
// cheap: few samples within reach), so it grew as the run met the dense blocks. The rate here is the progress over the last WINDOW_S seconds,
// which follows the run's current speed; until the run is older than the window, that is the whole run's average, as before. Pure.
export const WINDOW_S = 10, MIN_DONE = 0.05, MIN_S = 3;

// start: the run's start (seconds) -> { push(p, t), left(t) -> seconds | null }
export function makeEta(start, { windowS = WINDOW_S } = {}) {
  const pts = [[start, 0]]; // [t, p], p rising
  return {
    push(p, t) {
      const last = pts[pts.length - 1];
      if (!Number.isFinite(p) || !Number.isFinite(t) || p <= last[1] || t <= last[0]) return; // a re-render's same reading, or not forward
      pts.push([t, p]);
      while (pts.length > 2 && pts[1][0] <= t - windowS) pts.shift(); // keep one point at or before the window's start
    },
    left(t) {
      const [t1, p1] = pts[pts.length - 1], [t0, p0] = pts[0];
      if (p1 < MIN_DONE || p1 >= 1 || t - start < MIN_S) return null;
      const rate = (p1 - p0) / Math.max(1e-6, t1 - t0);
      return rate > 0 ? Math.max(0, (1 - p1) / rate - (t - t1)) : null;
    },
  };
}
