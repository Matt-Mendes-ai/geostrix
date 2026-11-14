// TASKS.csv #3061 — a one-entry cache for a dialog's run steps: the last answer is kept while its inputs are the same values / the same
// objects (Object.is on each), so pressing Compute again with only the lag or the direction changed does not composite and place every
// sample again. One entry: a changed input replaces it (nothing piles up). Pure: no React.
export function makeRunCache() {
  let deps = null, value;
  const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  return {
    // -> { value, hit }
    get(nextDeps, compute) {
      if (deps && same(deps, nextDeps)) return { value, hit: true };
      value = compute(); deps = nextDeps.slice();
      return { value, hit: false };
    },
    // TASKS.csv #3111 — the same, for a compute that awaits (compositing in slices); deps are taken when the value lands
    async getAsync(nextDeps, compute) {
      if (deps && same(deps, nextDeps)) return { value, hit: true };
      const v = await compute();
      value = v; deps = nextDeps.slice();
      return { value, hit: false };
    },
    clear() { deps = null; value = undefined; },
  };
}
