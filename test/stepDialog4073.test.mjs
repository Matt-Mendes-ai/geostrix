// TASKS.csv #4073 — the shared step shell for pop-ups (components/StepDialog.jsx), #4071's georeferencer its first user: a step bar, ONE step on screen, Back / Cancel and the
// one gold primary, a Help-card slot, a hint and an error. Rendered on the server (no click-through: the walk-through is the live check); source pins for what a render cannot show.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, "..", p), "utf8").replace(/\r\n/g, "\n");
mkdirSync(path.join(here, "..", "node_modules", ".cache"), { recursive: true });
const dir = mkdtempSync(path.join(here, "..", "node_modules", ".cache", "gs-stepdialog4073-"));
const bundle = (entry, name) => { const out = path.join(dir, name); writeFileSync(out, buildSync({ entryPoints: [path.join(here, "..", entry)], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "lucide-react", "papaparse"], logLevel: "silent" }).outputFiles[0].text); return pathToFileURL(out).href; };
process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });
const React = (await import("react")).default, { renderToStaticMarkup } = await import("react-dom/server");
const { default: StepDialog, StepBar, stepDialogStyles } = await import(bundle("src/components/StepDialog.jsx", "sd.mjs"));
const h = React.createElement;
const count = (s, re) => (s.match(re) || []).length;
const steps = [
  { key: "a", label: "Alpha", render: () => h("p", null, "body-a"), primary: { label: "Go on" } },
  { key: "b", label: "Beta", render: () => h("p", null, "body-b"), primary: { label: "Next two", disabled: true }, hint: "Fill in the box." },
  { key: "c", label: "Gamma", render: () => h("p", null, "body-c"), primary: { label: "Do it", onClick: () => {} } },
];
const render = (props) => renderToStaticMarkup(h(StepDialog, { title: "T", onClose: () => {}, steps, at: 0, onAt: () => {}, ...props }));

test("#4073 the step bar and ONE step on screen", () => {
  const s = render({ at: 1 });
  assert.equal(count(s, /role="listitem"/g), 3, "three steps in the bar");
  assert.equal(count(s, /aria-current="step"/g), 1);
  assert.ok(s.includes("body-b") && !s.includes("body-a") && !s.includes("body-c"), "only the shown step is mounted");
  assert.ok(s.includes("✓"), "a finished step is ticked");
  assert.ok(s.includes('data-step-dialog') && s.includes('role="dialog"') && s.includes('aria-modal="true"'));
});

test("#4073 the footer: Cancel on the first step, Back after, and ONE gold primary whose label and state belong to the step", () => {
  const first = render({ at: 0 }), mid = render({ at: 1 });
  assert.ok(first.includes(">Cancel<") && !first.includes(">Back<"));
  assert.ok(mid.includes(">Back<") && !mid.includes(">Cancel<"));
  for (const s of [first, mid, render({ at: 2 })]) assert.equal(count(s, /gs-btn--primary/g), 1);
  assert.ok(first.includes(">Go on<"));
  assert.match(mid, /<button[^>]*gs-btn--primary[^>]*disabled=""[^>]*>Next two</, "a step can hold its primary back");
  assert.ok(render({ at: 2 }).includes(">Do it<"));
});

test("#4073 the hint says what is missing; an error says what went wrong; the Help card only when there is help", () => {
  assert.ok(render({ at: 1 }).includes("Fill in the box.") && !render({ at: 0 }).includes("Fill in the box."));
  const e = render({ at: 0, error: "That failed: try again." });
  assert.ok(e.includes('role="alert"') && e.includes("That failed: try again."));
  assert.ok(!render({}).includes('aria-label="Help"'), "no help, no ? button");
  assert.ok(render({ help: h("details", { open: true }, h("summary", null, "How"), h("b", null, "long text")) }).includes('aria-label="Help"'));
  assert.ok(!render({ help: h("details", { open: true }, h("summary", null, "How"), h("b", null, "long text")) }).includes("long text"), "the card is closed until the ? is pressed");
});

test("#4073 a dialog of one step has no bar: Cancel and the primary", () => {
  const s = render({ steps: [steps[2]], at: 0 });
  assert.ok(!s.includes('role="list"') && s.includes(">Cancel<") && s.includes(">Do it<"));
  assert.equal(count(s, /gs-btn--primary/g), 1);
  const bar = renderToStaticMarkup(h(StepBar, { steps, at: 2, onAt: () => {}, label: "Steps" }));
  assert.equal(count(bar, /✓/g), 2);
  assert.ok(stepDialogStyles.body && stepDialogStyles.warn && stepDialogStyles.error && stepDialogStyles.label && stepDialogStyles.note);
});

test("#4073 the shell owns Esc (Help first, then the dialog), the focus trap and the dialog role; StepPane's parts are the family", () => {
  const d = read("src/components/StepDialog.jsx");
  assert.ok(d.includes("useEscapeKey(() => (helpOpen ? setHelpOpen(false) : onClose()))") && d.includes("useFocusTrap()"));
  assert.ok(d.includes("{help}") && d.includes('role="alert"'));
  assert.ok(d.includes("var(--btn-primary-bg)") && d.includes("gs-btn gs-btn--primary"), "the gold of StepPane's current pill and of #4069's primary");
  assert.equal(count(d, /gs-btn--primary/g) >= 1, true);
  assert.match(read("src/components/StepPane.jsx"), /export default function StepPane/);
});

test("#4073 #4071's georeferencer is the first user: its three steps, no shell of its own", async () => {
  const m = read("src/components/SectionGeorefModal.jsx");
  assert.ok(m.includes('import StepDialog, { stepDialogStyles } from "./StepDialog.jsx"') && m.includes("<StepDialog title={title}"));
  assert.ok(!m.includes("useFocusTrap") && !m.includes("overlay") && !m.includes("gs-btn--primary"), "the shell's parts live in StepDialog");
  for (const k of ['key: "figure"', 'key: "points"', 'key: "place"', 'key: "move"']) assert.ok(m.includes(k), k);
  // rendered as the shell renders it: the first step, with nothing loaded yet
  const { default: Modal } = await import(bundle("src/components/SectionGeorefModal.jsx", "modal.mjs"));
  const s = renderToStaticMarkup(h(Modal, { sections: [], collars: [], images: [], onImport: () => {}, onClose: () => {} }));
  assert.equal(count(s, /role="listitem"/g), 3);
  assert.ok(s.includes("Drop a PDF, PNG or JPG") && s.includes(">Next: points<") && s.includes(">Cancel<"));
  assert.equal(count(s, /gs-btn--primary/g), 1);
  const mv = renderToStaticMarkup(h(Modal, { sections: [{ id: "s", name: "L1", ax: 0, ay: 0, bx: 100, by: 0 }], collars: [], images: [], moveImage: { id: "i", name: "Fig", corners: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]] }, onClose: () => {}, onMove: () => {} }));
  assert.ok(!mv.includes('role="list"') && mv.includes(">Move<"), "Move to another line: one screen");
});
