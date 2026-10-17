// Projected Levenberg-Marquardt inside a box (tools/hand-rig/hand_shape.py's fit): a variable on a
// wall that the gradient pushes out stays there for the step.

const STEP = 0.05;
const ITERS = 300;

const dot = (a: readonly number[], b: readonly number[]) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
};

/** Solves A x = b by Gaussian elimination with partial pivoting (A is small and square). */
export function solveLinear(A: readonly (readonly number[])[], b: readonly number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i] ?? 0]);
  const row = (i: number) => M[i] as number[];
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(row(r)[c] ?? 0) > Math.abs(row(p)[c] ?? 0)) p = r;
    [M[c], M[p]] = [row(p), row(c)];
    const pivot = row(c)[c] ?? 0;
    for (let r = c + 1; r < n; r++) {
      const f = (row(r)[c] ?? 0) / pivot;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) row(r)[k] = (row(r)[k] ?? 0) - f * (row(c)[k] ?? 0);
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = row(r)[n] ?? 0;
    for (let k = r + 1; k < n; k++) s -= (row(r)[k] ?? 0) * (x[k] ?? 0);
    x[r] = s / (row(r)[r] ?? 1);
  }
  return x;
}

/**
 * Minimises |fun(x)|² over the box [lo, hi] from x0; `active` marks the variables that may move.
 * Returns the best x and its residuals.
 */
export function fit(
  x0: readonly number[],
  lo: readonly number[],
  hi: readonly number[],
  fun: (x: readonly number[]) => readonly number[],
  active: readonly boolean[] = x0.map(() => true)
): { x: number[]; r: readonly number[] } {
  const n = x0.length;
  const low = (i: number) => lo[i] ?? -Infinity;
  const high = (i: number) => hi[i] ?? Infinity;
  let x = x0.map((v, i) => Math.min(Math.max(v, low(i)), high(i)));
  let r = fun(x);
  let cost = dot(r, r);
  let lam = 1e-3;
  for (let iter = 0; iter < ITERS; iter++) {
    // Jacobian columns of the active variables; the others stay zero.
    const J: number[][] = r.map(() => new Array<number>(n).fill(0));
    for (let i = 0; i < n; i++) {
      if (!active[i]) continue;
      const xi = x[i] ?? 0;
      const xp = [...x];
      xp[i] = xi + STEP <= high(i) ? xi + STEP : xi - STEP;
      const h = (xp[i] ?? 0) - xi;
      const rp = fun(xp);
      for (let k = 0; k < r.length; k++) (J[k] as number[])[i] = ((rp[k] ?? 0) - (r[k] ?? 0)) / h;
    }
    const g = Array.from({ length: n }, (_, i) => J.reduce((s, row, k) => s + (row[i] ?? 0) * (r[k] ?? 0), 0));
    const free: number[] = [];
    for (let i = 0; i < n; i++) {
      const xi = x[i] ?? 0;
      const gi = g[i] ?? 0;
      const pinned = (xi <= low(i) + 1e-9 && gi > 0) || (xi >= high(i) - 1e-9 && gi < 0);
      if (active[i] && !pinned) free.push(i);
    }
    // No free variable: the step never lowers the cost and the loop below would give up anyway.
    if (free.length === 0) return { x, r };
    const A = free.map((i) => free.map((j) => J.reduce((s, row) => s + (row[i] ?? 0) * (row[j] ?? 0), 0)));
    const b = free.map((i) => -J.reduce((s, row, k) => s + (row[i] ?? 0) * (r[k] ?? 0), 0));
    let xn: number[];
    let rn: readonly number[];
    let cn: number;
    for (;;) {
      const damped = A.map((row, a) => row.map((v, c) => (a === c ? v + lam * (v + 1e-6) : v)));
      const dx = solveLinear(damped, b);
      xn = [...x];
      free.forEach((i, a) => {
        xn[i] = Math.min(Math.max((x[i] ?? 0) + (dx[a] ?? 0), low(i)), high(i));
      });
      rn = fun(xn);
      cn = dot(rn, rn);
      if (cn < cost) break;
      lam *= 4;
      if (lam > 1e8) return { x, r };
    }
    const done = cost - cn < 1e-6 * cost;
    x = xn;
    r = rn;
    cost = cn;
    lam = Math.max(lam / 3, 1e-7);
    if (done) break;
  }
  return { x, r };
}
