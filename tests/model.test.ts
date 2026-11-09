import { describe, expect, it } from 'vitest';
import { defaults, solve, makeRhs, evalPoly, factorNorms, factorsAt, FUNCS, N_FUNCS, N_VARS } from '../src/model';

describe('структура модели', () => {
  it('содержит 36 функций влияния и 10 переменных', () => {
    expect(FUNCS).toHaveLength(N_FUNCS);
    expect(N_FUNCS).toBe(36);
    expect(defaults().x0).toHaveLength(N_VARS);
    expect(defaults().coef).toHaveLength(36);
  });

  it('число функций в каждом уравнении соответствует системе (1)', () => {
    const counts = new Array(N_VARS).fill(0);
    FUNCS.forEach((f) => { counts[f.target]++; });
    expect(counts).toEqual([5, 4, 4, 1, 3, 4, 4, 4, 3, 4]);
  });

  it('аргументы функций совпадают с системой (1)', () => {
    const args = FUNCS.map((f) => f.arg);
    expect(args).toEqual([1, 2, 6, 7, 8, 0, 5, 3, 6, 0, 4, 9, 7, 0, 2, 9, 7, 1, 9, 6, 8, 3, 5, 8, 9, 0, 2, 4, 9, 0, 5, 9, 4, 5, 7, 8]);
  });
});

describe('внешние факторы', () => {
  it('принимают значения из рукописи при t = 0 и t = 1', () => {
    const p = defaults();
    p.normalizeFactors = false;
    const f0 = factorsAt(p, 0);
    const f1 = factorsAt(p, 1);
    expect(f0[0]).toBeCloseTo(0.41, 6);
    expect(f1[0]).toBeCloseTo(1.0, 6);
    expect(f0[1]).toBeCloseTo(87, 6);
    expect(f1[1]).toBeCloseTo(67, 6);
    expect(f0[2]).toBeCloseTo(29, 6);
    expect(f1[2]).toBeCloseTo(74, 6);
    expect(f0[3]).toBeCloseTo(-5, 6);
    expect(f1[3]).toBeCloseTo(1, 6);
    expect(f0[4]).toBeCloseTo(21, 6);
    expect(f1[4]).toBeCloseTo(35, 6);
  });

  it('нормировка делит на максимум по модулю за период', () => {
    const n = factorNorms(defaults());
    expect(n[0]).toBeCloseTo(1, 3);
    expect(n[1]).toBeCloseTo(87, 3);
    expect(n[3]).toBeCloseTo(5, 3);
    expect(n[4]).toBeCloseTo(35, 3);
    expect(n[2]).toBeCloseTo(74.4545, 3);
  });
});

describe('правая часть', () => {
  it('вычисляется по уравнениям системы (1)', () => {
    const p = defaults();
    p.normalizeFactors = false;
    p.coef.forEach((c, k) => { c[0] = 0.1 + 0.01 * k; c[1] = 0.2; c[2] = 0.05; c[3] = -0.03; });
    const X = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.1, 0.35];
    const t = 0.4;
    const d = makeRhs(p)(t, X);
    const f = (k: number): number => evalPoly(p.coef[k - 1], X[FUNCS[k - 1].arg]);
    const Price = 0.33 * t * t + 0.26 * t + 0.41;
    const For = -16 * t * t - 4 * t + 87;
    const Dol = -55 * t * t + 100 * t + 29;
    const Covid = 6 * t - 5;
    const Law = -3 * t * t + 17 * t + 21;
    expect(d[0]).toBeCloseTo((Price + For + Dol) * f(1) * f(2) - (Covid + Law) * f(3) * f(4) * f(5), 9);
    expect(d[1]).toBeCloseTo(Dol * f(6) * f(7) - f(8) * f(9), 9);
    expect(d[2]).toBeCloseTo(For * f(10) * f(11) * f(12) - Law * f(13), 9);
    expect(d[3]).toBeCloseTo(-(Price + Dol + Covid) * f(14), 9);
    expect(d[4]).toBeCloseTo(For * f(15) * f(16) - Law * f(17), 9);
    expect(d[5]).toBeCloseTo(Price * f(18) * f(19) - Law * f(20) * f(21), 9);
    expect(d[6]).toBeCloseTo(Law * f(22) * f(23) * f(24) * f(25) - (Price + Dol + Covid), 9);
    expect(d[7]).toBeCloseTo(Law - Covid * f(26) * f(27) * f(28) * f(29), 9);
    expect(d[8]).toBeCloseTo(Law - f(30) * f(31) * f(32), 9);
    expect(d[9]).toBeCloseTo(Price * f(33) * f(34) - f(35) * f(36), 9);
  });

  it('добавки U прибавляются к правым частям', () => {
    const p = defaults();
    const a = makeRhs(p)(0.2, p.x0);
    p.extra[3] = 0.25;
    const b = makeRhs(p)(0.2, p.x0);
    expect(b[3] - a[3]).toBeCloseTo(0.25, 12);
    expect(b[0]).toBeCloseTo(a[0], 12);
  });
});

describe('решение', () => {
  it('возвращает years + 1 строку по 10 переменных', () => {
    const s = solve(defaults());
    expect(s.rows).toHaveLength(11);
    expect(s.rows[0]).toHaveLength(10);
    expect(s.factors[10]).toHaveLength(5);
  });

  it('при включённом ограничении значения остаются в [0; 1]', () => {
    for (const r of solve(defaults()).rows) for (const v of r) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });

  it('множитель фактора Law меняет результат', () => {
    const a = solve(defaults()).rows[10];
    const p = defaults();
    p.scale[4] = 1.3;
    const b = solve(p).rows[10];
    expect(b.some((v, i) => Math.abs(v - a[i]) > 1e-6)).toBe(true);
  });

  it('метод Рунге — Кутты сходится', () => {
    const a = defaults(); a.clamp = false; a.substeps = 10;
    const b = defaults(); b.clamp = false; b.substeps = 100;
    const ra = solve(a).rows[10];
    const rb = solve(b).rows[10];
    expect(Math.max(...ra.map((v, i) => Math.abs(v - rb[i])))).toBeLessThan(1e-6);
  });
});
