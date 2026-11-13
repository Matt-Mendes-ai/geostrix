// TASKS.csv #2285 (review #2174, WA gold) — Dump / stockpile kept no list of its dumps: every run added a generated surface ('(2)', '(3)')
// with no show / hide, edit or remove in the pane, unlike Pit shell (#1498). The dumps are listed in the pane: an eye, Edit (the run's
// inputs back in the form; the next run replaces that dump) and remove.
import React from "react";
import { Eye, EyeOff, Pencil, Trash2, Maximize2 } from "../../components/icons.js"; // Maximize2: #2996
import { activateOnKey } from "../../lib/a11y.js";
import { t as tr } from "../../lib/i18n.js";

const rowStyle = { display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", borderBottom: "1px solid var(--color-divider)", fontSize: "var(--font-size-sm)" };
const icon = (on) => ({ cursor: "pointer", color: on ? "var(--color-accent)" : "var(--color-text-secondary)", flexShrink: 0 });

// dumps: the generated surfaces of type "dump"; editingId: the dump whose inputs are in the form (or null)
export default function DumpRunList({ dumps, editingId, onToggle, onEdit, onRemove, onZoomTo = null }) { // onZoomTo: #2996
  if (!dumps.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div className="ge-section-label">{tr("Dumps ({n})", { n: dumps.length })}</div>
      {dumps.map((s) => (
        <div key={s.id} style={rowStyle}>
          {onToggle && <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onToggle(s.id)} aria-label={s.visible !== false ? tr("Hide \"{name}\"", { name: s.name }) : tr("Show \"{name}\"", { name: s.name })} style={icon(s.visible !== false)}>{s.visible !== false ? <Eye size={13} /> : <EyeOff size={13} />}</span>}
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: s.id === editingId ? 600 : 400 }} title={s.name}>{s.name}</span>
          {onZoomTo && <Maximize2 size={13} role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onZoomTo(s.id)} aria-label={tr("Zoom to \"{name}\"", { name: s.name })} style={icon(false)} />}{/* #2996 */}
          <Pencil size={13} role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onEdit(s)} aria-label={tr("Edit \"{name}\": its inputs back in the form; the next run replaces it", { name: s.name })} style={icon(s.id === editingId)} />
          {onRemove && <Trash2 size={13} role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onRemove(s)} aria-label={tr("Remove \"{name}\"", { name: s.name })} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} />}
        </div>
      ))}
    </div>
  );
}
