// TASKS.csv #4070 (side 2) — StepPane's message slot: what the last action said sits under the step bar, inside the step, not above the bar where a long
// note pushed the steps down (the survey pane after a grid). A string is a note; { text, level } takes the error / warn / info look; a node is kept as given.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-stepmsg4070-"));
process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });
const out = path.join(dir, "steppane.mjs");
writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", "src/components/StepPane.jsx")], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic",
  external: ["react", "react-dom", "react/jsx-runtime"], loader: { ".js": "jsx" } }).outputFiles[0].text);
const { default: StepPane } = await import(pathToFileURL(out).href);
const React = (await import("react")).default, { renderToStaticMarkup } = await import("react-dom/server");
const h = React.createElement;
const steps = [{ key: "a", label: "A", question: "First?", body: h("p", null, "body a") }, { key: "b", label: "B", body: h("p", null, "body b") }];
const render = (message) => renderToStaticMarkup(h(StepPane, { id: `msg-${Math.random()}`, label: "Pane", steps, message }));

test("#4070 the message sits after the step bar and before the step's question", () => {
  const s = render("Gridded 24,927 points at 100 m.");
  const bar = s.indexOf('role="tablist"'), msg = s.indexOf("data-step-message"), q = s.indexOf("First?");
  assert.ok(bar >= 0 && msg > bar && q > msg, "bar, then the message, then the step");
  assert.match(s, /data-step-message="" role="status"[^>]*>Gridded 24,927 points at 100 m\.<\/div>/);
});

test("#4070 { text, level } takes the error and warn looks; a node is kept; nothing given renders nothing", () => {
  assert.match(render({ text: "The clip failed.", level: "error" }), /role="alert" style="[^"]*var\(--color-danger-bg\)[^"]*">The clip failed\./);
  assert.match(render({ text: "Check the unit.", level: "warn" }), /role="status" style="[^"]*var\(--color-warn-bg\)/);
  assert.match(render(h("button", { type: "button" }, "Import as a block model")), /data-step-message=""[^>]*><button type="button">Import as a block model<\/button>/);
  for (const none of [null, "", false]) assert.ok(!render(none).includes("data-step-message"));
});

test("#4070 the survey pane and the DC / IP line use the slot", () => {
  const read = (p) => readFileSync(path.join(here, "..", p), "utf8").replace(/\r\n/g, "\n");
  assert.match(read("src/modules/GeophysicsModule.jsx"), /<StepPane id="points" label=\{tr\("Point survey"\)\}\n\s+message=\{xyzError \|\| error \? <>/);
  assert.match(read("src/components/DcipPanel.jsx"), /message=\{msg \|\| job\?\.error \? <>/);
});
