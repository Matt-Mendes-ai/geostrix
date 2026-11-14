// TASKS.csv #390 — notice severity. Notices used to be plain strings in caption grey, with severity only
// regex-guessed for aria-live, so a failed export looked exactly like "Loaded 37 holes" and vanished after
// 5 s. A notice may now be { text, level: "error" | "info" }; plain strings still work (the ~150 existing
// call sites), and for those the old wording test decides — explicit levels win.
import { t } from "./i18n.js"; // TASKS.csv #786

const ERROR_RE = /couldn'?t|can'?t|cannot|failed|error|unable|invalid|unsupported|only \./i;

// TASKS.csv #739 — a thrown Error pushed as it is is an error whatever its wording: 84 % of the app's thrown messages
// contain none of ERROR_RE's words. The layering: IPC wrappers (desktop.js) return { ok, error }; src/lib throws; the UI
// turns a caught error into errorNotice(...) (or pushes the Error itself).
export const noticeText = (n) => (typeof n === "string" ? n : n instanceof Error ? n.message : n?.text ?? "");
export const noticeLevel = (n) => (n instanceof Error ? "error" : (n && typeof n === "object" && n.level) || (ERROR_RE.test(noticeText(n)) ? "error" : "info"));
export const errorNotice = (text) => ({ text, level: "error" });
export const infoNotice = (text) => ({ text, level: "info" });

// TASKS.csv #786 — a notice in the interface language: the text is translated (English key, {name} placeholders, see
// lib/i18n.js), but its severity is judged on the ENGLISH wording, which is what ERROR_RE knows ("couldn't", "failed"…).
export const notice = (text, vars) => {
  const english = vars ? String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : String(text);
  return { text: t(text, vars), level: ERROR_RE.test(english) ? "error" : "info" };
};
// TASKS.csv #821 — more (already translated) text after a notice: notice() returns an object, so `notice(...) + "..."`
// would print "[object Object]..." (it did, in the #817 "Model from the map" summary)
export const appendNotice = (n, extra) => (extra ? { ...n, text: n.text + extra } : n);
// TASKS.csv #3114 — a notice that stands for the latest result of one check: the list without the earlier notices of that tag, then the new
// one(s), tagged. A topology check's 'found 3 violation(s)' stayed on screen after a later check passed. Generic: any handler whose result
// replaces its last one can use a tag of its own. Strings and Errors are turned into notice objects so they can carry the tag.
export function replaceNotices(list, tag, next) {
  const kept = (list || []).filter((n) => !(n && typeof n === "object" && !(n instanceof Error) && n.tag === tag));
  const add = (Array.isArray(next) ? next : [next]).filter((n) => n != null).map((n) => (typeof n === "string" ? { text: n, level: noticeLevel(n), tag } : n instanceof Error ? { text: n.message, level: "error", tag } : { ...n, tag }));
  return [...kept, ...add];
}
