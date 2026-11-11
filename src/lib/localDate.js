// TASKS.csv #2310 / #2358 — today's date on the local calendar (yyyy-mm-dd), as {date} prints it. new Date().toISOString().slice(0, 10)
// is the UTC date: tomorrow from 16:00 in British Columbia, yesterday in the morning in Western Australia.
export function localDate(d = new Date()) {
  const p2 = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
