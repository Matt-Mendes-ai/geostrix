// TASKS.csv #1254 — minerals logged on the same interval were drawn over each other: Py under Ccp from 43.5 to 110 m, on every hole. Each overlapping row gets
// its own lane. -> { rows: [{ ...row, lane }], lanes }, in the rows' order by depth. One lane when nothing overlaps.
export function fillLanes(rows) {
  const ends = [];
  const out = [...(rows || [])].sort((a, b) => a.from - b.from || String(a.value).localeCompare(String(b.value))).map((r) => {
    let lane = ends.findIndex((e) => e <= r.from + 1e-9);
    if (lane < 0) { lane = ends.length; ends.push(r.to); } else ends[lane] = r.to;
    return { ...r, lane };
  });
  return { rows: out, lanes: Math.max(1, ends.length) };
}
