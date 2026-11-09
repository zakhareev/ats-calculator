import { FUNCS, N_FUNCS, N_VARS, type Poly } from './model';

export interface Statistics {
  years: number[];
  rows: number[][];
}

export interface FitResult {
  x0: number[];
  coef: Poly[];
  r2: number[];
  normalized: number[][];
}

export function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    [m[c], m[piv]] = [m[piv], m[c]];
    const d = m[c][c];
    if (Math.abs(d) < 1e-14) continue;
    for (let r = c + 1; r < n; r++) {
      const k = m[r][c] / d;
      for (let j = c; j <= n; j++) m[r][j] -= k * m[c][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r][n];
    for (let j = r + 1; j < n; j++) s -= m[r][j] * x[j];
    x[r] = Math.abs(m[r][r]) < 1e-14 ? 0 : s / m[r][r];
  }
  return x;
}

export function polyFit(xs: number[], ys: number[], degree = 3): Poly {
  const deg = Math.max(0, Math.min(degree, xs.length - 1));
  const size = deg + 1;
  const a: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  const b: number[] = new Array(size).fill(0);
  xs.forEach((x, i) => {
    const pw = [1];
    for (let k = 1; k < 2 * size; k++) pw.push(pw[k - 1] * x);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) a[r][c] += pw[r + c];
      b[r] += pw[r] * ys[i];
    }
  });
  for (let r = 0; r < size; r++) a[r][r] += 1e-12;
  const sol = solveLinear(a, b);
  return [sol[0] ?? 0, sol[1] ?? 0, sol[2] ?? 0, sol[3] ?? 0];
}

export function rSquared(xs: number[], ys: number[], c: Poly): number {
  const mean = ys.reduce((s, v) => s + v, 0) / ys.length;
  let ssTot = 0;
  let ssRes = 0;
  xs.forEach((x, i) => {
    const fit = c[0] + x * (c[1] + x * (c[2] + x * c[3]));
    ssRes += (ys[i] - fit) ** 2;
    ssTot += (ys[i] - mean) ** 2;
  });
  return ssTot < 1e-14 ? 1 : 1 - ssRes / ssTot;
}

export function fitFromStatistics(st: Statistics): FitResult {
  const cols = Array.from({ length: N_VARS }, (_, j) => st.rows.map((r) => r[j]));
  const maxes = cols.map((c) => Math.max(...c.map(Math.abs)) || 1);
  const normalized = st.rows.map((r) => r.map((v, j) => v / maxes[j]));
  const ncols = Array.from({ length: N_VARS }, (_, j) => normalized.map((r) => r[j]));
  const coef: Poly[] = [];
  const r2: number[] = [];
  for (let k = 0; k < N_FUNCS; k++) {
    const xs = ncols[FUNCS[k].arg];
    const ys = ncols[FUNCS[k].target];
    const c = polyFit(xs, ys, 3);
    coef.push(c);
    r2.push(rSquared(xs, ys, c));
  }
  return { x0: normalized[0].slice(), coef, r2, normalized };
}

export function parseStatistics(text: string): Statistics | string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const years: number[] = [];
  const rows: number[][] = [];
  for (const line of lines) {
    const parts = (line.includes(';') ? line.split(';') : line.includes('\t') ? line.split('\t') : line.split(/\s+/)).map((x) => x.trim().replace(',', '.'));
    const nums = parts.map((s) => Number(s));
    if (nums.some((v) => Number.isNaN(v))) {
      if (rows.length === 0) continue;
      return `Строка «${line.slice(0, 40)}» содержит нечисловые значения`;
    }
    if (nums.length === N_VARS + 1) {
      years.push(nums[0]);
      rows.push(nums.slice(1));
    } else if (nums.length === N_VARS) {
      years.push(years.length ? years[years.length - 1] + 1 : 1);
      rows.push(nums);
    } else {
      return `Ожидается ${N_VARS} или ${N_VARS + 1} значений в строке, получено ${nums.length}`;
    }
  }
  if (rows.length < 4) return 'Нужно не менее четырёх лет данных для построения полиномов третьей степени';
  return { years, rows };
}
