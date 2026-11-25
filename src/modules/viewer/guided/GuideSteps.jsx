// TASKS.csv #4035 (guided modelling row 5, design docs/ideas/guided-modelling-design.md sections 1 and 2) — the guide: "Start here" as seven steps.
// A strip of seven dots (any dot opens its step; going back deletes nothing) above the step the guide is on: its line, what it found, its one
// question with the answer suggested from the data, and the doors (guideActs.js). Step 4 shows the route cards (Compute / Draw / Model from map),
// the one the data favours marked Suggested with its reason. After a run fails, its notice's code (#4034) adds the "Next" buttons. What is done
// is read from the project each time (lib/guide/guideSteps.js); only the route, the skipped steps and the step it is on are kept (#4032).
import React from "react";
import { t as tr } from "../../../lib/i18n.js";
import { openHelp } from "../../../lib/help.js"; // TASKS.csv #4036 - the guide's Help card
import { guideFacts } from "../../../lib/guide/guideFacts.js";
import { GUIDE_STEPS, guideStatus } from "../../../lib/guide/guideSteps.js";
import { nextFor } from "../../../lib/guide/guideFailures.js";
import { ACT_LABELS, ROUTE_LABELS, runAct, explicitUnit } from "./guideActs.js";

const muted = { color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" };
const DOT = { done: "var(--color-success-fg)", next: "var(--color-tier-basic)", waiting: "var(--color-border)", skipped: "var(--color-text-muted)" };
const STATE_WORD = { done: "Done", next: "Next", waiting: "Waiting", skipped: "Skipped" };

// the step the guide shows: the dot pressed in this card; else the saved place (#4032) while that step is not done; else the first that can be
// done now (design: Start here reopens on the first step neither done nor skipped)
export function shownStep(status, pressed, saved) {
  if (pressed && status.steps.some((x) => x.id === pressed)) return pressed;
  const s = saved && status.steps.find((x) => x.id === saved);
  return s && s.state !== "done" && s.state !== "skipped" ? s.id : status.at;
}

// the newest failure notice (one with a code, #4034) since the guide opened -> [{ label, vars, act }]
export function nextAfterFailure(notices, since) {
  const n = (notices || []).slice(since).reverse().find((x) => x && typeof x === "object" && x.code);
  return n ? nextFor(n.code, n.detail) : [];
}

function Door({ act, arg, env, primary, label }) {
  return <button type="button" className={primary ? "gs-btn gs-btn--primary gs-btn--sm" : "gs-btn gs-btn--sm"} onClick={() => runAct(act, arg, env)}>{label || tr(ACT_LABELS[act])}</button>;
}
function Rows({ rows, env }) {
  return (rows || []).map((r, i) => (
    <div key={`${r.key}${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "4px 0", borderTop: i ? "1px solid var(--color-border)" : "none" }}>
      {r.text ? <span style={r.low ? { color: "var(--color-warn-text-strong)" } : undefined}>{r.text}</span> : r.done || !r.act ? <span>{tr(ACT_LABELS[r.act])}</span> : null}{/* a row with no words of its own is its button (step 6) */}
      {r.done ? <span aria-label={tr("Done")} style={{ color: DOT.done }}>✓</span> : r.act ? <Door act={r.act} arg={r} env={env} label={r.code ? tr("Build {code}", { code: r.code }) : undefined} /> : null}{/* a vein's button names it (#4037) */}
    </div>
  ));
}

// the routes the data allows (step 4): the card of each; with one there is nothing to choose
export const routesOf = (asks) => [...new Set([...(asks?.suggest?.routes || []), asks?.route].filter(Boolean))];

// shown: a ref the card keeps the shown step in, { n, of, title } (the bar names it without loading this chunk or reading the project)
export default function GuideSteps({ store, api, setTool, toBar, viewId, setViewId, since, shown }) {
  const facts = guideFacts(store), guide = store.modelGuide || {};
  const status = guideStatus(facts, { ...guide, ui: { modelResolution: api.modelResolution, fit: api.lastFit } });
  const id = shownStep(status, viewId, guide.at);
  if (shown) shown.current = { n: GUIDE_STEPS.findIndex((x) => x.id === id) + 1, of: GUIDE_STEPS.length, title: GUIDE_STEPS.find((x) => x.id === id).title };
  const k = GUIDE_STEPS.findIndex((x) => x.id === id), step = GUIDE_STEPS[k], s = status.steps[k], asks = s.asks || {};
  const env = { api, store, setTool, toBar };
  const go = (sid) => { setViewId(sid); store.setGuideAt?.(sid); };
  const next = nextAfterFailure(api.notices, since);
  const userSkipped = (guide.skipped || []).includes(id);
  return (<>
    <div role="tablist" aria-label={tr("Start here")} style={{ display: "flex", gap: 4, margin: "2px 0 10px" }}>
      {status.steps.map((x, i) => (
        <button data-btn-own="" key={x.id} type="button" role="tab" aria-selected={x.id === id} onClick={() => go(x.id)} title={`${tr(GUIDE_STEPS[i].title)}: ${tr(STATE_WORD[x.state])}`}
          aria-label={`${i + 1}. ${tr(GUIDE_STEPS[i].title)}: ${tr(STATE_WORD[x.state])}`}
          style={{ flex: 1, height: 22, borderRadius: 11, cursor: "pointer", fontSize: "var(--font-size-xs)", fontWeight: 600, border: `2px solid ${x.id === id ? "var(--color-text)" : DOT[x.state]}`, background: x.state === "done" || x.state === "next" ? DOT[x.state] : "var(--color-bg)", color: x.state === "done" || x.state === "next" ? "var(--color-bg)" : "var(--color-text-secondary)" }}>
          {x.state === "done" ? "✓" : i + 1}
        </button>
      ))}
    </div>
    <div data-guide-step={id}>
      <div style={{ fontWeight: 600 }}>{`${k + 1}. ${tr(step.title)}`}<span style={{ ...muted, fontWeight: 400 }}>{` · ${tr(STATE_WORD[s.state])}`}</span></div>{/* the dots' legend, in words (#4037) */}
      <div style={{ ...muted, marginBottom: 8 }}>{tr(step.line)}</div>
      {s.reason && !(id === "build" && routesOf(asks).length > 1 && s.reason === asks.suggest?.reason) /* step 4 says it on the Suggested card, when there are cards to choose between */ && <div style={{ marginBottom: 8, color: s.state === "waiting" ? "var(--color-warn-text-strong)" : "inherit" }}>{s.reason}</div>}
      {step.question && s.asks && (id !== "build" || routesOf(asks).length > 1) && <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr(step.question)}{id === "faults" && <span style={{ ...muted, fontWeight: 400 }}>{` · ${tr("Suggested")}: ${tr(asks.suggest === "yes" ? "Yes" : "No")}`}</span>}</div>}
      {id === "build" && s.asks ? <Routes facts={facts} asks={asks} guide={guide} store={store} env={env} /> : <Rows rows={asks.rows} env={env} />}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {id === "area" && s.asks && <Door act="settings" arg={{ asks }} env={env} primary />}
        {id === "area" && asks.terrain && <Door act="terrain" env={env} />}
        {s.to && <Door act={s.to} env={env} primary />}{/* a waiting step that step 6 does without (assays only, #4037) */}
        {["data", "rocks", "faults"].includes(id) && asks.act && <Door act={asks.act} arg={asks} env={env} primary />}
        {id === "faults" && asks.stack && <Door act="stack-faults" env={env} />}
        {id === "check" && s.asks && (<><Door act="draw-section" env={env} primary /><Door act="layout" env={env} /></>)}
      </div>
      {next.length > 0 && (
        <div role="status" style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--color-border)" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr("Next")}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{next.map((n, i) => <button key={i} type="button" className={i ? "gs-btn gs-btn--sm" : "gs-btn gs-btn--primary gs-btn--sm"} onClick={() => runAct(n.act.id, n.act, env)}>{tr(n.label, n.vars)}</button>)}</div>
        </div>
      )}
      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 6 }}>
        <button type="button" className="gs-btn gs-btn--sm" onClick={() => openHelp("guided-model")}>{tr("Help")}</button>{/* TASKS.csv #4036 */}
        {s.state !== "done" && (s.state !== "skipped" || userSkipped) && <button type="button" className="gs-btn gs-btn--sm" onClick={() => store.setGuideSkipped?.(id, !userSkipped)}>{userSkipped ? tr("Undo") : tr("Skip")}</button>}
      </div>
    </div>
  </>);
}

// step 4: the routes the data allows, the suggested one marked with its reason; the chosen route's doors under the cards
function Routes({ facts, asks, guide, store, env }) {
  const sug = asks.suggest || {}, chosen = asks.route, routes = routesOf(asks);
  const doors = chosen === "map" ? [["mapmodel"]]
    : chosen === "drawn" ? [["explicit", { unit: explicitUnit(facts) }], ["draw-section"]]
    : [...(facts.cover ? [["cover"]] : []), ...(facts.stack.units.length >= 2 || facts.order.steady.length >= 2 ? [["layers", { units: facts.stack.units }]] : []), ...(facts.body ? [["bodies"]] : [])];
  return (<>
    {routes.length > 1 && <div role="radiogroup" aria-label={tr("Compute or draw?")} style={{ display: "grid", gap: 6, marginBottom: 8 }}>
      {routes.map((r) => (
        <button data-btn-own="" key={r} type="button" role="radio" aria-checked={r === chosen} onClick={() => store.setGuideRoute?.(r)}
          style={{ textAlign: "start", padding: "8px 10px", borderRadius: 6, cursor: "pointer", background: "var(--color-bg)", color: "var(--color-text)", border: `${r === chosen ? 2 : 1}px solid ${r === chosen ? "var(--color-tier-basic)" : "var(--color-border)"}` }}>
          <div style={{ fontWeight: 600 }}>{tr(ROUTE_LABELS[r])}{r === sug.route && <span style={{ ...muted, fontWeight: 400, marginInlineStart: 8 }}>{tr("Suggested")}</span>}</div>
          {r === sug.route && sug.reason && <div style={muted}>{sug.reason}</div>}
        </button>
      ))}
    </div>}
    {asks.returns && <div role="note" style={{ color: "var(--color-warn-text-strong)", fontSize: "var(--font-size-sm)", marginBottom: 8 }}>{asks.returns}</div>}
    {guide.route || sug.route ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{doors.map(([act, arg], i) => <Door key={act} act={act} arg={arg} env={env} primary={!i} />)}</div> : null}
  </>);
}
