// TASKS.csv #3931 — lib/useImportGate.js's rule, pure (Node tests): whether a file input's 'change' is held while a project loads, and how a
// held one is given again (a fresh 'change' on the same input; false when it is gone).
export function shouldHold(el, loading, released) {
  return !!loading && !released.has(el) && !!el && el.tagName === "INPUT" && el.type === "file" && (el.files?.length || 0) > 0;
}
export function releaseHeld(el, released) {
  if (!el.isConnected) return false;
  released.add(el);
  try { el.dispatchEvent(new Event("change", { bubbles: true })); } finally { released.delete(el); }
  return true;
}

