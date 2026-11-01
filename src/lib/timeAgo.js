import { t as tr, currentLanguage } from "./i18n.js";

// TASKS.csv #1274, #1302 — how long ago a file was written. A clock time can be wrong here: Chromium read Windows' "British Columbia Standard Time" as
// UTC-8 and the recovery banner said 2:24 PM for a file written at 3:24 PM. An elapsed time does not depend on the zone, and an older file is named by its date.
export function timeAgo(ms, now = Date.now()) {
  const min = Math.floor((now - ms) / 60000);
  if (!(min >= 1)) return tr("less than a minute ago");
  if (min < 60) return min === 1 ? tr("1 minute ago") : tr("{n} minutes ago", { n: min });
  const h = Math.floor(min / 60);
  if (h < 48) return h === 1 ? tr("1 hour ago") : tr("{n} hours ago", { n: h });
  const lang = currentLanguage();
  return new Date(ms).toLocaleDateString(lang === "pt" ? "pt-BR" : lang, { year: "numeric", month: "short", day: "numeric" });
}
