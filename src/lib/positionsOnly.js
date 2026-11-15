// TASKS.csv #3447 — a point file with no measured value (an electrode list, a station list): the picker's "none: positions only" for Value. Every point
// then carries the value 0 so every reader of the survey layer keeps working, the survey's own record says positionsOnly (its card, its legend and the
// inversion's survey list read it), and it is drawn in one colour. Pure.
export const NO_VALUE = "__positions_only__";

// the picked file's rows with the value column added (0) when Value is "none"; otherwise the rows as they are
export const withPositionsValue = (rows, valueCol) => (valueCol === NO_VALUE ? (rows || []).map((r) => ({ ...r, [NO_VALUE]: 0 })) : rows);
