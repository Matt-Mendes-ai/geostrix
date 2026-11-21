// TASKS.csv #3935 — adding, deleting or switching a Layout page used to clear the whole undo history (store addLayoutPages, #130), so after a
// one-click sheet, an atlas, a Best intercepts page or an AI app's page, Ctrl+Z could not take back anything done before it. Page changes are
// now ordinary undo steps. The history keeps the pages list itself (#463): a step holds references to the same page objects and their
// pictures, never copies, so a page with big images costs nothing more for being in it.
//
// Which page the Layout shows once an Undo or Redo has put `targetPages` back, so the change is in front of the user:
//  - a page the step brings back (an undone delete, a redone add): that page;
//  - else the page the step was made on (stepPageId), when it still exists;
//  - else the page now shown, when it still exists (an undone add whose page was shown: back to the one before);
//  - else the first page.
// A data credit the store adds to a page after the page was made (the credit's code arrived after it, store creditLater) is a system refresh, not
// the user's work: it is never an undo step of its own, and it is written into every step of the history that holds the page, so no Undo or Redo
// can put that page back without it (the credit is required on the pages of the licensed and CC BY samples). `steps` are the history's snapshots
// ({ layoutPages, ... }), changed in place (the WeakMaps that name them keep working); credit(page) -> the page with its credit (the same page when
// it prints one already). -> how many steps were changed.
export function creditIntoSteps(steps, ids, credit) {
  const want = new Set(ids || []);
  let n = 0;
  for (const st of new Set(steps || [])) {
    if (!st || !Array.isArray(st.layoutPages) || !st.layoutPages.some((p) => want.has(p?.id))) continue;
    st.layoutPages = st.layoutPages.map((p) => (want.has(p?.id) ? credit(p) || p : p));
    n++;
  }
  return n;
}

export function pageAfterUndo(curPages, targetPages, activeId, stepPageId) {
  const target = Array.isArray(targetPages) ? targetPages : [];
  if (!target.length) return activeId;
  const now = new Set((Array.isArray(curPages) ? curPages : []).map((p) => p?.id));
  const back = target.find((p) => p && !now.has(p.id));
  if (back) return back.id;
  const has = (id) => id != null && target.some((p) => p?.id === id);
  if (has(stepPageId)) return stepPageId;
  if (has(activeId)) return activeId;
  return target[0].id;
}
