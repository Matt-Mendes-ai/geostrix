// TASKS.csv #2190 (review #2174, WA gold) — a collar file's STARTDATE / ENDDATE (194 and 197 distinct values on 242 holes) went over
// the 100-distinct-value rule for extra columns (#841 / #1504) and vanished without a word. A date is one value per hole by nature, as
// a coordinate is: such columns are kept with each hole whatever their count, beside the unused coordinate set (#2492).
import { unusedSetColumns } from "./coordSets.js";

// a date word at the start, or after a separator or a drilling word (STARTDATE, ENDDATE, Drill_Dt, sampled_tstamp); not Update / Validated
const DATE_HEADER = /(^|[_\s.-]|start|end|drill(ed)?|complet(ed|ion)?|collar|survey(ed)?|logg?(ed)?|sampl(ed|e)?)(date|dt|tstamp|timestamp|datetime)([_\s.-]|$)|^date/i;
export const isDateHeader = (h) => DATE_HEADER.test(String(h ?? "").trim());

// the collar columns kept whatever their number of distinct values: the coordinate set not used (#2492) and date columns (#2190)
export function collarAlwaysKept(headers, mapping = {}) {
  const mapped = new Set(Object.values(mapping || {}).filter(Boolean));
  const out = unusedSetColumns(headers, mapping);
  for (const h of headers || []) if (h && !mapped.has(h) && isDateHeader(h) && !out.includes(h)) out.push(h);
  return out;
}
