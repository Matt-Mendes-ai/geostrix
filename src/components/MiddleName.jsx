// TASKS.csv #2852 (review GSC geophysics) — rasters of one survey read 'bathurst_megatem…' three times (ten times in the 3D View, 'bathurst_me…'):
// the part that differs (cond / tau / mag_res, '— Tilt derivative') was what the end ellipsis cut. The name's tail stays whole and the
// head is cut instead, and the full name is on hover.
import React from "react";
import { nameTail } from "../lib/middleName.js";

export default function MiddleName({ name, style = null }) {
  const s = String(name ?? ""), tail = nameTail(s), head = tail ? s.slice(0, s.length - tail.length) : s;
  return (
    <span title={s} style={{ flex: 1, minWidth: 0, display: "flex", whiteSpace: "nowrap", ...(style || {}) }}>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{head}</span>
      {tail && <span style={{ flexShrink: 0 }}>{tail}</span>}
    </span>
  );
}
