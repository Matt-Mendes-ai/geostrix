// TASKS.csv #3497 (from #3082 item 2) — a variable that is not a metal: Estimation's result lines said 'the estimated metal' for SiO2, a
// density log, LOI. A log (not an assay element) is always a value; of the assay elements, the oxides of the gangue, the volatiles and the
// physical properties. Fe, Mn and the other ore metals stay metals (an iron ore's grade is its metal).
const NON_METAL = /^(SiO2|Al2O3|CaO|MgO|K2O|Na2O|TiO2|P2O5|Cr2O3|BaO|SrO|LOI|H2O|H2O\+|H2O-|moisture|Cl|F|S|C|P|SG|density|specific[ _]?gravity|bulk[ _]?density|gamma|MagSus|susceptibility|RQD|recovery)$/i;
export const isNonMetal = (symbol, { fromLog = false } = {}) => !!fromLog || NON_METAL.test(String(symbol || "").trim());
