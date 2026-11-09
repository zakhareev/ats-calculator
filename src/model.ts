export type Poly = [number, number, number, number];
export type Quad = [number, number, number];

export interface FuncMeta { target: number; arg: number }

export interface Params {
  x0: number[];
  factors: Quad[];
  normalizeFactors: boolean;
  scale: number[];
  extra: number[];
  coef: Poly[];
  years: number;
  substeps: number;
  clamp: boolean;
}

export interface Solution {
  rows: number[][];
  times: number[];
  factors: number[][];
}

export const N_VARS = 10;
export const N_FACTORS = 5;
export const N_FUNCS = 36;

export const FUNCS: readonly FuncMeta[] = [
  { target: 0, arg: 1 }, { target: 0, arg: 2 }, { target: 0, arg: 6 }, { target: 0, arg: 7 }, { target: 0, arg: 8 },
  { target: 1, arg: 0 }, { target: 1, arg: 5 }, { target: 1, arg: 3 }, { target: 1, arg: 6 },
  { target: 2, arg: 0 }, { target: 2, arg: 4 }, { target: 2, arg: 9 }, { target: 2, arg: 7 },
  { target: 3, arg: 0 },
  { target: 4, arg: 2 }, { target: 4, arg: 9 }, { target: 4, arg: 7 },
  { target: 5, arg: 1 }, { target: 5, arg: 9 }, { target: 5, arg: 6 }, { target: 5, arg: 8 },
  { target: 6, arg: 3 }, { target: 6, arg: 5 }, { target: 6, arg: 8 }, { target: 6, arg: 9 },
  { target: 7, arg: 0 }, { target: 7, arg: 2 }, { target: 7, arg: 4 }, { target: 7, arg: 9 },
  { target: 8, arg: 0 }, { target: 8, arg: 5 }, { target: 8, arg: 9 },
  { target: 9, arg: 4 }, { target: 9, arg: 5 }, { target: 9, arg: 7 }, { target: 9, arg: 8 }
];

export const DEFAULT_FACTORS: readonly Quad[] = [
  [0.41, 0.26, 0.33],
  [87, -4, -16],
  [29, 100, -55],
  [-5, 6, 0],
  [21, 17, -3]
];

export const DEFAULT_POLY: Poly = [0.3, 0.4, 0, 0];

export const DEFAULT_X0: readonly number[] = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];

export function defaults(): Params {
  return {
    x0: [...DEFAULT_X0],
    factors: DEFAULT_FACTORS.map((q) => [...q] as Quad),
    normalizeFactors: true,
    scale: [1, 1, 1, 1, 1],
    extra: new Array(N_VARS).fill(0),
    coef: Array.from({ length: N_FUNCS }, () => [...DEFAULT_POLY] as Poly),
    years: 10,
    substeps: 10,
    clamp: true
  };
}

export function evalPoly(c: readonly number[], x: number): number {
  return c[0] + x * (c[1] + x * ((c[2] ?? 0) + x * (c[3] ?? 0)));
}

export function factorNorms(p: Params): number[] {
  const out: number[] = [];
  for (let j = 0; j < N_FACTORS; j++) {
    let m = 0;
    for (let i = 0; i <= 1000; i++) m = Math.max(m, Math.abs(evalPoly(p.factors[j], i / 1000)));
    out.push(m > 0 ? m : 1);
  }
  return out;
}

export function factorsAt(p: Params, t: number, norms: number[] = factorNorms(p)): number[] {
  return p.factors.map((q, j) => (evalPoly(q, t) / (p.normalizeFactors ? norms[j] : 1)) * p.scale[j]);
}

export function makeRhs(p: Params): (t: number, X: number[]) => number[] {
  const norms = factorNorms(p);
  return (t, X) => {
    const f = (k: number): number => evalPoly(p.coef[k - 1], X[FUNCS[k - 1].arg]);
    const [Price, For, Dol, Covid, Law] = factorsAt(p, t, norms);
    const d = [
      (Price + For + Dol) * f(1) * f(2) - (Covid + Law) * f(3) * f(4) * f(5),
      Dol * f(6) * f(7) - f(8) * f(9),
      For * f(10) * f(11) * f(12) - Law * f(13),
      -(Price + Dol + Covid) * f(14),
      For * f(15) * f(16) - Law * f(17),
      Price * f(18) * f(19) - Law * f(20) * f(21),
      Law * f(22) * f(23) * f(24) * f(25) - (Price + Dol + Covid),
      Law - Covid * f(26) * f(27) * f(28) * f(29),
      Law - f(30) * f(31) * f(32),
      Price * f(33) * f(34) - f(35) * f(36)
    ];
    return d.map((v, i) => v + p.extra[i]);
  };
}

const axpy = (a: number[], b: number[], k: number): number[] => a.map((v, i) => v + b[i] * k);

export function solve(p: Params): Solution {
  const rhs = makeRhs(p);
  const norms = factorNorms(p);
  const m = Math.max(1, Math.round(p.substeps));
  const n = p.years * m;
  const h = 1 / n;
  let x = [...p.x0];
  let t = 0;
  const rows: number[][] = [[...x]];
  for (let s = 0; s < n; s++) {
    const k1 = rhs(t, x);
    const k2 = rhs(t + h / 2, axpy(x, k1, h / 2));
    const k3 = rhs(t + h / 2, axpy(x, k2, h / 2));
    const k4 = rhs(t + h, axpy(x, k3, h));
    x = x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    t += h;
    if (p.clamp) x = x.map((v) => Math.min(1, Math.max(0, v)));
    if ((s + 1) % m === 0) rows.push([...x]);
  }
  const times: number[] = [];
  const factors: number[][] = [];
  for (let y = 0; y <= p.years; y++) {
    times.push(y / p.years);
    factors.push(factorsAt(p, y / p.years, norms));
  }
  return { rows, times, factors };
}
