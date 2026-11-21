// TASKS.csv #3955 (follow-up: the startup budget, Main) — the always-mounted half of "Collar elevations from the terrain": it only watches for the two
// triggers (Data QC's request, and a terrain that arrives while assumed-elevation collars exist) and loads the dialog, the offer card and the planner
// (CollarZFromTerrain.jsx, lib/collarFromTerrain.js) the first time one of them fires. Mounted once in App.jsx.
import React, { Suspense, useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store.jsx";
import { onCollarZRequest } from "../lib/collarTerrainRequests.js";

const Panel = React.lazy(() => import("./CollarZFromTerrain.jsx"));
const terrainKey = (t) => (t ? `${t.name || ""}|${(t.bbox || []).join(",")}|${t.gridW || ""}x${t.gridH || ""}` : "");
// the collars whose elevation is a guess made at import (the median or 0 m): the same rule as lib/collarFromTerrain.js needsTerrainZ, counted here without loading it
const assumedCount = (collars) => { let n = 0; for (const c of collars || []) if (c && c.hole_id != null && Number.isFinite(c.x) && Number.isFinite(c.y) && (c.zAssumed === "median" || c.zAssumed === "zero" || !Number.isFinite(c.z))) n++; return n; };

export default function CollarZGate() {
  const { collars, terrain, projectLoading } = useStore();
  const [open, setOpen] = useState(false);
  const [offer, setOffer] = useState(null); // { name, n } | { result }
  useEffect(() => onCollarZRequest(() => setOpen(true)), []);
  // a terrain arrives while assumed-elevation collars exist: offered once per terrain; a project coming forward (a file opened, a tab switched) is not "arriving"
  const key = terrainKey(terrain), seen = useRef(key);
  useEffect(() => {
    if (projectLoading) { seen.current = key; setOffer(null); return; }
    if (!key || key === seen.current) return;
    seen.current = key;
    const n = assumedCount(collars);
    if (n) setOffer({ n, name: terrain?.name || "DEM" });
  }, [key, projectLoading]);
  if (!open && !offer) return null;
  return <Suspense fallback={null}><Panel open={open} setOpen={setOpen} offer={offer} setOffer={setOffer} /></Suspense>;
}
