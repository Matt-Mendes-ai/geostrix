// TASKS.csv #2104 (review #2013, Woodjam) — the planned-hole form's collar list and the As-drilled list were selects of every collar in import
// order (545 entries on Woodjam) with no search: sorted by hole id (numbers in order: DH-2 before DH-10) and, over 20 collars, a filter box
// above. The chosen collar stays in the list while the filter hides the others.
import React, { useMemo, useState } from "react";
import { t as tr } from "../lib/i18n.js";

import { sortHoleIds, filterHoleIds } from "../lib/holeIdList.js";

// ids: the hole ids offered; value / onChange(id) as a select's; first: the empty option's text; style: the select's style
export default function CollarPicker({ ids, value, onChange, first, style, ariaLabel, title }) {
  const [q, setQ] = useState("");
  const sorted = useMemo(() => sortHoleIds(ids || []), [ids]);
  const shown = useMemo(() => filterHoleIds(sorted, q, value), [sorted, q, value]);
  return (<>
    {sorted.length > 20 && <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Filter {n} holes…", { n: sorted.length })} aria-label={tr("Filter the hole list")} style={{ ...style, cursor: "text", marginBottom: 3 }} />}
    <select value={value} onChange={(e) => onChange(e.target.value)} style={style} aria-label={ariaLabel} title={title}>
      <option value="">{first}</option>
      {shown.map((id) => <option key={id} value={id}>{id}</option>)}
    </select>
    {q && shown.length <= (value ? 1 : 0) && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4 }}>{tr("No hole id contains \"{q}\".", { q })}</div>}
  </>);
}
