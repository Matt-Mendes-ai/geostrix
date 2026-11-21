// TASKS.csv #3939 — detail kept behind a closed "More" on an empty card or a pane's intro, as the Help pane does (#3899): the words stay, out of
// the way until asked for.
import React from "react";
import { t as tr } from "../lib/i18n.js";

export default function MoreFold({ children, style, ...rest }) {
  return (
    <details data-more-fold="" {...rest} style={{ marginBottom: 8, ...style }}>
      <summary style={{ cursor: "pointer", color: "var(--color-info)", fontSize: "var(--font-size-sm)" }}>{tr("More")}</summary>
      <div style={{ marginTop: 4 }}>{children}</div>
    </details>
  );
}
