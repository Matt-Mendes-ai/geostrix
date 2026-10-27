// TASKS.csv #921 / #925 / #951 — the whole-table import with the #282 guard rails, shared by the Browser panel and the
// Connect to database dialog. Review #918: the dialog's table list wrote `SELECT * FROM schema.table LIMIT 500` (bare
// identifiers, #349) and, since #917 handed assay tables to Geochem, a 500-row cut reached the assay dialog unannounced;
// Geochem's own Database button wrote the same query without the LIMIT, one unbounded pull with no count, confirm or
// cancel. Both now count first, confirm above ROW_WARN_THRESHOLD, and read through a server-side cursor in chunks.
//
// TASKS.csv #282 — the bounds. #255 removed the old hard LIMIT 500 (a drillhole program's litho/assay table is tens of
// thousands of rows) but put nothing in its place; re-capping would resurrect that complaint, so it is warn-first:
//   1. `SELECT COUNT(*)` first, so the size is known before anything is pulled;
//   2. above ROW_WARN_THRESHOLD a confirm with the real number and a "first N rows" option;
//   3. anything over CHUNK_ROWS through a CURSOR (not LIMIT/OFFSET, which re-scans and can skip or repeat rows when the
//      table changes underneath), driving the status bar's progress bar with a working Cancel.
import { useCallback, useRef, useState } from "react";
import { selectSql, countSql, chunkedReadPlan } from "./dbSql.js"; // TASKS.csv #349 — quoting and chunked reads per engine
import { dbLiveQuery } from "./desktop.js";
import { useSetTaskProgress } from "./store.jsx";
import { t as tr } from "./i18n.js";

export const ROW_WARN_THRESHOLD = 50000;
export const CHUNK_ROWS = 20000;
const IMPORT_STEP = { importStep: true }; // TASKS.csv #665 — the import's own transaction steps (the SQL box never sends this)

// liveId: the live connection's id; profile: { engine, database }; onRows({ headers, rows, sourceName }); setError(text | null)
export function useTablePull({ liveId, profile, onRows, setError }) {
  const [pending, setPending] = useState(null); // a counted, not yet fetched table: { t, total }
  const [busyTable, setBusyTable] = useState(null); // "schema.table" while counting / fetching
  const cancelRef = useRef(false);
  const setTaskProgress = useSetTaskProgress();
  const engine = profile?.engine || "postgres"; // #349 — old saved profiles have no engine: Postgres
  const database = profile?.database;

  // `limit` = null means everything
  const fetchTable = useCallback(async (t, total, limit) => {
    const label = `Importing ${t.table_schema}.${t.table_name}`;
    const target = limit == null ? total : Math.min(limit, total);
    setPending(null);
    setError(null);
    setBusyTable(`${t.table_schema}.${t.table_name}`);
    cancelRef.current = false;

    const finish = (rows, fields, truncated) => {
      setBusyTable(null);
      setTaskProgress?.(null);
      if (!rows.length) { setError(tr("That table returned no rows.")); return; }
      let sourceName = `db:${database}.${t.table_name}`;
      if (truncated) sourceName += ` (first ${rows.length.toLocaleString()} of ${total.toLocaleString()})`;
      onRows({ headers: fields, rows, sourceName });
    };

    // small enough for one round trip: no cursor, no transaction, no progress bar
    if (target <= CHUNK_ROWS) {
      const res = await dbLiveQuery(liveId, selectSql(engine, t.table_schema, t.table_name, limit));
      setBusyTable(null);
      if (!res.ok) { setError(res.error); return; }
      finish(res.rows, res.fields, limit != null && total > limit);
      return;
    }

    setTaskProgress?.({ label, pct: 1, onCancel: () => { cancelRef.current = true; } });
    const rows = [];
    let fields = null;
    // a cursor needs a transaction; everything here is read-only, so it is opened explicitly and always rolled back
    const plan = chunkedReadPlan(engine, t.table_schema, t.table_name); // #349
    const begin = await dbLiveQuery(liveId, plan.begin, IMPORT_STEP); // TASKS.csv #348 (the session is read-only too)
    if (!begin.ok) { setBusyTable(null); setTaskProgress?.(null); setError(begin.error); return; }
    try {
      if (plan.open) {
        const decl = await dbLiveQuery(liveId, plan.open, IMPORT_STEP);
        if (!decl.ok) { setError(decl.error); return; }
      }
      while (rows.length < target) {
        if (cancelRef.current) { setError(tr("Import cancelled — {rows} row(s) fetched, nothing imported.", { rows: rows.length.toLocaleString() })); return; }
        const want = Math.min(CHUNK_ROWS, target - rows.length);
        const res = await dbLiveQuery(liveId, plan.page(want, rows.length), IMPORT_STEP);
        if (!res.ok) { setError(res.error); return; }
        if (!fields) fields = res.fields;
        for (const r of res.rows) rows.push(r); // not push(...rows): a 20,000-row spread is near the argument limit
        setTaskProgress?.({ label: `${label} — ${rows.length.toLocaleString()} / ${target.toLocaleString()} rows`, pct: Math.min(99, (rows.length / Math.max(1, target)) * 100), onCancel: () => { cancelRef.current = true; } });
        if (res.rows.length < want) break; // cursor exhausted early (rows removed since the COUNT)
      }
      finish(rows, fields || [], limit != null && total > limit);
    } finally {
      if (plan.close) await dbLiveQuery(liveId, plan.close, IMPORT_STEP).catch(() => {});
      await dbLiveQuery(liveId, plan.end, IMPORT_STEP).catch(() => {});
      setBusyTable(null);
      setTaskProgress?.(null);
    }
  }, [liveId, engine, database, onRows, setError, setTaskProgress]);

  // clicking a table counts first and pulls nothing until the size is known
  const pickTable = useCallback(async (t) => {
    if (!liveId) return;
    setError(null);
    setPending(null);
    setBusyTable(`${t.table_schema}.${t.table_name}`);
    const res = await dbLiveQuery(liveId, countSql(engine, t.table_schema, t.table_name)); // #349
    setBusyTable(null);
    if (!res.ok) { setError(res.error); return; }
    // COUNT(*) is a bigint, which node-postgres hands over as a STRING
    const total = Number(res.rows?.[0]?.n ?? 0);
    if (!Number.isFinite(total)) { setError(tr("Couldn't read that table's row count.")); return; }
    if (total === 0) { setError(tr("That table is empty — nothing to import.")); return; }
    if (total > ROW_WARN_THRESHOLD) { setPending({ t, total }); return; }
    fetchTable(t, total, null);
  }, [liveId, engine, fetchTable, setError]);

  return { pending, setPending, busyTable, pickTable, fetchTable };
}
