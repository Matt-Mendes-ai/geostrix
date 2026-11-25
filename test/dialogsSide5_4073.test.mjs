// TASKS.csv #4073 — six pop-ups as StepDialog steps (Matt: "I like the way the cross section pop up window was restyled. We should do similar for all
// pop up windows"): AI App Access, the alteration box plot, the columns to read, Report a problem, Connect to database, Generate atlas. Each is a
// StepDialog with its steps and a Help card, its protective lines kept seen first, and every control and action it had is still in it. Pure: reads the source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../src/components/${f}.jsx`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const missing = (s, list) => list.filter((k) => !s.includes(k));
const keys = (s) => [...s.matchAll(/\{ key: "([a-z]+)", label: tr\(/g)].map((m) => m[1]);

const D = {
  AiAccessModal: { steps: ["access", "connect", "activity"], reach: ["flip(e.target.checked)", "setRemember(", "mcpSetEnabled(true, e.target.checked)", "mcpSetChanges(e.target.checked)", "onClick={copy}",
    "mcpStop()", "mcpForgetClients()", "c.undo()", "act.slice().reverse()"], seen: ["What it reads goes to the AI app's provider"] },
  AlterationBoxModal: { steps: ["protolith", "boxes"], reach: ["setSource(", "setFitCodes(", "setMap(", "setTrendRoles(", "setBoxes(PROVISIONAL_ALTERATION_BOXES)", "setLimit(p, axis, i, v)",
    "onRun({ boxes, map, source, fitCodes, trendRoles })"], seen: ["Screening only: the protolith is assumed, not measured.", "Provisional limits: not yet checked against Large et al. (2001)."] },
  TableColumnsModal: { steps: ["columns", "rows", "read"], reach: ["setQ(", "setKeep((s) => new Set([...s, ...shown]))", "toggle(h)", "setRowsBy(", "setHoleCol(", "on: e.target.checked", "lengthM:", "from: e.target.value",
    "to: e.target.value", "onDone(true)", "onDone({ keep:"], seen: [] },
  ReportProblemModal: { steps: ["describe", "include", "send"], reach: ["setWhat(", "setSteps(", "setIncludeShot(", "setIncludeLog(", "setIncludeProject(", "setFiles(", "onClick: build", "showReportFile(done.path)",
    "emailSupport(", "github.com/Matt-Mendes-ai/geostrix/issues/new"], seen: ["The current project", "Nothing is sent without you."] },
  DatabaseConnectModal: { steps: ["connect", "data", "preview"], reach: ["loadSaved(", 'set("name"', "setEngine(", 'set("host"', 'set("port"', 'set("database"', 'set("user"', 'set("password"', "forgetPassword",
    'set("rememberPassword"', 'set("ssl"', 'set("sslInsecure"', "onClick={test}", "pickTable(t)", "setSql(", "removeQuery(", "onClick={run}", "setSavePromptOpen(true)", "onClick: useResults"],
    seen: ["Read-only guard, not a security boundary", "Trust a self-signed / unverified certificate (insecure", "never in the project file"] },
  GenerateAtlasModal: { steps: ["pages", "items"], reach: ["switchMode(", "setCentreMaps(", "setIncludeStripLog(", "setLithoPatterns(", "setCustomSel(", "setAssaySymbols(", "setSelectedIds(new Set(items.map(itemKey)))",
    "setSelectedIds(new Set())", "setHoleFilter(", "toggle(key)", "onClick: generate"], seen: ["To put a section's drawing on a page"] },
};

for (const [f, d] of Object.entries(D)) {
  test(`${f}: a StepDialog (${d.steps.join(", ")}), a Help card, and everything it had`, () => {
    const s = read(f);
    assert.match(s, /import StepDialog from "\.\/StepDialog\.jsx";/);
    assert.match(s, /return <StepDialog title=\{/);
    assert.match(s, /const help = \(\n\s*<details open>/, "the long explanations in the Help card (folded for the word count)");
    for (const k of d.steps) assert.ok(keys(s).includes(k), `step ${k}`);
    assert.deepEqual(missing(s, d.reach), [], "every control and action is still reachable");
    assert.deepEqual(missing(s, d.seen), [], "the protective lines stay seen first");
    assert.ok(!/useEscapeKey\(|useFocusTrap\(/.test(s), "Escape and the focus trap are StepDialog's");
  });
}
