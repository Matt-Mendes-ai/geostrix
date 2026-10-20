// TASKS.csv #390 — notice severity. Notices used to be plain strings in caption grey, with severity only
// regex-guessed for aria-live, so a failed export looked exactly like "Loaded 37 holes" and vanished after
// 5 s. A notice may now be { text, level: "error" | "info" }; plain strings still work (the ~150 existing
// call sites), and for those the old wording test decides — explicit levels win.
const ERROR_RE = /couldn'?t|can'?t|cannot|failed|error|unable|invalid|unsupported|only \./i;

// TASKS.csv #739 — a thrown Error pushed as it is is an error whatever its wording: 84 % of the app's thrown messages
// contain none of ERROR_RE's words. The layering: IPC wrappers (desktop.js) return { ok, error }; src/lib throws; the UI
// turns a caught error into errorNotice(...) (or pushes the Error itself).
export const noticeText = (n) => (typeof n === "string" ? n : n instanceof Error ? n.message : n?.text ?? "");
export const noticeLevel = (n) => (n instanceof Error ? "error" : (n && typeof n === "object" && n.level) || (ERROR_RE.test(noticeText(n)) ? "error" : "info"));
export const errorNotice = (text) => ({ text, level: "error" });
export const infoNotice = (text) => ({ text, level: "info" });
