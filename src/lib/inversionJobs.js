// TASKS.csv #321 — the one running SimPEG job, held at MODULE level rather than in a component's state.
// An inversion can take minutes; if its polling loop lived in the Geophysics panel, switching tabs (which
// unmounts or hides the panel) would orphan the job — still computing in the sidecar, with nobody left to
// collect the result or offer Cancel (software-design review, #321). Here it survives any UI change, and it
// drives the status bar's progress chip through the store's stable setter.
import { sidecarStartPotentialJob, sidecarJobStatus, sidecarJobResult, sidecarCancelJob } from "./desktop.js";

let current = null; // { id, request, meta, status, result, error, onDone }
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(current));

export function subscribeInversionJob(fn) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}
export const currentInversionJob = () => current;

// meta: { label, surveyName, ... } — carried to onDone so the caller can build provenance.
// setTaskProgress: the store's stable status-bar setter. onDone(result, job) runs once on success.
export async function startInversionJob(request, meta, { setTaskProgress, onDone }) {
  if (current && current.status?.state === "running") return { ok: false, error: "An inversion is already running." };
  const res = await sidecarStartPotentialJob(request);
  if (!res.ok) return res;
  current = { id: res.data.id, request, meta, plan: res.data.plan, status: { state: "running", progress: { stage: "starting" }, history: [] }, result: null, error: null, startedAt: Date.now() };
  emit();
  poll(current, setTaskProgress, onDone);
  return { ok: true, id: current.id };
}

export async function cancelInversionJob() {
  if (!current || current.status?.state !== "running") return;
  await sidecarCancelJob(current.id);
}

const STAGE_TEXT = {
  starting: "Starting", loading: "Loading SimPEG", mesh: "Building the mesh", sensitivities: "Computing sensitivities",
  iterating: "Iterating", forward: "Forward modelling",
};

async function poll(job, setTaskProgress, onDone) {
  let misses = 0;
  while (current === job) {
    const st = await sidecarJobStatus(job.id);
    if (current !== job) return;
    if (!st.ok) {
      if (++misses >= 5) { job.status = { ...job.status, state: "failed" }; job.error = st.error; setTaskProgress?.(null); emit(); return; }
    } else {
      misses = 0;
      job.status = st.data;
      const p = st.data.progress || {};
      // Real progress only (UX review): an iteration count and misfit, never an invented percentage.
      const stage = STAGE_TEXT[p.stage] || "Working";
      const label = p.stage === "iterating" && p.iter
        ? `${job.meta.label}: iteration ${p.iter}/${p.maxIter}${p.phi_d ? ` — misfit ${(p.phi_d / p.target).toFixed(2)}x target` : ""}`
        : p.stage === "forward" && p.iter ? `${job.meta.label}: model ${p.iter}/${p.maxIter}` : `${job.meta.label}: ${stage}…`;
      const pct = p.iter && p.maxIter ? Math.min(99, Math.round((100 * p.iter) / p.maxIter)) : null;
      setTaskProgress?.({ label, pct: pct ?? 5, indeterminate: pct == null, onCancel: () => cancelInversionJob() });
      if (st.data.state !== "running") {
        setTaskProgress?.(null);
        if (st.data.state === "done") {
          const r = await sidecarJobResult(job.id);
          if (current !== job) return;
          if (r.ok) { job.result = r.data; try { onDone?.(r.data, job); } catch (e) { job.error = `Result could not be added: ${e.message}`; } }
          else job.error = r.error;
        } else if (st.data.state === "failed") {
          job.error = st.data.error || "The job failed.";
        }
        emit();
        return;
      }
      emit();
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
