import { describe, expect, it } from 'vitest';
import { FUNCS, N_VARS, evalPoly } from '../src/model';
import { fitFromStatistics, parseStatistics, polyFit, rSquared, solveLinear } from '../src/stats';

describe('метод наименьших квадратов', () => {
  it('решает линейную систему', () => {
    const x = solveLinear([[2, 1], [1, 3]], [5, 10]);
    expect(x[0]).toBeCloseTo(1, 10);
    expect(x[1]).toBeCloseTo(3, 10);
  });

  it('точно восстанавливает кубический полином', () => {
    const c: [number, number, number, number] = [0.2, -0.5, 1.1, 0.4];
    const xs = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1];
    const ys = xs.map((x) => evalPoly(c, x));
    const fit = polyFit(xs, ys, 3);
    fit.forEach((v, i) => expect(v).toBeCloseTo(c[i], 6));
    expect(rSquared(xs, ys, fit)).toBeCloseTo(1, 9);
  });

  it('понижает степень при малом числе точек', () => {
    const fit = polyFit([0, 1], [1, 3], 3);
    expect(evalPoly(fit, 0)).toBeCloseTo(1, 6);
    expect(evalPoly(fit, 1)).toBeCloseTo(3, 6);
  });
});

describe('построение функций по статистике', () => {
  const n = 11;
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    rows.push(Array.from({ length: N_VARS }, (_, j) => 10 * (1 + 0.1 * j) * (0.4 + 0.5 * t + 0.1 * Math.sin(3 * t + j))));
  }
  const fit = fitFromStatistics({ years: rows.map((_, i) => 2011 + i), rows });

  it('нормирует ряды на максимум', () => {
    for (let j = 0; j < N_VARS; j++) expect(Math.max(...fit.normalized.map((r) => r[j]))).toBeCloseTo(1, 12);
  });

  it('начальные значения берутся из первой строки', () => {
    fit.x0.forEach((v, j) => expect(v).toBeCloseTo(fit.normalized[0][j], 12));
  });

  it('строит 36 полиномов с R² от 0 до 1', () => {
    expect(fit.coef).toHaveLength(36);
    fit.r2.forEach((v) => { expect(v).toBeGreaterThan(-1e-9); expect(v).toBeLessThanOrEqual(1 + 1e-9); });
  });

  it('полином совпадает с зависимостью зависимой переменной от аргумента', () => {
    const k = 0;
    const xs = fit.normalized.map((r) => r[FUNCS[k].arg]);
    const ys = fit.normalized.map((r) => r[FUNCS[k].target]);
    expect(fit.r2[k]).toBeCloseTo(rSquared(xs, ys, fit.coef[k]), 12);
  });
});

describe('разбор статистики', () => {
  const line = (y: number): string => `${y};1,5;2;3;4;5;6;7;8;9;10`;

  it('принимает строки с годом и десятичной запятой', () => {
    const r = parseStatistics(['Год;a', line(2011), line(2012), line(2013), line(2014)].join('\n'));
    expect(typeof r).toBe('object');
    if (typeof r === 'object') {
      expect(r.years).toEqual([2011, 2012, 2013, 2014]);
      expect(r.rows[0][0]).toBeCloseTo(1.5, 12);
    }
  });

  it('принимает строки без года', () => {
    const l = '1\t2\t3\t4\t5\t6\t7\t8\t9\t10';
    const r = parseStatistics([l, l, l, l].join('\n'));
    expect(typeof r).toBe('object');
  });

  it('сообщает об ошибках', () => {
    expect(typeof parseStatistics(line(2011))).toBe('string');
    expect(typeof parseStatistics([line(2011), '1;2;3', line(2013), line(2014)].join('\n'))).toBe('string');
  });
});
