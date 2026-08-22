import React, { useState } from "react";
import { X, Database, Play, Loader2 } from "lucide-react";
import { dbLiveQuery, dbLiveListTables } from "../lib/desktop.js";
import { useStore } from "../lib/store.jsx";

export default function DatabaseConnectModal({ onCancel, onResults }) {
  const { dbConnections, setDbConnections, liveDbConnections, connectDb } = useStore();
  const [config, setConfig] = useState({ name: "", host: "localhost", port: 5432, database: "", user: "", password: "", ssl: false });
  const [status, setStatus] = useState(null); // {ok, error, info}
  const [testing, setTesting] = useState(false);
  const [sql, setSql] = useState("SELECT * FROM lithology LIMIT 500;");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null); // {rows, fields}
  const [tables, setTables] = useState(null);
  // TASKS.csv #206 — "the database stays connected... so I don't have [to] enter the password
  // everytime." connectDb() (see store.jsx) reuses an already-live connection for this name instead of
  // opening a new one, so once connected here the SAME live connection also shows up (and stays open)
  // in the new Browser panel, and vice-versa — one shared live-connection pool, not two separate ones.
  const liveEntry = config.name ? liveDbConnections[config.name] : null;

  const set = (k, v) => setConfig((p) => ({ ...p, [k]: v }));

  const loadSaved = (name) => {
    const saved = dbConnections.find((c) => c.name === name);
    if (saved) setConfig((p) => ({ ...p, ...saved, password: "" }));
  };

  const test = async () => {
    setTesting(true); setStatus(null);
    const res = await connectDb(config);
    setStatus(res);
    setTesting(false);
    if (res.ok) {
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
    onResults({ headers: result.fields, rows: result.rows, sourceName: `db:${config.database}` });
  };

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Database size={16} color="#55606e" />
            <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>Connect to database</div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onCancel} />
        </div>

        <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          <div style={{ fontSize: 11, color: "#55606e", marginBottom: 12, lineHeight: 1.5 }}>
            Connects directly to the Postgres database — the same one DBeaver points at — rather than going through DBeaver itself. Password is used for this session only; never saved to disk or to the project file. Once connected it stays open for the rest of the session (see the new Browser panel in the 3D View sidebar) so you won't be asked again until you disconnect.
          </div>

          {dbConnections.length > 0 && (
            <select onChange={(e) => loadSaved(e.target.value)} style={{ ...sel, width: "100%", marginBottom: 10 }}>
              <option value="">— saved connections —</option>
              {dbConnections.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          )}

          <div style={grid2}>
            <Field label="Connection name">
              <input value={config.name} onChange={(e) => set("name", e.target.value)} placeholder="REDACTED DB" style={inp} />
            </Field>
            <Field label="Host">
              <input value={config.host} onChange={(e) => set("host", e.target.value)} style={inp} />
            </Field>
            <Field label="Port">
              <input type="number" value={config.port} onChange={(e) => set("port", e.target.value)} style={inp} />
            </Field>
            <Field label="Database">
              <input value={config.database} onChange={(e) => set("database", e.target.value)} style={inp} />
            </Field>
            <Field label="User">
              <input value={config.user} onChange={(e) => set("user", e.target.value)} style={inp} />
            </Field>
            <Field label="Password">
              <input type="password" value={config.password} onChange={(e) => set("password", e.target.value)} style={inp} />
            </Field>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#55606e", marginTop: 6, marginBottom: 10 }}>
            <input type="checkbox" checked={config.ssl} onChange={(e) => set("ssl", e.target.checked)} /> Use SSL
          </label>

          <button onClick={test} disabled={testing} style={{ ...btn(true), width: "100%" }}>
            {testing ? <Loader2 size={13} className="spin" /> : liveEntry ? "Reconnect" : "Test connection"}
          </button>

          {liveEntry && !status && (
            <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 6, fontSize: 11.5, background: "#12241a", border: "1px solid #2d5a3d", color: "#8fd9ab" }}>
              Already connected as "{config.name}" — stays open in the Browser panel too, so you won't be asked for the password again this session unless you disconnect it there.
            </div>
          )}
          {status && (
            <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 6, fontSize: 11.5, background: status.ok ? "#12241a" : "#2a1a1a", border: `1px solid ${status.ok ? "#2d5a3d" : "#5a2a2a"}`, color: status.ok ? "#8fd9ab" : "#e0a0a0" }}>
              {status.ok ? `Connected — ${status.info?.db} as ${status.info?.usr}${status.reused ? " (reused existing connection)" : " — stays open for the rest of this session"}` : status.error}
            </div>
          )}

          {tables && (
            <div style={{ marginTop: 12 }}>
              <div style={label}>Tables &amp; views ({tables.length})</div>
              {/* TASKS.csv #177 — a DBeaver-managed company database is exactly the case where the
                  useful thing to pull from is a pre-built VIEW (pre-joined/pre-cleaned), not a raw
                  base table, so views are marked distinctly rather than looking identical to tables. */}
              <div style={{ maxHeight: 100, overflowY: "auto", fontSize: 11, color: "#55606e", border: "1px solid #d9dce1", borderRadius: 6, padding: 8 }}>
                {tables.map((t, i) => (
                  <div key={i} onClick={() => setSql(`SELECT * FROM ${t.table_schema}.${t.table_name} LIMIT 500;`)} style={{ cursor: "pointer", padding: "2px 0", display: "flex", alignItems: "center", gap: 6 }}>
                    {t.table_type === "VIEW" && <span style={{ fontSize: 9, color: "#e2a63c", border: "1px solid #e2a63c", borderRadius: 3, padding: "0 4px", flexShrink: 0 }}>VIEW</span>}
                    <span>{t.table_schema}.{t.table_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ ...label, marginTop: 16 }}>Query</div>
          <textarea value={sql} onChange={(e) => setSql(e.target.value)} rows={4} style={{ ...inp, width: "100%", fontFamily: "'Exo 2', system-ui, sans-serif", resize: "vertical" }} />
          <button onClick={run} disabled={running || !status?.ok} style={{ ...btn(true), width: "100%", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Play size={13} /> {running ? "Running…" : "Run query"}
          </button>

          {result && (
            <div style={{ marginTop: 12 }}>
              <div style={label}>Preview ({result.rowCount} rows)</div>
              <div style={{ overflowX: "auto", border: "1px solid #d9dce1", borderRadius: 6, maxHeight: 200, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead><tr>{result.fields.map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {result.rows.slice(0, 20).map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #eef1f5" }}>{result.fields.map((h) => <td key={h} style={td}>{String(r[h] ?? "")}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #d9dce1" }}>
          <button onClick={onCancel} style={{ ...btn(false), flex: 1 }}>Close</button>
          <button onClick={useResults} disabled={!result || !result.rows.length} style={{ ...btn(true), flex: 2 }}>Import these {result?.rowCount || 0} rows…</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label: l, children }) {
  return <div><div style={{ fontSize: 10.5, color: "#55606e", marginBottom: 3 }}>{l}</div>{children}</div>;
}

const overlay = { position: "fixed", inset: 0, background: "rgba(8,10,14,0.75)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" };
const panel = { width: "min(600px, 92vw)", maxHeight: "88vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Exo 2', system-ui, sans-serif" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const label = { fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a1b0", marginBottom: 8 };
const sel = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "7px 9px", color: "#1a2028", fontSize: 12, fontFamily: "inherit" };
const inp = { width: "100%", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "7px 9px", color: "#1a2028", fontSize: 12, fontFamily: "inherit" };
const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };
const th = { textAlign: "left", padding: "6px 8px", color: "#94a1b0", fontWeight: 500, borderBottom: "1px solid #d9dce1", position: "sticky", top: 0, background: "#ffffff" };
const td = { padding: "5px 8px", color: "#2a3340", whiteSpace: "nowrap" };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid #3d6b52" : "1px solid #c7ccd3", background: primary ? "#1e3629" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
