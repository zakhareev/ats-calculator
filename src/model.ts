export interface Coef { id: string; arg: number; a: number; b: number }

export interface Factor { a: number; b: number }

export interface Params {
  x0: number[];
  factors: Factor[];
  scale: number[];
  extra: number[];
  coef: Coef[];
  years: number;
  substeps: number;
  clamp: boolean;
}

export interface Solution {
  rows: number[][];
  times: number[];
  factors: number[][];
}

export const DEFAULT_COEF: readonly Coef[] = [
  { id: 'f1', arg: 1, a: 0.97, b: -0.49 },
  { id: 'f2', arg: 2, a: 0.51, b: 0.10 },
  { id: 'f3', arg: 3, a: 0.53, b: 0.06 },
  { id: 'f4', arg: 3, a: 0.75, b: 0.08 },
  { id: 'f5', arg: 5, a: 0.72, b: 0.20 },
  { id: 'f6', arg: 6, a: 0.97, b: -0.20 },
  { id: 'f7', arg: 7, a: 0.52, b: 0.38 },
  { id: 'f8', arg: 6, a: 0.78, b: -0.37 },
  { id: 'f9', arg: 0, a: 0.45, b: 0.09 },
  { id: 'f10', arg: 1, a: 0.55, b: 0.17 },
  { id: 'f11', arg: 6, a: 1.02, b: -0.44 },
  { id: 'f12', arg: 0, a: 0.66, b: 0.05 },
  { id: 'f13', arg: 1, a: 0.45, b: 0.48 },
  { id: 'f14', arg: 1, a: 1.18, b: -0.47 },
  { id: 'f15', arg: 1, a: 1.37, b: -0.07 },
  { id: 'f16', arg: 2, a: 0.59, b: 0.22 },
  { id: 'f17', arg: 3, a: 1.24, b: -0.71 },
  { id: 'f18', arg: 1, a: 0.87, b: -0.02 }
];

export const DEFAULT_FACTORS: readonly Factor[] = [
  { a: 0.63, b: 0.37 },
  { a: 1.0, b: -0.23 },
  { a: 1.0, b: -0.33 },
  { a: 0.51, b: 0.46 },
  { a: 0.6, b: 0.4 }
];

export const DEFAULT_X0: readonly number[] = [0.22, 0.77, 0.76, 0.67, 0.18, 0.28, 0.85, 0.81];

export function defaults(): Params {
  return {
    x0: [...DEFAULT_X0],
    factors: DEFAULT_FACTORS.map((f) => ({ ...f })),
    scale: [1, 1, 1, 1, 1],
    extra: [0, 0, 0, 0, 0, 0, 0, 0],
    coef: DEFAULT_COEF.map((c) => ({ ...c })),
    years: 12,
    substeps: 10,
    clamp: true
  };
}

export function factorsAt(p: Params, t: number): number[] {
  return p.factors.map((f, j) => (f.a + f.b * t) * p.scale[j]);
}

export function rhs(p: Params, t: number, X: number[]): number[] {
  const f = (k: number): number => {
    const c = p.coef[k - 1];
    return c.a + c.b * X[c.arg];
  };
  const [F1, F2, F3, F4, F5] = factorsAt(p, t);
  const d = [
    F3 - f(1) * f(2) * f(3),
    (F1 + F2 + F4) * f(4) * f(5) * f(6) - (F3 + F5) * f(7),
    F4 * f(8) - (F3 + F5) * f(9),
    F2 * f(10) * f(11) - (F3 + F5) * f(12),
    f(13) - F5,
    F2 * f(14) - F5,
    F2 * f(15) * f(16) * f(17) - (F3 + F5),
    F5 - f(18)
  ];
  return d.map((v, i) => v + p.extra[i]);
}

const axpy = (a: number[], b: number[], k: number): number[] => a.map((v, i) => v + b[i] * k);

export function solve(p: Params): Solution {
  const m = Math.max(1, Math.round(p.substeps));
  const n = p.years * m;
  const h = 1 / n;
  let x = [...p.x0];
  let t = 0;
  const rows: number[][] = [[...x]];
  for (let s = 0; s < n; s++) {
    const k1 = rhs(p, t, x);
    const k2 = rhs(p, t + h / 2, axpy(x, k1, h / 2));
    const k3 = rhs(p, t + h / 2, axpy(x, k2, h / 2));
    const k4 = rhs(p, t + h, axpy(x, k3, h));
    x = x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    t += h;
    if (p.clamp) x = x.map((v) => Math.min(1, Math.max(0, v)));
    if ((s + 1) % m === 0) rows.push([...x]);
  }
  const times: number[] = [];
  const factors: number[][] = [];
  for (let y = 0; y <= p.years; y++) {
    const ty = y / p.years;
    times.push(ty);
    factors.push(factorsAt(p, ty));
  }
  return { rows, times, factors };
}
