// TASKS.csv #4070 — the 3D Modelling panes moved out of ModellingPanes.jsx into src/modules/viewer/panes/<Name>Pane.jsx (one file each). The source pins that
// read ModellingPanes.jsx read this instead: ModellingPanes.jsx with each `{toolPane === "x" && <XPane … />}` line replaced by that pane's own block
// (as it stands in its file), then each pane file's imports and its own declarations. So a pin finds the pane's code where it now lives, in the
// order it had, and once a pane is rewritten its pins follow it.
import { readFileSync, readdirSync } from "node:fs";

const dir = new URL("../../src/modules/viewer/", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, dir), "utf8");

export function paneFiles() {
  return readdirSync(new URL("panes/", dir)).filter((f) => /Pane\.jsx$/.test(f)).sort();
}

export function modellingPanesSource() {
  const main = read("ModellingPanes.jsx").replace(/\r\n/g, "\n"); // LF, as CI's checkout has it
  const parts = {}, heads = [];
  for (const f of paneFiles()) {
    const s = read(`panes/${f}`).replace(/\r\n/g, "\n");
    const name = f.replace(/\.jsx$/, "");
    const at = s.indexOf(`export default function ${name}(`);
    const open = s.indexOf("  return (<>\n", at), close = s.lastIndexOf("\n  </>);\n}");
    parts[name] = open > 0 && close > open ? s.slice(open + "  return (<>\n".length, close) : s.slice(at); // a pane rewritten another way: its whole component
    heads.push(s.slice(0, at));
  }
  const body = main.replace(/\{toolPane === "[A-Za-z]+" && <([A-Za-z]+Pane) \{\.\.\.\{[^}]*\}\} \/>\}/g, (m, name) => (parts[name] != null ? parts[name] : m));
  return `${body}\n${heads.join("\n")}`;
}
