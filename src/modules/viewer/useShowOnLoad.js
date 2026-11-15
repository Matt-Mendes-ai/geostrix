// TASKS.csv #3588 (1) (Fireweed rehearsal, Macpass) — the sample opened coloured by density only, with no assay switched on and black collar dots at the
// opening range. A sample may name the element to show once its assays have loaded (WA_SAMPLES[..].showFirst): the ref takes the symbol, and when
// the element is in assayElements (the load's state has landed) it is switched on through the sidebar's own toggle, which seeds its classes.
import { useEffect, useRef } from "react";

export function useShowOnLoad(assayElements, toggleAssayElement) {
  const want = useRef(null), toggle = useRef(toggleAssayElement);
  toggle.current = toggleAssayElement;
  useEffect(() => {
    const sym = want.current;
    if (sym && (assayElements || []).some((e) => e.symbol === sym)) { want.current = null; toggle.current(sym); }
  }, [assayElements]);
  return want;
}
