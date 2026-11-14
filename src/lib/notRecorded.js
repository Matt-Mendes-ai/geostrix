// TASKS.csv #3267 (review #3195, Galore Creek) — a code that means 'not recorded' (NR, not logged, unknown) is not a logged observation:
// an indicator counted Galore's 18 'NR' alteration rows as 'not potassic' (a 0 that closes a halo) while a blank row is unknown. True for
// those codes, case and spacing aside. 'No High-T Assemblage' and the like are observations (a true zero) and stay out of it.
const NOT_RECORDED = /^(nr|n\/r|n\.r\.?|not recorded|not logged|nl|n\/l|unknown|unk|no data|\?+)$/i;
export const isNotRecorded = (v) => v != null && NOT_RECORDED.test(String(v).trim().replace(/\s+/g, " "));
