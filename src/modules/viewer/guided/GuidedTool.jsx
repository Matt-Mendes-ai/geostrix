// TASKS.csv #3908 (the #3901 redesign, batch P7a; Matt, 2026-11-18: the guided tools live in StrixViewer, under its Model button) — the shared
// shell every guided tool uses, and the "Start here" card that lists them. A card over the view, not a dialog:
//   1. one sentence on what the tool makes;
//   2. one question, already answered from the logs (lib/auto/autoUnits.js) with the reason, for the user to accept or change;
//   3. "Build it for me": the model's size and detail from lib/auto/autoSurface.js, then the existing engine (the stack or implicit run), one
//      run at a time; its progress and Cancel are the engine's own, in the status bar;
//   4. the result card: what was built and "what I chose and why"; "Change these" opens today's full form, filled in;
//   5. when the data cannot support it, nothing is built and the card says why.
// Lazy: ViewerModule.jsx loads this file the first time the Model menu is used (nothing in the startup chunk).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { X } from "../../../components/icons.js";
import { useStore } from "../../../lib/store.jsx";
import { openHelp } from "../../../lib/help.js";
import { t as tr } from "../../../lib/i18n.js";
import { autoSurface, QUICK_RESOLUTION } from "../../../lib/auto/autoSurface.js";
import { roleForLithology } from "../../../lib/layers.js";
import { GUIDED_TOOLS, toolById } from "./guidedTools.js";

const card = { position: "absolute", top: 12, left: 12, width: 360, maxHeight: "calc(100% - 24px)", overflowY: "auto", zIndex: 30, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.14)", padding: 14, color: "var(--color-text)", fontSize: "var(--font-size-base)", lineHeight: 1.45 };
const head = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6, fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-title)" };
const bigBtn = { width: "100%", padding: "8px 10px", border: "1px solid var(--color-tier-basic)", background: "var(--color-tier-basic)", color: "var(--color-bg)", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: "var(--font-size-base)" };
const smallBtn = { padding: "4px 10px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", borderRadius: 5, cursor: "pointer", fontSize: "var(--font-size-sm)" };
const muted = { color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" };

// api (from ViewerModule.jsx, one line): { runStackModel, runImplicitModel, runVeinModel, computeIntercepts, modelResolution, setModelResolution,
//   busy (any model run), surfaces, setStackUnits, setImplicitTarget, setVeinTarget, openPane(pane) }
// A tool may bring its own automatic settings (#3909): auto(ctx, value) -> an autoResult, prepare(api, values) to put them in place, ready(api,
// values) once they have rendered, result(builtSurfaces) for extra lines, actions [{ label, run(api) }]; without them the model's size and
// detail come from autoSurface on the tool's contacts.
export default function GuidedTool({ tool: toolId, setTool, api }) {
  const store = useStore() || {};
  const rows = store.layers?.litho || [];
  const ctx = useMemo(() => {
    let cache = null;
    const mcodes = store.modellingCodes?.codes || [];
    return { rows, veins: store.layers?.vein || [], structures: store.layers?.structure || [], assays: store.assays || [], assayElements: store.assayElements || [], hasDensity: (store.layers?.sg || []).length > 0, gradeTrend: !!store.structuralTrends?.use?.gradeShell, collars: store.collars || [], hasTerrain: !!store.terrain, describe: () => "", target: (v) => (mcodes.some((c) => c.name === v) ? `mcode:${v}` : v), roleOf: (v) => mcodes.find((c) => c.name === v)?.role || roleForLithology(v), isCover: (v) => (mcodes.find((c) => c.name === v)?.role || roleForLithology(v)) === "overburden", intercepts: () => (cache ||= (api.computeIntercepts?.() || []).filter((c) => c.layerKey === "litho")) };
  }, [rows, store.layers, store.collars, store.terrain, store.modellingCodes, store.assays, store.assayElements, store.structuralTrends]); // api.computeIntercepts follows the same logs
  const close = () => setTool(null);
  const tool = toolById(toolId);
  if (!tool) return <StartHere ctx={ctx} setTool={setTool} close={close} />;
  return <Tool key={tool.id} tool={tool} ctx={ctx} api={api} close={close} back={() => setTool("start")} />;
}

function Header({ title, close }) {
  return <div style={head}><span>{tr(title)}</span><button type="button" onClick={close} aria-label={tr("Close")} title={tr("Close")} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}><X size={14} /></button></div>;
}

function StartHere({ ctx, setTool, close }) {
  return (
    <div style={card} role="dialog" aria-label={tr("Start here")}>
      <Header title="Start here" close={close} />
      <div style={{ ...muted, marginBottom: 10 }}>{tr("Build a model from your logs, one step at a time. Each tool asks one question, answers it from your data, and builds the rest for you.")}</div>
      {GUIDED_TOOLS.map((t, i) => {
        const why = t.feed(ctx);
        return (
          <button key={t.id} type="button" onClick={why ? undefined : () => setTool(t.id)} aria-disabled={!!why || undefined} title={why || undefined}
            style={{ display: "block", width: "100%", textAlign: "start", margin: "0 0 6px", padding: "8px 10px", border: "1px solid var(--color-border)", borderInlineStart: "4px solid var(--color-tier-basic)", borderRadius: 6, background: "var(--color-bg)", cursor: why ? "default" : "pointer", opacity: why ? 0.55 : 1 }}>
            <div style={{ fontWeight: 600 }}>{`${i + 1}. ${tr(t.title)}`}</div>
            <div style={muted}>{why || tr(t.line)}</div>
          </button>
        );
      })}
    </div>
  );
}

function Tool({ tool, ctx, api, close, back }) {
  const sug = useMemo(() => (tool.feed(ctx) ? null : tool.suggest(ctx)), [tool, ctx]);
  const choices = useMemo(() => (tool.feed(ctx) ? [] : tool.choices(ctx)), [tool, ctx]);
  const [picked, setPicked] = useState(() => sug?.value ?? (tool.multi ? [] : ""));
  const [phase, setPhase] = useState("ask"); // ask | waiting | running | done | cannot
  const [out, setOut] = useState(null); // { built, reasons, notes } | { verdict }
  const pending = useRef(null), running = useRef(null);
  const surfacesRef = useRef(api.surfaces); surfacesRef.current = api.surfaces;
  const busyRef = useRef(api.busy); busyRef.current = api.busy;
  const value = tool.multi ? (tool.ordered ? tool.ordered(ctx, picked) : picked) : picked;
  const feedWhy = tool.feed(ctx);
  // the suggestion's reason goes on the card only when the user kept it (not "choose one", not for a rock they picked)
  const keptSuggestion = !!sug?.value?.length && JSON.stringify(sug.value) === JSON.stringify(value);

  const build = () => {
    const why = tool.check(ctx, value);
    if (why) { setOut({ verdict: [why] }); setPhase("cannot"); return; }
    const auto = tool.auto ? tool.auto(ctx, value) : autoSurface({ collars: ctx.collars, contacts: tool.contacts(ctx, value), hasLogs: true, maxResolution: QUICK_RESOLUTION });
    if (!auto.ok) { setOut({ verdict: auto.verdict }); setPhase("cannot"); return; }
    pending.current = { auto, before: new Set((surfacesRef.current || []).map((s) => s.id)) };
    setPhase("waiting");
    (tool.prepare || ((a, v) => a.setModelResolution(v.resolution)))(api, auto.values);
  };
  const ready = tool.ready || ((a, v) => a.modelResolution === v.resolution);
  // done: the run's surfaces, what was chosen and why. A run counts as finished when the busy flag it raised falls (the vein and grade runs
  // return at once and work on), or, if it never raised one (it stopped with a message), a moment after it returned
  const finish = () => {
    const r = running.current;
    if (!r) return;
    running.current = null;
    const p = r.p, made = (surfacesRef.current || []).filter((s) => !p.before.has(s.id));
    setOut(made.length
      ? { built: made.map((s) => s.name), reasons: [keptSuggestion ? sug.reason : null, ...p.auto.reasons.map((x) => x.text)].filter(Boolean), notes: [...(tool.result ? tool.result(made, ctx, api) : []), ...p.auto.notes, ...tool.notes(ctx, value)] }
      : { stopped: true, verdict: [tr("It was cancelled, or the run stopped with a message: the messages under the sidebar say why.")] });
    setPhase(made.length ? "done" : "cannot");
  };
  // the run reads its settings from the render it is called in: it starts once they have rendered
  useEffect(() => {
    const p = pending.current;
    if (phase !== "waiting" || !p || !ready(api, p.auto.values)) return;
    pending.current = null;
    setPhase("running");
    const r = running.current = { p, sawBusy: false };
    Promise.resolve(tool.run(api, value, ctx)).finally(() => setTimeout(() => { if (running.current === r && !r.sawBusy && !busyRef.current) finish(); }, 1500));
  });
  useEffect(() => { const r = running.current; if (!r) return; if (api.busy) r.sawBusy = true; else if (r.sawBusy) setTimeout(finish, 0); }, [api.busy]);

  const change = () => { tool.prefill(api, value, ctx); api.openPane(tool.expertPane); };
  const toggle = (u) => setPicked((p) => (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]));
  return (
    <div style={card} role="dialog" aria-label={tr(tool.title)}>
      <Header title={tool.title} close={close} />
      <div style={{ marginBottom: 10 }}>{tr(tool.sentence)}</div>
      {feedWhy ? <div style={{ color: "var(--color-danger-fg)" }}>{feedWhy}</div> : (<>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr(tool.question)}</div>
        {sug?.reason && <div style={{ ...muted, marginBottom: 6 }}>{sug.reason}</div>}
        {tool.multi ? (
          <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 6, padding: "4px 8px", marginBottom: 10 }}>
            {choices.map((u) => <label key={u} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}><input type="checkbox" checked={picked.includes(u)} onChange={() => toggle(u)} disabled={phase === "running" || phase === "waiting"} />{u}</label>)}
          </div>
        ) : (
          <select value={picked} onChange={(e) => setPicked(e.target.value)} disabled={phase === "running" || phase === "waiting"} aria-label={tr(tool.question)} style={{ width: "100%", marginBottom: 10, padding: "4px 6px" }}>
            {!picked && <option value="">{tr("Choose…")}</option>}
            {choices.map((u) => <option key={u} value={u}>{tool.label ? tool.label(u) : u}</option>)}
          </select>
        )}
        <button type="button" style={{ ...bigBtn, opacity: api.busy || phase === "running" || phase === "waiting" ? 0.6 : 1 }} disabled={api.busy || phase === "running" || phase === "waiting"} onClick={build}>
          {phase === "running" || phase === "waiting" ? tr("Building… (progress and Cancel in the status bar)") : tr("Build it for me")}
        </button>
        {api.busy && phase !== "running" && <div style={{ ...muted, marginTop: 4 }}>{tr("Another model is running: one at a time.")}</div>}
      </>)}
      {phase === "done" && out && (
        <div style={{ marginTop: 12, padding: 10, border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-bg-subtle)" }} role="status">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr("Built: {list}", { list: out.built.join(", ") })}</div>
          <div style={{ fontWeight: 600, marginTop: 6 }}>{tr("What I chose and why")}</div>
          <ul style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>{out.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          {out.notes.map((n, i) => <div key={i} style={{ ...muted, marginTop: 6 }}>{n}</div>)}
          <div style={{ ...muted, marginTop: 6 }}>{tr("How well the model agrees with the logs is in the messages under the sidebar.")}</div>
        </div>
      )}
      {phase === "cannot" && out?.verdict && (
        <div style={{ marginTop: 12, padding: 10, border: "1px solid var(--color-danger-fg)", borderRadius: 6 }} role="status">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{out.stopped ? tr("Nothing was built") : tr("Your data cannot support this yet")}</div>
          {out.verdict.map((v, i) => <div key={i}>{v}</div>)}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        {!feedWhy && <button type="button" style={smallBtn} onClick={change} title={tr("Open the full form, filled in with these choices")}>{tr("Change these")}</button>}
        {(tool.actions || []).map((a) => <button key={a.label} type="button" style={smallBtn} onClick={() => a.run(api)}>{tr(a.label)}</button>)}
        <button type="button" style={smallBtn} onClick={() => openHelp(tool.help)}>{tr("Help")}</button>
        <button type="button" style={smallBtn} onClick={back}>{tr("Start here")}</button>
      </div>
    </div>
  );
}
