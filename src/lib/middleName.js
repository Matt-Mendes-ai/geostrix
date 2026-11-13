// TASKS.csv #2852 — a long name's tail, kept whole when the name is cut (components/MiddleName.jsx). Pure.
// the part kept whole: what follows the last ' — ' (a filter product's suffix) or else the last 16 characters
export function nameTail(name) {
  const s = String(name ?? "");
  if (s.length <= 24) return "";
  const dash = s.lastIndexOf(" — ");
  const t = dash > 0 && s.length - dash <= 40 ? s.slice(dash) : s.slice(-16);
  return t.length < s.length ? t : "";
}
