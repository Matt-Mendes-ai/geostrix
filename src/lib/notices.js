// TASKS.csv #390 — notice severity. Notices used to be plain strings in caption grey, with severity only
// regex-guessed for aria-live, so a failed export looked exactly like "Loaded 37 holes" and vanished after
// 5 s. A notice may now be { text, level: "error" | "info" }; plain strings still work (the ~150 existing
// call sites), and for those the old wording test decides — explicit levels win.
const ERROR_RE = /couldn'?t|can'?t|cannot|failed|error|unable|invalid|unsupported|only \./i;

export const noticeText = (n) => (typeof n === "string" ? n : n?.text ?? "");
export const noticeLevel = (n) => (n && typeof n === "object" && n.level) || (ERROR_RE.test(noticeText(n)) ? "error" : "info");
export const errorNotice = (text) => ({ text, level: "error" });
export const infoNotice = (text) => ({ text, level: "info" });
