import './style.css';
import { defaults, solve, FUNCS, N_FUNCS, type Params, type Poly } from './model';
import { VAR, FAC, PRESETS, sub, type Item } from './data';
import { $, el, esc, f2 } from './dom';
import { lineChart, fnChart } from './chart';
import { fitFromStatistics, parseStatistics, type FitResult } from './stats';

let P: Params = defaults();
let startYear = 2011;
let activePreset: string | null = 'base';
const shown: number[] = [0, 1, 6, 7];
const shownF: number[] = [0, 1, 2, 3, 4];
let yearIdx = 10;
let fnIdx = 0;
let pending = false;
let csvText = '';
let fit: FitResult | null = null;

interface Inputs {
  f: HTMLInputElement[][];
  x0: Array<[HTMLInputElement, HTMLOutputElement]>;
  u: HTMLInputElement[];
  coef: HTMLInputElement[][];
  startYear: HTMLInputElement;
  years: HTMLInputElement;
  substeps: HTMLInputElement;
  clamp: HTMLInputElement;
  norm: HTMLInputElement;
}
const inputs = { f: [], x0: [], u: [], coef: [] } as unknown as Inputs;

const col = (i: number): string => `var(--s${i + 1})`;
const num = (v: number): string => String(Math.round(v * 1e6) / 1e6);
const fmt3 = (v: number): string => (Math.round(v * 1000) / 1000).toString().replace('.', ',').replace('-', '−');

function polyText(c: readonly number[]): string {
  const terms: string[] = [];
  const names = ['', 'X', 'X²', 'X³'];
  for (let k = 3; k >= 0; k--) {
    const v = c[k];
    const a = fmt3(Math.abs(v));
    const body = k === 0 ? a : `${a}·${names[k]}`;
    terms.push(terms.length === 0 ? (v < 0 ? '−' : '') + body : (v < 0 ? ' − ' : ' + ') + body);
  }
  return terms.join('');
}

function numInput(id: string, val: number, min: string, max: string, step: string, onchange: (v: number) => void): HTMLInputElement {
  const i = el('input', { id, type: 'number', class: 'num', step, inputmode: 'decimal' });
  if (min !== '') i.min = min;
  if (max !== '') i.max = max;
  i.value = num(val);
  i.addEventListener('input', () => {
    let v = parseFloat(i.value);
    if (isNaN(v)) return;
    if (min !== '' && v < parseFloat(min)) v = parseFloat(min);
    if (max !== '' && v > parseFloat(max)) v = parseFloat(max);
    onchange(v);
    markCustom();
    schedule();
  });
  return i;
}

function setYearMax(): void {
  const s = $<HTMLInputElement>('yearSel');
  s.max = String(P.years);
  if (yearIdx > P.years) yearIdx = P.years;
}

function funcLabel(k: number): string {
  return `f${sub(k + 1)}(${VAR[FUNCS[k].arg].s})`;
}

function buildControls(): void {
  const cf = $('ctlF');
  cf.appendChild(el('div', { class: 'row4 head' }, '<span>t²</span><span>t</span><span>1</span><span>множитель</span>'));
  FAC.forEach((fc, j) => {
    const row = el('div', { class: 'row4' });
    row.appendChild(el('label', { title: fc.full }, `<b>${fc.s}</b> ${esc(fc.short)}`));
    const q = P.factors[j];
    const i2 = numInput(`fq${j}`, q[2], '-1000', '1000', '0.01', (v) => { P.factors[j][2] = v; });
    const i1 = numInput(`fl${j}`, q[1], '-1000', '1000', '0.01', (v) => { P.factors[j][1] = v; });
    const i0 = numInput(`fc${j}`, q[0], '-1000', '1000', '0.01', (v) => { P.factors[j][0] = v; });
    const ik = numInput(`fk${j}`, P.scale[j], '0', '3', '0.05', (v) => { P.scale[j] = v; });
    i2.setAttribute('aria-label', `Коэффициент при t² для ${fc.s}`);
    i1.setAttribute('aria-label', `Коэффициент при t для ${fc.s}`);
    i0.setAttribute('aria-label', `Свободный член для ${fc.s}`);
    ik.setAttribute('aria-label', `Множитель для ${fc.s}`);
    row.append(i2, i1, i0, ik);
    cf.appendChild(row);
    inputs.f.push([i2, i1, i0, ik]);
  });
  const nr = el('div', { class: 'checkrow' });
  const nb = el('input', { type: 'checkbox', id: 'normF' });
  nb.checked = P.normalizeFactors;
  nb.addEventListener('change', () => { P.normalizeFactors = nb.checked; markCustom(); schedule(); });
  nr.append(nb, el('label', { for: 'normF' }, 'Нормировать факторы на максимум за период<small style="display:block;color:var(--muted)">Как и переменные, факторы приводятся к шкале до 1; иначе значения порядка десятков сразу выводят систему за границы</small>'));
  cf.appendChild(nr);
  inputs.norm = nb;
  cf.appendChild(el('p', { class: 'note' }, 'F(t) = (c₂t² + c₁t + c₀) × множитель, где t от 0 (начало периода) до 1 (конец). Значения по умолчанию из рукописи.'));

  const cx = $('ctlX0');
  VAR.forEach((v, i) => {
    const wrap = el('div', { class: 'sl-wrap' });
    wrap.appendChild(el('label', { for: `x0r${i}`, title: v.full }, `<b>${v.s}</b> ${esc(v.short)}`));
    const line = el('div', { class: 'sl' });
    const r = el('input', { id: `x0r${i}`, type: 'range', min: '0', max: '1', step: '0.01' });
    const o = el('output', { for: `x0r${i}` });
    r.value = String(P.x0[i]);
    o.textContent = f2(P.x0[i]);
    r.addEventListener('input', () => {
      P.x0[i] = parseFloat(r.value);
      o.textContent = f2(P.x0[i]);
      markCustom();
      schedule();
    });
    line.append(r, o);
    wrap.appendChild(line);
    cx.appendChild(wrap);
    inputs.x0.push([r, o]);
  });

  const co = $('ctlCoef');
  co.appendChild(el('p', { class: 'note' }, 'Функция влияния fₖ(X) = c₃X³ + c₂X² + c₁X + c₀. Значения по умолчанию демонстрационные: в материалах задания числовые коэффициенты не приведены, их строят регрессией по статистике (блок выше).'));
  co.appendChild(el('div', { class: 'row4 head' }, '<span>c₃ (X³)</span><span>c₂ (X²)</span><span>c₁ (X)</span><span>c₀</span>'));
  P.coef.forEach((c, k) => {
    const row = el('div', { class: 'row4' });
    row.appendChild(el('label', { title: `${VAR[FUNCS[k].target].short} ← ${VAR[FUNCS[k].arg].short}` }, `<b>${funcLabel(k)}</b>`));
    const order = [3, 2, 1, 0];
    const ins = order.map((d) => {
      const inp = numInput(`c${k}_${d}`, c[d], '-1000', '1000', '0.01', (v) => { P.coef[k][d] = v; });
      inp.setAttribute('aria-label', `c${d} для f${k + 1}`);
      return inp;
    });
    row.append(...ins);
    co.appendChild(row);
    inputs.coef.push([ins[3], ins[2], ins[1], ins[0]]);
  });

  const cu = $('ctlU');
  cu.appendChild(el('p', { class: 'note' }, 'Добавляет постоянное слагаемое к правой части уравнения: dXᵢ/dt = … + Uᵢ. Положительное значение ускоряет рост переменной, отрицательное замедляет.'));
  VAR.forEach((v, i) => {
    const row = el('div', { class: 'row' });
    row.appendChild(el('label', { for: `u${i}`, title: v.full }, `<b>U${sub(i + 1)}</b> ${esc(v.short)}`));
    const inp = numInput(`u${i}`, P.extra[i], '-2', '2', '0.05', (x) => { P.extra[i] = x; });
    row.appendChild(inp);
    cu.appendChild(row);
    inputs.u.push(inp);
  });

  const cc = $('ctlCalc');
  const r1 = el('div', { class: 'row' });
  r1.appendChild(el('label', { for: 'startYear' }, 'Первый год периода'));
  inputs.startYear = numInput('startYear', startYear, '1900', '2100', '1', (v) => { startYear = Math.round(v); });
  r1.appendChild(inputs.startYear);
  cc.appendChild(r1);
  const r2 = el('div', { class: 'row' });
  r2.appendChild(el('label', { for: 'years' }, 'Длина периода, лет<small>от 3 до 30</small>'));
  inputs.years = numInput('years', P.years, '3', '30', '1', (v) => { P.years = Math.round(v); setYearMax(); });
  r2.appendChild(inputs.years);
  cc.appendChild(r2);
  const r3 = el('div', { class: 'row' });
  r3.appendChild(el('label', { for: 'substeps' }, 'Шагов Рунге — Кутты на год<small>от 1 до 100</small>'));
  inputs.substeps = numInput('substeps', P.substeps, '1', '100', '1', (v) => { P.substeps = Math.round(v); });
  r3.appendChild(inputs.substeps);
  cc.appendChild(r3);
  const r4 = el('div', { class: 'checkrow' });
  const cb = el('input', { type: 'checkbox', id: 'clamp' });
  cb.checked = P.clamp;
  cb.addEventListener('change', () => { P.clamp = cb.checked; markCustom(); schedule(); });
  r4.append(cb, el('label', { for: 'clamp' }, 'Удерживать значения в диапазоне от 0 до 1<small style="display:block;color:var(--muted)">Переменные нормированы, выход за диапазон не имеет смысла</small>'));
  cc.appendChild(r4);
  inputs.clamp = cb;

  const sel = $<HTMLSelectElement>('fnSel');
  for (let k = 0; k < N_FUNCS; k++) {
    const o = el('option', { value: String(k) }, `${funcLabel(k)} → ${VAR[FUNCS[k].target].s}`);
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => { fnIdx = parseInt(sel.value, 10); schedule(); });

  const dict = (a: Item[]): string => a.map((v) => `<div><b>${v.s}</b><span>${esc(v.full)}</span></div>`).join('');
  $('about').innerHTML =
    '<p>Система из десяти дифференциальных уравнений описывает, как внешние факторы и переменные влияют друг на друга. Решение ищется методом Рунге — Кутты 4-го порядка.</p>' +
    '<pre>dXпроис/dt = (Price+For+Dol)·f₁(Xстар)·f₂(Xнаруш) − (Covid+Law)·f₃(Xнов)·f₄(Xтрен)·f₅(Xконтр)\n' +
    'dXстар/dt = Dol·f₆(Xпроис)·f₇(Xтех) − f₈(Xбил)·f₉(Xнов)\n' +
    'dXнаруш/dt = For·f₁₀(Xпроис)·f₁₁(Xчел)·f₁₂(Xповт) − Law·f₁₃(Xтрен)\n' +
    'dXбил/dt = −(Price+Dol+Covid)·f₁₄(Xпроис)\n' +
    'dXчел/dt = For·f₁₅(Xнаруш)·f₁₆(Xповт) − Law·f₁₇(Xтрен)\n' +
    'dXтех/dt = Price·f₁₈(Xстар)·f₁₉(Xповт) − Law·f₂₀(Xнов)·f₂₁(Xконтр)\n' +
    'dXнов/dt = Law·f₂₂(Xбил)·f₂₃(Xтех)·f₂₄(Xконтр)·f₂₅(Xповт) − (Price+Dol+Covid)\n' +
    'dXтрен/dt = Law − Covid·f₂₆(Xпроис)·f₂₇(Xнаруш)·f₂₈(Xчел)·f₂₉(Xповт)\n' +
    'dXконтр/dt = Law − f₃₀(Xпроис)·f₃₁(Xтех)·f₃₂(Xповт)\n' +
    'dXповт/dt = Price·f₃₃(Xчел)·f₃₄(Xтех) − f₃₅(Xтрен)·f₃₆(Xконтр)</pre>' +
    '<p><b>Допущения калькулятора</b></p><ul>' +
    '<li>Время t нормировано: 0 соответствует первому году периода (2011), 1 последнему. Период по умолчанию 10 лет (2011–2021), что согласуется со значениями факторов в рукописи.</li>' +
    '<li>Каждая функция влияния f — полином третьей степени. Его коэффициенты в материалах задания не приведены, поэтому по умолчанию заданы демонстрационные функции f(X) = 0,3 + 0,4X. Для реального расчёта вставьте статистику по годам: приложение разделит каждый ряд на максимум и построит все 36 полиномов методом наименьших квадратов.</li>' +
    '<li>Внешние факторы заданы полиномами из рукописи и по умолчанию делятся на максимум за период, чтобы быть сопоставимыми с нормированными переменными.</li>' +
    '<li>Начальные значения по умолчанию условные (0,5). При загрузке статистики берутся значения первого года.</li>' +
    '<li>Значения переменных удерживаются в диапазоне от 0 до 1 (можно отключить).</li></ul>' +
    `<p><b>Обозначения</b></p><div class="dict">${dict(VAR)}${dict(FAC)}</div>`;

  $('statHead').addEventListener('click', () => {
    const box = $<HTMLTextAreaElement>('statBox');
    box.value = ['Год'].concat(VAR.map((v) => v.s)).join(';') + '\n' + box.value;
  });
  $('statApply').addEventListener('click', applyStatistics);
}

function applyStatistics(): void {
  const msg = $('statMsg');
  const parsed = parseStatistics($<HTMLTextAreaElement>('statBox').value);
  if (typeof parsed === 'string') { msg.textContent = parsed; return; }
  const result = fitFromStatistics(parsed);
  fit = result;
  P.coef = result.coef.map((c) => [...c] as Poly);
  P.x0 = result.x0.map((v) => Math.min(1, Math.max(0, v)));
  const n = parsed.rows.length - 1;
  if (n >= 3 && n <= 30) { P.years = n; startYear = Math.round(parsed.years[0]); }
  const worst = Math.min(...result.r2);
  const mean = result.r2.reduce((s, v) => s + v, 0) / result.r2.length;
  msg.textContent = `Построено ${N_FUNCS} полиномов по ${parsed.rows.length} годам. R²: среднее ${fmt3(mean)}, минимум ${fmt3(worst)}.`;
  syncInputs();
  markCustom();
  schedule();
}

function syncInputs(): void {
  P.factors.forEach((q, j) => {
    inputs.f[j][0].value = num(q[2]);
    inputs.f[j][1].value = num(q[1]);
    inputs.f[j][2].value = num(q[0]);
    inputs.f[j][3].value = num(P.scale[j]);
  });
  inputs.norm.checked = P.normalizeFactors;
  P.x0.forEach((v, i) => { inputs.x0[i][0].value = String(v); inputs.x0[i][1].textContent = f2(v); });
  P.extra.forEach((v, i) => { inputs.u[i].value = num(v); });
  P.coef.forEach((c, k) => { for (let d = 0; d < 4; d++) inputs.coef[k][d].value = num(c[d]); });
  inputs.startYear.value = String(startYear);
  inputs.years.value = String(P.years);
  inputs.substeps.value = String(P.substeps);
  inputs.clamp.checked = P.clamp;
  setYearMax();
}

function markPreset(): void {
  $('presets').querySelectorAll<HTMLElement>('.chip').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.id === activePreset ? 'true' : 'false');
  });
}
function markCustom(): void { if (activePreset) { activePreset = null; markPreset(); } }

function buildPresets(): void {
  const host = $('presets');
  for (const pr of PRESETS) {
    const b = el('button', { class: 'chip', type: 'button', 'data-id': pr.id, 'aria-pressed': pr.id === activePreset ? 'true' : 'false' }, esc(pr.name));
    b.addEventListener('click', () => {
      const keep = { x0: P.x0, factors: P.factors, normalizeFactors: P.normalizeFactors, coef: P.coef, years: P.years, substeps: P.substeps, clamp: P.clamp };
      P = Object.assign(defaults(), keep);
      pr.set(P);
      activePreset = pr.id;
      syncInputs();
      markPreset();
      schedule();
    });
    host.appendChild(b);
  }
}

function buildLegend(host: HTMLElement, items: Item[], sel: number[]): void {
  host.innerHTML = '';
  items.forEach((it, i) => {
    const b = el('button', { class: 'lg', type: 'button', 'aria-pressed': sel.includes(i) ? 'true' : 'false', title: it.full },
      `<i style="--c:${col(i)}"></i><b style="font-weight:600">${it.s}</b>`);
    b.addEventListener('click', () => {
      const k = sel.indexOf(i);
      if (k >= 0) { if (sel.length > 1) sel.splice(k, 1); } else sel.push(i);
      sel.sort((a, c) => a - c);
      render();
    });
    host.appendChild(b);
  });
}

function renderFunctions(): void {
  const c = P.coef[fnIdx];
  const meta = FUNCS[fnIdx];
  $<HTMLSelectElement>('fnSel').value = String(fnIdx);
  $('fnFormula').textContent = `${funcLabel(fnIdx)} = ${polyText(c)}`;
  let pts: Array<{ x: number; y: number }> = [];
  let note = 'Функция задана коэффициентами из панели параметров.';
  if (fit) {
    pts = fit.normalized.map((r) => ({ x: r[meta.arg], y: r[meta.target] }));
    note = `Точки — нормированная статистика (${VAR[meta.arg].s} по горизонтали, ${VAR[meta.target].s} по вертикали), линия — полином по методу наименьших квадратов, R² = ${fmt3(fit.r2[fnIdx])}.`;
  }
  $('fnNote').textContent = note;
  fnChart($('chartFn'), c, pts, `График функции влияния ${funcLabel(fnIdx)}`);
  const head = `<thead><tr><th scope="col">f</th><th scope="col">Аргумент</th><th scope="col">Влияет на</th><th scope="col">Полином</th>${fit ? '<th scope="col">R²</th>' : ''}</tr></thead>`;
  const body = '<tbody>' + P.coef.map((cc, k) =>
    `<tr${k === fnIdx ? ' class="sel"' : ''}><td>f${sub(k + 1)}</td><td>${VAR[FUNCS[k].arg].s}</td><td>${VAR[FUNCS[k].target].s}</td><td>${polyText(cc)}</td>${fit ? `<td>${fmt3(fit.r2[k])}</td>` : ''}</tr>`).join('') + '</tbody>';
  $('fnTbl').innerHTML = head + body;
}

function render(): void {
  pending = false;
  const base = Object.assign(defaults(), {
    x0: P.x0, factors: P.factors, normalizeFactors: P.normalizeFactors, coef: P.coef,
    years: P.years, substeps: P.substeps, clamp: P.clamp
  });
  const cur = solve(P);
  const bas = solve(base);
  const same = JSON.stringify(cur.rows) === JSON.stringify(bas.rows);
  const years = Array.from({ length: P.years + 1 }, (_, i) => String(startYear + i));
  const last = P.years;

  const x1 = cur.rows[last][0];
  const x1b = bas.rows[last][0];
  const x10 = cur.rows[0][0];
  const rel = x1b === 0 ? 0 : ((x1 - x1b) / x1b) * 100;
  let pill: string;
  if (same || Math.abs(rel) < 0.5) pill = '<span class="pill neutral">без изменений</span>';
  else if (rel < 0) pill = `<span class="pill good"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v10M3 8l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2"/></svg>${f2(Math.abs(rel))}% меньше</span>`;
  else pill = `<span class="pill bad"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 12V2M3 6l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2"/></svg>${f2(rel)}% больше</span>`;
  const dRun = x1 - x10;
  $('tiles').innerHTML =
    `<div class="tile"><div class="k">Происшествия Xпроис, ${years[last]}</div><div class="v">${f2(x1)}</div><div class="s">нормированное значение</div></div>` +
    `<div class="tile"><div class="k">К базовому сценарию</div><div class="v" style="font-family:var(--font-body);font-size:20px;padding-top:8px">${pill}</div><div class="s">без воздействий: ${f2(x1b)}</div></div>` +
    `<div class="tile"><div class="k">Изменение за период</div><div class="v">${dRun >= 0 ? '+' : '−'}${f2(Math.abs(dRun))}</div><div class="s">с ${f2(x10)} в ${years[0]}</div></div>`;

  $('keyline').innerHTML = same ? '' : '<svg viewBox="0 0 26 8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--muted)" stroke-width="2" stroke-dasharray="5 4"/></svg> пунктир: без воздействий';

  buildLegend($('legend'), VAR, shown);
  lineChart($('chart1'), {
    x: years, showBase: !same, directLabels: false,
    aria: 'График нормированных значений переменных модели по годам',
    series: shown.map((i) => ({ sym: VAR[i].s, color: col(i), values: cur.rows.map((r) => r[i]), base: bas.rows.map((r) => r[i]) }))
  });

  buildLegend($('legendF'), FAC, shownF);
  lineChart($('chart2'), {
    x: years, showBase: false, directLabels: false, minHi: 1,
    aria: 'График внешних факторов по годам',
    series: shownF.map((j) => ({ sym: FAC[j].s, color: col(j), values: cur.factors.map((r) => r[j]) }))
  });

  const ys = $<HTMLInputElement>('yearSel');
  ys.max = String(P.years);
  ys.value = String(Math.min(yearIdx, P.years));
  const yi = parseInt(ys.value, 10);
  $('yearOut').textContent = years[yi];
  $('slice').innerHTML = VAR.map((v, i) => {
    const val = cur.rows[yi][i];
    const bv = bas.rows[yi][i];
    const pct = Math.max(0, Math.min(1, val)) * 100;
    const bp = Math.max(0, Math.min(1, bv)) * 100;
    return `<div class="slice-row" style="--c:${col(i)}"><div class="nm" title="${esc(v.full)}"><i></i><span><b>${v.s}</b> ${esc(v.short)}</span></div>` +
      `<div class="track"><div class="fill" style="width:${pct.toFixed(1)}%"></div>${same ? '' : `<div class="bm" style="left:calc(${bp.toFixed(1)}% - 1px)"></div>`}</div>` +
      `<div class="val">${f2(val)}</div></div>`;
  }).join('');

  renderFunctions();

  const th = '<caption class="note" style="text-align:left;caption-side:top;padding:0 0 6px">Нормированные значения переменных по годам</caption><thead><tr><th scope="col">Год</th>' +
    VAR.map((v) => `<th scope="col" title="${esc(v.full)}">${v.s}</th>`).join('') + '</tr></thead>';
  const tb = '<tbody>' + cur.rows.map((r, k) =>
    `<tr${k === yi ? ' class="sel"' : ''}><td>${years[k]}</td>${r.map((v) => `<td>${f2(v)}</td>`).join('')}</tr>`).join('') + '</tbody>';
  $('tbl').innerHTML = th + tb;
  csvText = [`Год;${VAR.map((v) => v.s).join(';')}`]
    .concat(cur.rows.map((r, k) => `${years[k]};${r.map((v) => v.toFixed(4).replace('.', ',')).join(';')}`)).join('\n');
}

function schedule(): void {
  if (!pending) { pending = true; requestAnimationFrame(render); }
}

$('resetAll').addEventListener('click', () => {
  P = defaults();
  startYear = 2011;
  activePreset = 'base';
  yearIdx = P.years;
  fit = null;
  $('statMsg').textContent = '';
  syncInputs();
  markPreset();
  schedule();
});

$('yearSel').addEventListener('input', function (this: HTMLElement) {
  yearIdx = parseInt((this as HTMLInputElement).value, 10);
  schedule();
});

$('copyCsv').addEventListener('click', () => {
  const box = $<HTMLTextAreaElement>('csvbox');
  const fallback = (): void => { box.value = csvText; box.hidden = false; box.focus(); box.select(); };
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(csvText).then(() => {
        const b = $('copyCsv');
        b.textContent = 'Скопировано';
        setTimeout(() => { b.textContent = 'Скопировать CSV'; }, 1500);
      }, fallback);
    } else fallback();
  } catch { fallback(); }
});

buildControls();
buildPresets();
syncInputs();
render();
let rt: number | undefined;
window.addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(render, 120); });
