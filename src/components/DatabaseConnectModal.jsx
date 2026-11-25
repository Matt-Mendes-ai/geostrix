import React, { useEffect, useState } from "react";
import { useTablePull, ROW_WARN_THRESHOLD } from "../lib/useTablePull.js"; // TASKS.csv #921 / #925
import { profileProblem } from "../lib/dbProfiles.js"; // TASKS.csv #1267
import TablePullConfirm from "./TablePullConfirm.jsx";
import { Play, Loader2, Save, Trash2 } from "./icons.js";
import { dbLiveQuery, dbLiveListTables, dbPasswordStatus, dbForgetPassword } from "../lib/desktop.js";
import { useStore } from "../lib/store.jsx";
import { useSavedQueries } from "../lib/useSavedQueries.js";
import StepDialog from "./StepDialog.jsx"; // TASKS.csv #4073 — the shared step shell (Escape and the focus trap, #238)
import PromptModal from "./PromptModal.jsx";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926
// TASKS.csv #3926 — NumberInput hands back a number (null when emptied); the handlers here read e.target.value, so it goes back to them as text
const asEvent = (fn) => (v) => fn({ target: { value: v == null ? "" : String(v) } });

// TASKS.csv #925 / #921 — clicking a table imports ALL of it through the Browser panel's guard rails (count first,
// confirm when large, chunked cursor reads: lib/useTablePull.js). It used to write `SELECT * ... LIMIT 500` into the
// query box, and since #917 hands assay tables to Geochem, those 500 rows reached the assay dialog unannounced (review
// #918); Geochem's variant dropped the LIMIT and pulled everything in one query. `initialSql`: the query box's start.
export default function DatabaseConnectModal({ onCancel, onResults, initialSql = "SELECT * FROM lithology LIMIT 500;" }) {
  const { dbConnections, setDbConnections, liveDbConnections, connectDb } = useStore();
  // TASKS.csv #177 — engine picker, MySQL/MariaDB added alongside the original Postgres-only path
  // (Matt confirmed MySQL as the priority engine over SQL Server/Oracle/SQLite). "postgres" stays the
  // default for a brand-new form and is what an old saved connection profile with no engine field at
  // all falls back to, so nothing about an existing saved Postgres connection changes.
  const DEFAULT_PORT = { postgres: 5432, mysql: 3306 };
  const [config, setConfig] = useState({ name: "", engine: "postgres", host: "localhost", port: 5432, database: "", user: "", password: "", ssl: false });
  const [status, setStatus] = useState(null); // {ok, error, info}
  const [testing, setTesting] = useState(false);
  const [sql, setSql] = useState(initialSql);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null); // {rows, fields}
  const [tables, setTables] = useState(null);
  // TASKS.csv #12 — saved query library, not just the last-typed SQL. Cross-project, cross-connection
  // (a saved query is just text — it's up to the user to point it at a compatible schema), so this is
  // independent of `config`/`dbConnections` above.
  const { queries: savedQueries, saveQuery, removeQuery } = useSavedQueries();
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  // TASKS.csv #206 — "the database stays connected... so I don't have [to] enter the password
  // everytime." connectDb() (see store.jsx) reuses an already-live connection for this name instead of
  // opening a new one, so once connected here the SAME live connection also shows up (and stays open)
  // in the new Browser panel, and vice-versa — one shared live-connection pool, not two separate ones.
  const liveEntry = config.name ? liveDbConnections[config.name] : null;

  const set = (k, v) => setConfig((p) => ({ ...p, [k]: v }));
  const [pullError, setPullError] = useState(null);
  const { pending, setPending, busyTable, pickTable, fetchTable } = useTablePull({ liveId: liveEntry?.id, profile: config, onRows: onResults, setError: setPullError });
  // TASKS.csv #621 — is a password remembered (OS-encrypted, this computer only) for exactly this login?
  const [pw, setPw] = useState({ saved: false, available: false });
  const loginKey = `${config.engine}|${config.host}|${config.port}|${config.database}|${config.user}`;
  useEffect(() => {
    let live = true;
    dbPasswordStatus(config).then((r) => { if (live) setPw(r || { saved: false, available: false }); });
    return () => { live = false; };
  }, [loginKey]);
  const forgetPassword = async () => { await dbForgetPassword(config); setPw((p) => ({ ...p, saved: false })); set("rememberPassword", false); };

  const loadSaved = (name) => {
    const saved = dbConnections.find((c) => c.name === name);
    if (saved) setConfig((p) => ({ ...p, engine: "postgres", ...saved, password: "" }));
  };
  const setEngine = (engine) => setConfig((p) => ({ ...p, engine, port: p.port === DEFAULT_PORT[p.engine] ? DEFAULT_PORT[engine] : p.port }));

  const test = async () => {
    const problem = profileProblem(config); // #1267
    if (problem) { setStatus({ ok: false, error: tr(problem) }); return; }
    setTesting(true); setStatus(null);
    const res = await connectDb(config);
    setStatus(res);
    setTesting(false);
    if (res.ok) {
      if (res.passwordSaved) setPw((p) => ({ ...p, saved: true })); // #621
      // save profile without the password
      const { password, ...safe } = config;
      setDbConnections((prev) => {
        const others = prev.filter((c) => c.name !== config.name);
        return config.name ? [...others, safe] : others;
      });
      const id = res.id || liveDbConnections[config.name]?.id;
      const t = await dbLiveListTables(id);
      if (t.ok) setTables(t.tables);
    }
  };

  const run = async () => {
    const id = liveEntry?.id;
    if (!id) { setStatus({ ok: false, error: "Not connected — click Test connection first." }); return; }
    setRunning(true);
    const res = await dbLiveQuery(id, sql);
    setRunning(false);
    if (res.ok) setResult(res);
    else setStatus({ ok: false, error: res.error });
  };

  const useResults = () => {
    if (!result || !result.rows.length) return;
    onResults({ headers: result.fields, rows: result.rows, sourceName: `db:${config.database} (query)` }); // #953 — not a table's name
  };

  // TASKS.csv #4073 (Matt: "similar for all pop up windows") — steps: 1 Connect, 2 Data (a table, or a query), 3 Preview -> Import; the password and certificate
  // wording (#621, #348) kept where it is chosen, the read-only caution (#477) in one line, the rest in the Help card
  const [at, setAt] = useState(0);
  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>{tr("Connect to database")}</summary>
      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{tr("Connects to the database directly, not through DBeaver. The password is used for this session only unless you tick \"Remember the password\" (then it is kept encrypted on this computer, never in the project file). Once connected, it stays open in the Browser panel for the session, so you are not asked again until you disconnect.")}</div>
      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5, marginTop: 6 }}>{tr("GeoStrix opens the database read-only, one statement at a time, and stops any query after 2 minutes. This guards against accidental changes but is not a security boundary: for a real guarantee, connect as a database user with read permission only.")}</div>
    </details>
  );
  const flow = [
    { key: "connect", label: tr("Connect"), primary: { label: tr("Next: data"), disabled: !(status?.ok || liveEntry) }, hint: status?.ok || liveEntry ? "" : tr("Test the connection first."), render: () => (
      <div style={{ flex: 1, minWidth: 0 }}>
          {dbConnections.length > 0 && (
            <select onChange={(e) => loadSaved(e.target.value)} style={{ ...sel, width: "100%", marginBottom: 10 }}>
              <option value="">{tr("— saved connections —")}</option>
              {dbConnections.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          )}

          <div style={grid2}>
            <Field label={tr("Connection name")}>
              <input value={config.name} onChange={(e) => set("name", e.target.value)} placeholder={tr("My Database")} style={inp} />
            </Field>
            <Field label={tr("Engine")}>
              <select aria-label={tr("Database type")} value={config.engine} onChange={(e) => setEngine(e.target.value)} style={sel}>
                <option value="postgres">{tr("PostgreSQL")}</option>
                <option value="mysql">{tr("MySQL / MariaDB")}</option>
              </select>
            </Field>
            <Field label={tr("Host")}>
              <input value={config.host} onChange={(e) => set("host", e.target.value)} style={inp} />
            </Field>
            <Field label={tr("Port")}>
              <NumberInput allowEmpty value={config.port} onChange={asEvent((e) => set("port", e.target.value))} style={inp} />
            </Field>
            <Field label={tr("Database")}>
              <input value={config.database} onChange={(e) => set("database", e.target.value)} style={inp} />
            </Field>
            <Field label={tr("User")}>
              <input value={config.user} onChange={(e) => set("user", e.target.value)} style={inp} />
            </Field>
            <Field label={tr("Password")}>
              <input type="password" value={config.password} onChange={(e) => set("password", e.target.value)} style={inp}
                placeholder={pw.saved ? tr("Saved on this computer — leave empty") : ""} aria-describedby="db-pw-note" />
            </Field>
          </div>
          {/* TASKS.csv #621 — opt-in remembered password */}
          <div id="db-pw-note" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginTop: 6 }}>
            {pw.saved ? (
              <>
                <span style={{ flex: 1 }}>{tr("A password is saved on this computer for this login (encrypted with your Windows account). Leave the box empty to use it.")}</span>
                <button className="gs-btn gs-btn--sm" type="button" onClick={forgetPassword}>{tr("Forget it")}</button>
              </>
            ) : pw.available ? (
              <label style={{ display: "flex", alignItems: "flex-start", gap: 6 }} title={tr("Kept encrypted by the operating system (Windows: only your Windows account on this computer can read it), in GeoStrix's own settings folder — never in the project file. Untick and use Forget to remove it.")}>
                <input type="checkbox" checked={!!config.rememberPassword} onChange={(e) => set("rememberPassword", e.target.checked)} style={{ marginTop: 2 }} />
                <span>{tr("Remember the password on this computer (encrypted, never in the project file)")}</span>
              </label>
            ) : (
              <span>{tr("The password is used for this session only (remembering it needs the desktop app with an OS key store).")}</span>
            )}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", marginTop: 6, marginBottom: 10 }}>
            <input type="checkbox" checked={config.ssl} onChange={(e) => set("ssl", e.target.checked)} />{" "}{tr("Use SSL (server certificate is verified)")}</label>
          {/* TASKS.csv #348 — verification is the default; skipping it is an explicit, labelled choice. */}
          {config.ssl && (
            <label style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: "var(--font-size-sm)", color: config.sslInsecure ? "var(--color-danger-icon-strong)" : "var(--color-text-muted)", marginTop: -4, marginBottom: 10 }}>
              <input type="checkbox" checked={!!config.sslInsecure} onChange={(e) => set("sslInsecure", e.target.checked)} style={{ marginTop: 2 }} />
              <span>{tr("Trust a self-signed / unverified certificate (insecure: on a shared network, someone else could pose as this server and capture the password)")}</span>
            </label>
          )}
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginBottom: 10 }}>{/* TASKS.csv #477 — honest wording: the read-only session is a guard, not a guarantee */}{tr("Read-only guard, not a security boundary: connect as a read-only user for a guarantee.")}</div>
          <button className="gs-btn" style={{ width: "100%" }} onClick={test} disabled={testing}>
            {testing ? <Loader2 size={14} className="spin" /> : liveEntry ? tr("Reconnect") : tr("Test connection")}
          </button>

          {liveEntry && !status && (
            <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 6, fontSize: "var(--font-size-base)", background: "#12241a", border: "1px solid #2d5a3d", color: "var(--color-success-text)" }}>{tr("Already connected as \"{name}\". It stays open in the Browser panel, so the password is not asked again this session unless you disconnect there.", { name: config.name })}</div>
          )}
          {status && (
            <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 6, fontSize: "var(--font-size-base)", background: status.ok ? "#12241a" : "#2a1a1a", border: `1px solid ${status.ok ? "#2d5a3d" : "var(--color-danger-border-strong)"}`, color: status.ok ? "var(--color-success-text)" : "var(--color-danger-text)" }}>
              {status.ok ? tr("Connected — {v} as {v2}{v3}", { v: status.info?.db, v2: status.info?.usr, v3: status.reused ? tr(" (reused existing connection)") : tr(" — stays open for the rest of this session") }) : status.error}
            </div>
          )}
      </div>
    ) },
    { key: "data", label: tr("Data"), primary: { label: tr("Next: preview"), disabled: !result }, render: () => (
      <div style={{ flex: 1, minWidth: 0 }}>
          {tables && (
            <div style={{ marginTop: 12 }}>
              <div style={label}>{tr("Tables & views ({tables})", { tables: tables.length })}</div>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6, lineHeight: 1.45 }}>{tr("Click a table to import all of it (a table over {n} rows asks first). Use the query box below for your own SQL.", { n: ROW_WARN_THRESHOLD.toLocaleString() })}</div>
              {pullError && <div style={{ color: "var(--color-danger-text)", fontSize: "var(--font-size-sm)", marginBottom: 6 }}>{pullError}</div>}
              <TablePullConfirm pending={pending} onFirst={() => fetchTable(pending.t, pending.total, ROW_WARN_THRESHOLD)} onAll={() => fetchTable(pending.t, pending.total, null)} onCancel={() => setPending(null)} />
              {/* TASKS.csv #177 — a DBeaver-managed company database is exactly the case where the
                  useful thing to pull from is a pre-built VIEW (pre-joined/pre-cleaned), not a raw
                  base table, so views are marked distinctly rather than looking identical to tables. */}
              <div style={{ maxHeight: 100, overflowY: "auto", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", borderRadius: 6, padding: 8 }}>
                {tables.map((t, i) => {
                  const key = `${t.table_schema}.${t.table_name}`;
                  return (
                    <div role="button" tabIndex={0} onKeyDown={activateOnKey} key={i} onClick={() => { if (!busyTable) pickTable(t); }} title={tr("Import {key} (checks its row count first)", { key })} style={{ cursor: busyTable ? "default" : "pointer", padding: "2px 0", display: "flex", alignItems: "center", gap: 6, opacity: busyTable && busyTable !== key ? 0.5 : 1 }}>
                      {busyTable === key && <Loader2 size={12} className="spin" style={{ flexShrink: 0 }} />}
                      {t.table_type === "VIEW" && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-accent)", border: "1px solid var(--color-accent)", borderRadius: 3, padding: "0 4px", flexShrink: 0 }}>{tr("VIEW")}</span>}
                      <span>{key}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ ...label, marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>{tr("Query")}</span>
            {savedQueries.length > 0 && (
              <select
                value=""
                onChange={(e) => { const q = savedQueries.find((sq) => sq.name === e.target.value); if (q) setSql(q.sql); }}
                style={{ ...sel, fontSize: "var(--font-size-sm)", padding: "3px 6px" }}
              >
                <option value="">{tr("— saved queries —")}</option>
                {savedQueries.map((q) => <option key={q.name} value={q.name}>{q.name}</option>)}
              </select>
            )}
          </div>
          <textarea value={sql} onChange={(e) => setSql(e.target.value)} rows={4} style={{ ...inp, width: "100%", fontFamily: "'Exo 2', system-ui, sans-serif", resize: "vertical" }} />
          {savedQueries.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
              {savedQueries.map((q) => (
                <div key={q.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-sm)", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "2px 4px 2px 8px" }}>
                  <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setSql(q.sql)} title={q.sql} style={{ cursor: "pointer", color: "var(--color-text)" }}>{q.name}</span>
                  <Trash2 aria-label={tr("Remove saved query \"{name}\"", { name: q.name })} title={tr("Remove saved query \"{name}\"", { name: q.name })} role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-text-muted)" }} onClick={() => removeQuery(q.name)} />
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button className="gs-btn" style={{ flex: 1 }} onClick={run} disabled={running || !status?.ok}>
              <Play size={14} /> {running ? tr("Running…") : tr("Run query")}
            </button>
            <button className="gs-btn gs-btn--icon" onClick={() => setSavePromptOpen(true)} disabled={!sql.trim()} title={tr("Save this query for reuse across projects/connections")}>
              <Save size={14} />
            </button>
          </div>
          {savePromptOpen && (
            <PromptModal
              title={tr("Save query as…")}
              defaultValue=""
              confirmLabel="Save"
              onCancel={() => setSavePromptOpen(false)}
              onConfirm={(name) => { if (name && name.trim()) saveQuery(name.trim(), sql); setSavePromptOpen(false); }}
            />
          )}
      </div>
    ) },
    { key: "preview", label: tr("Preview"), primary: { label: tr("Import these {v} rows…", { v: result?.rowCount || 0 }), onClick: useResults, disabled: !result || !result.rows.length }, render: () => (
      <div style={{ flex: 1, minWidth: 0 }}>
          {result && (
            <div style={{ marginTop: 12 }}>
              <div style={label}>{tr("Preview ({rowCount} rows)", { rowCount: result.rowCount })}</div>
              <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: 6, maxHeight: 200, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
                  <thead><tr>{result.fields.map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {result.rows.slice(0, 20).map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--color-hover-bg)" }}>{result.fields.map((h) => <td key={h} style={td}>{String(r[h] ?? "")}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
      </div>
    ) },
  ];
  const heading = tr("Connect to database"); // the dialog's name, seen (not a tooltip)
  return <StepDialog title={heading} onClose={onCancel} steps={flow} at={at} onAt={setAt} help={help} width="min(600px, 92vw)" />;
}

function Field({ label: l, children }) {
  return <div><div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 3 }}>{l}</div>{children}</div>;
}

const label = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 };
const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "7px 9px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const inp = { width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "7px 9px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };
const th = { textAlign: "start", padding: "6px 8px", color: "var(--color-text-muted)", fontWeight: 500, borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, background: "var(--color-bg)" };
const td = { padding: "5px 8px", color: "var(--color-text-strong)", whiteSpace: "nowrap" };
