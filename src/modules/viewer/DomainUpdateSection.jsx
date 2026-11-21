// TASKS.csv #3673 phase 2 — the Grade shell pane's "Update an imported domain with new drilling": pick an imported solid and the first year of
// the new drilling; the pane's element, cut-off and probability are used. The run is ./domainUpdateRun.js (loaded on use).
import React, { useMemo, useRef, useState } from "react";
import { t as tr } from "../../lib/i18n.js";
import { holeYear, collarDateFields, newHoleIds, parseIdList } from "../../lib/viewer/domainUpdate.js";
import { gridBlockCount, cellToFit } from "../../lib/estimationMeta.js"; // TASKS.csv #3674 — the cell the pane's budget leaves
import NumberInput from "../../components/NumberInput.jsx"; // TASKS.csv #3926
import { useStore } from "../../lib/store.jsx"; // TASKS.csv #3953

export default function DomainUpdateSection({ ctx, symbol, cutoff, iso, isAssay, style, fieldStyle, selectStyle, buttonStyle }) {
  const imported = (ctx.implicitSurfaces || []).filter((s) => s.type === "imported");
  const years = useMemo(() => { const ys = new Set(); for (const c of ctx.collars || []) { const y = holeYear(c); if (y != null) ys.add(y); } return [...ys].sort((a, b) => a - b); }, [ctx.collars]);
  const [surfaceId, setSurfaceId] = useState("");
  const [firstYear, setFirstYear] = useState("");
  const [busy, setBusy] = useState(false);
  // TASKS.csv #3674 — the new holes by a year, a typed list of hole ids, or a collar date field; the prior's width and the new data's reach (m) typed, else half a sample spacing / one
  const [mode, setMode] = useState("year");
  const [listText, setListText] = useState("");
  const dateFields = useMemo(() => collarDateFields(ctx.collars), [ctx.collars]);
  const [dateField, setDateField] = useState("");
  const [dateText, setDateText] = useState("");
  const [widthText, setWidthText] = useState("");
  const [reachText, setReachText] = useState("");
  const noteCache = useRef({}); // the budget note's figures, worked out once per domain / budget / cell
  const startProjectJob = useStore()?.startProjectJob; // TASKS.csv #3953 (before the early return: hooks run on every render)
  if (!imported.length) return null;
  const sid = imported.some((s) => s.id === surfaceId) ? surfaceId : imported[0].id;
  const fy = Number(firstYear) || (years.length ? years[years.length - 1] : "");
  const df = dateFields.includes(dateField) ? dateField : dateFields[0] || "";
  const select = mode === "list" ? { mode, ids: parseIdList(listText) } : mode === "date" ? { mode, field: df, date: /^\d{4}-\d\d-\d\d$/.test(dateText) ? dateText : "" } : { mode: "year", year: fy };
  const nNew = mode === "date" && !select.date ? 0 : newHoleIds(ctx.collars, select).length;
  const can = isAssay && !busy && Number.isFinite(cutoff) && (mode === "year" ? Number.isFinite(fy) : true) && nNew > 0;
  // the cell the block budget leaves over this domain (the pane's cell grown to fit), said when it is coarser than the pane's cell
  const noteKey = `${sid}|${ctx.numericMaxBlocks}|${ctx.numericCellSize}`;
  const budgetNote = noteCache.current.key === noteKey ? noteCache.current.value : (() => {
    const mesh = ctx.implicitMeshesRef?.current?.[sid], pos = mesh?.geometry?.getAttribute?.("position")?.array;
    if (!pos?.length) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < pos.length; i += 3) { if (pos[i] < x0) x0 = pos[i]; if (pos[i] > x1) x1 = pos[i]; if (pos[i + 1] < y0) y0 = pos[i + 1]; if (pos[i + 1] > y1) y1 = pos[i + 1]; if (pos[i + 2] < z0) z0 = pos[i + 2]; if (pos[i + 2] > z1) z1 = pos[i + 2]; }
    const b = { xmin: x0, xmax: x1, ymin: -z1, ymax: -z0, zmin: y0, zmax: y1 }, budget = Number(ctx.numericMaxBlocks) || 200000, c0 = Math.max(1, Number(ctx.numericCellSize) || 10);
    if (!(gridBlockCount(b, c0) > budget)) return null;
    return { budget, cell: Math.round(cellToFit(b, budget, c0)), asked: c0 };
  })();
  noteCache.current = { key: noteKey, value: budgetNote };
  const run = async () => {
    setBusy(true);
    const job = startProjectJob?.({ label: tr("Update an imported domain with new drilling") }) || null; // TASKS.csv #3953
    try { const { runDomainUpdate } = await import("./domainUpdateRun.js"); await runDomainUpdate(ctx, { job, surfaceId: sid, firstYear: fy, select, priorWidthM: Number(widthText) > 0 ? Number(widthText) : null, newReachM: Number(reachText) > 0 ? Number(reachText) : null, symbol, cutoff, iso }); }
    finally { setBusy(false); job?.end(); }
  };
  return (
    <div style={style}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr("Update an imported domain with new drilling")}</div>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, marginBottom: 6 }}>{tr("Changes the domain only near holes drilled since that disagree with it. The result gives which holes agree, the grade just outside it and below cut-off inside it, and the volume added and removed. Element, cut-off and probability are this pane's.")}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <label style={{ ...fieldStyle, flex: 2 }}>{tr("Domain")}
          <select value={sid} onChange={(e) => setSurfaceId(e.target.value)} style={{ ...selectStyle, width: "100%" }} aria-label={tr("Imported domain to update")}>
            {imported.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label style={{ ...fieldStyle, flex: 1 }}>{tr("Holes from")}
          <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ ...selectStyle, width: "100%" }} aria-label={tr("How the new holes are chosen")}>
            <option value="year">{tr("a year")}</option><option value="list">{tr("a list of holes")}</option>{dateFields.length > 0 && <option value="date">{tr("a date")}</option>}
          </select>
        </label>
      </div>
      {mode === "year" && <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <label style={{ ...fieldStyle, flex: 1 }} title={tr("The holes drilled in this year or later are the new data (the year from a collar year field, else from ids like DH-25-012).")}>{tr("First year")}
          <NumberInput min="1900" max="2200" step="1" allowEmpty value={fy === "" || fy == null ? null : fy} onChange={(n) => setFirstYear(n == null ? "" : String(n))} style={{ ...selectStyle, width: "100%" }} aria-label={tr("First year of the new drilling")} />
        </label>
      </div>}
      {mode === "list" && <label style={{ ...fieldStyle, marginBottom: 6 }}>{tr("Hole ids (commas, spaces or lines)")}
        <textarea value={listText} onChange={(e) => setListText(e.target.value)} rows={2} style={{ ...selectStyle, width: "100%", boxSizing: "border-box" }} aria-label={tr("Hole ids of the new drilling")} />
      </label>}
      {mode === "date" && <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <label style={{ ...fieldStyle, flex: 1 }}>{tr("Date field")}
          <select value={df} onChange={(e) => setDateField(e.target.value)} style={{ ...selectStyle, width: "100%" }} aria-label={tr("Collar field holding the drilling date")}>{dateFields.map((k) => <option key={k} value={k}>{k}</option>)}</select>
        </label>
        <label style={{ ...fieldStyle, flex: 1 }}>{tr("On or after")}
          <input type="date" value={dateText} onChange={(e) => setDateText(e.target.value)} style={{ ...selectStyle, width: "100%" }} aria-label={tr("First date of the new drilling")} />
        </label>
      </div>}
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6 }}>{mode === "year" ? (years.length ? tr("{n} hole(s) drilled from {year} on.", { n: nNew, year: fy }) : tr("No hole has a drilling year (a collar year field, or ids like DH-25-012).")) : tr("{n} hole(s) chosen.", { n: nNew })}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <label style={{ ...fieldStyle, flex: 1 }} title={tr("How far from the old surface the old domain still counts as sure, in metres. Blank: half the samples' spacing.")}>{tr("Prior width (m)")}
          <NumberInput min="0" allowEmpty value={widthText === "" || widthText == null ? null : widthText} placeholder={tr("½ spacing")} onChange={(n) => setWidthText(n == null ? "" : String(n))} style={{ ...selectStyle, width: "100%" }} aria-label={tr("Width of the old domain's prior in metres")} />
        </label>
        <label style={{ ...fieldStyle, flex: 1 }} title={tr("How far a new hole's grade reaches, in metres. Blank: one spacing between the samples.")}>{tr("New data reach (m)")}
          <NumberInput min="0" allowEmpty value={reachText === "" || reachText == null ? null : reachText} placeholder={tr("1 spacing")} onChange={(n) => setReachText(n == null ? "" : String(n))} style={{ ...selectStyle, width: "100%" }} aria-label={tr("Reach of the new holes' grade in metres")} />
        </label>
      </div>
      {budgetNote && <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", lineHeight: 1.4, marginBottom: 6 }}>{tr("The block budget ({budget}) makes {cell} m cells over this domain, not the {asked} m asked: raise the budget above for a finer update.", { budget: budgetNote.budget.toLocaleString(), cell: budgetNote.cell, asked: budgetNote.asked })}</div>}
      <button type="button" onClick={run} disabled={!can} style={{ ...buttonStyle, opacity: can ? 1 : 0.5, cursor: can ? "pointer" : "default" }}>{busy ? tr("Running…") : tr("Update the domain")}</button>
    </div>
  );
}
