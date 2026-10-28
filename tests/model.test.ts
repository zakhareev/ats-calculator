import { describe, expect, it } from 'vitest';
import { defaults, solve } from '../src/model';

describe('модель авиационной транспортной системы', () => {
  it('возвращает years + 1 строку по 8 переменных', () => {
    const s = solve(defaults());
    expect(s.rows).toHaveLength(13);
    expect(s.rows[0]).toHaveLength(8);
    expect(s.factors[12]).toHaveLength(5);
  });

  it('в базовом сценарии X2 почти не меняется', () => {
    const s = solve(defaults());
    expect(s.rows[0][1]).toBeCloseTo(0.77, 3);
    expect(s.rows[12][1]).toBeCloseTo(0.763, 3);
  });

  it('рост госконтроля F5 x1,3 снижает X2 примерно на 38 %', () => {
    const b = solve(defaults()).rows[12][1];
    const p = defaults();
    p.scale[4] = 1.3;
    const g = solve(p).rows[12][1];
    expect(g).toBeCloseTo(0.472, 3);
    expect(((g - b) / b) * 100).toBeCloseTo(-38.1, 1);
  });

  it('значения остаются в [0; 1] при включённом ограничении', () => {
    const p = defaults();
    p.extra[2] = 0.6;
    for (const r of solve(p).rows) for (const v of r) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });

  it('метод Рунге — Кутты сходится: 10 и 100 шагов на год дают близкий результат', () => {
    const a = defaults(); a.clamp = false; a.substeps = 10;
    const b = defaults(); b.clamp = false; b.substeps = 100;
    expect(Math.abs(solve(a).rows[12][1] - solve(b).rows[12][1])).toBeLessThan(1e-8);
  });
});
