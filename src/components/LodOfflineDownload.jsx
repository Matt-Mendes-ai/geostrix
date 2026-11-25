// TASKS.csv #3252 phase 4 (Matt's decision 1) — 'Download for offline use': a raster's detail tiles down to a chosen pixel size, every level
// from the first finer than the fetched picture, read now and kept on this computer (the 2 GB cache the Maps plan and the 3D View read), so a
// field laptop shows them without signal. Said before: how many tiles and about how much they take against what the cache has left.
import React, { useMemo, useRef, useState } from "react";
import { t as tr } from "../lib/i18n.js";
import { offlinePlan } from "../lib/lodCompose.js";
import { DISK_CAP_BYTES, lodSourceKey, tileKey } from "../lib/lodTiles.js";

const mb = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${Math.max(1, Math.round(b / 1024 ** 2)).toLocaleString()} MB`);

export default function LodOfflineDownload({ rasters, usedBytes = 0, onDone }) {
  const list = (rasters || []).filter((r) => r.lod && r.bbox && r.lod.nativeM > 0);
  const [open, setOpen] = useState(false);
  const [id, setId] = useState(list[0]?.id || "");
  const r = list.find((x) => x.id === id) || list[0];
  const choices = r ? [5, 2, 1, 0.5, 0.3].filter((p) => p >= r.lod.nativeM * 0.99 && (!(r.pixelM > 0) || p < r.pixelM)) : [];
  const [px, setPx] = useState("");
  const pixelM = Number(px) || choices[Math.min(1, choices.length - 1)] || null;
  const plan = useMemo(() => (r && pixelM ? offlinePlan(r, pixelM) : null), [r, pixelM]);
  const [state, setState] = useState(null); // { done, n, got, cancelled, error }
  const cancel = useRef(false);
  if (!list.length) return null;
  const room = DISK_CAP_BYTES * 0.9 - usedBytes;
  const tooBig = plan && plan.bytes > room;
  const run = async () => {
    cancel.current = false;
    const loader = await import("../lib/lodTileLoader.js");
    const src = lodSourceKey(r), tiles = plan.tiles;
    let done = 0, got = 0, next = 0, failed = 0;
    setState({ done, n: tiles.length, got });
    const worker = async () => {
      while (next < tiles.length && !cancel.current) {
        const t = tiles[next++];
        try { if (await loader.storeLodTile(tileKey(src, t.z, t.x, t.y), r.lod, t.box)) got++; } catch { failed++; }
        done++;
        if (done % 8 === 0 || done === tiles.length) setState({ done, n: tiles.length, got, failed });
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    setState({ done, n: tiles.length, got, failed, cancelled: cancel.current, finished: true });
    onDone?.();
  };
  const small = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
  if (!open) return <button data-btn-own="" type="button" onClick={() => setOpen(true)} style={{ ...small, background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: 0 }}>{tr("Download for offline use…")}</button>;
  const busy = state && !state.finished;
  return (
    <div style={{ ...small, display: "flex", flexDirection: "column", gap: 4, width: "100%", marginTop: 4 }}>
      {list.length > 1 && <select value={r.id} onChange={(e) => setId(e.target.value)} disabled={busy} aria-label={tr("Raster to download")}>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>{tr("Down to")}
        <select value={px || String(pixelM || "")} onChange={(e) => setPx(e.target.value)} disabled={busy} aria-label={tr("Offline pixel size")}>{choices.map((p) => <option key={p} value={p}>{tr("{px} m", { px: p })}</option>)}</select>
      </label>
      {plan && <div style={{ color: tooBig ? "var(--color-warn-text)" : undefined }}>{tooBig
        ? tr("{n} tiles, about {size}: more than the {room} the cache has left. Choose a coarser pixel, or Clear the cache.", { n: plan.tiles.length.toLocaleString(), size: mb(plan.bytes), room: mb(Math.max(0, room)) })
        : tr("{n} tiles at {levels} levels, about {size} on this computer.", { n: plan.tiles.length.toLocaleString(), levels: plan.levels.length, size: mb(plan.bytes) })}</div>}
      {state && <div role="status">{state.finished
        ? (state.cancelled ? tr("Stopped: {done} of {n} tiles kept.", { done: state.done.toLocaleString(), n: state.n.toLocaleString() }) : tr("Done: {got} of {n} tiles kept on this computer{failed}.", { got: state.got.toLocaleString(), n: state.n.toLocaleString(), failed: state.failed ? tr(" ({k} could not be read)", { k: state.failed.toLocaleString() }) : "" }))
        : tr("Reading {done} of {n} tiles…", { done: state.done.toLocaleString(), n: state.n.toLocaleString() })}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        {!busy && <button className="gs-btn gs-btn--sm" type="button" onClick={run} disabled={!plan || tooBig || !plan.tiles.length}>{tr("Download")}</button>}
        {busy && <button className="gs-btn gs-btn--sm" type="button" onClick={() => { cancel.current = true; }}>{tr("Stop")}</button>}
        {!busy && <button className="gs-btn gs-btn--sm" type="button" onClick={() => { setOpen(false); setState(null); }}>{tr("Close")}</button>}
      </div>
    </div>
  );
}
