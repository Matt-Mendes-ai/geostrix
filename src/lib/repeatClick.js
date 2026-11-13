// TASKS.csv #1152 — two clicks at the same spot within `ms` (a double-click) end a line: the second click is not a vertex.
// TASKS.csv #3159 — moved verbatim out of interpretation.js: the 3D view's click handler needs it at startup, and importing it
// from interpretation.js put the whole interpretation-layer code in the startup bundle. interpretation.js re-exports it.
export const isRepeatClick = (prev, next, { ms = 400, m = 2 } = {}) => !!prev && !!next && next.at - prev.at < ms && Math.hypot(next.x - prev.x, next.y - prev.y) <= m;
