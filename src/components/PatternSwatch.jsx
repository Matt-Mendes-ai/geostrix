// TASKS.csv #1995 — a legend swatch with an FGDC lithology pattern over its colour (Layout's legend rows for a section's or a strip log's
// lithology, which draw the pattern). The tile loads once per code (lithoPatterns' cache); until it has, the plain colour shows.
import React, { useEffect, useState } from "react";
import { loadPatternTiles, patternSwatchUrl } from "../lib/lithoPatterns.js";

export default function PatternSwatch({ code, color, size = 14, style = null }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    loadPatternTiles([Number(code)]).then((t) => { if (live) setUrl(patternSwatchUrl(t[Number(code)], code, color, size)); });
    return () => { live = false; };
  }, [code, color, size]);
  return <span style={{ ...style, background: url ? `${color} url("${url}") center / ${size}px ${size}px` : color }} />;
}
