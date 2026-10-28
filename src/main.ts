import './style.css';
import { defaults, solve, type Params } from './model';
import { VAR, FAC, SUB, PRESETS, type Item } from './data';
import { $, el, esc, f2 } from './dom';
import { lineChart } from './chart';

let P: Params = defaults();
let startYear = 2011;
let activePreset: string | null = 'base';
const shown: number[] = [1, 2, 3, 7];
const shownF: number[] = [0, 1, 2, 3, 4];
let yearIdx = 12;
let pending = false;
let csvText = '';

interface Inputs {
  f: HTMLInputElement[][];
  x0: Array<[HTMLInputElement, HTMLOutputElement]>;
  u: HTMLInputElement[];
  coef: HTMLInputElement[][];
  startYear: HTMLInputElement;
  years: HTMLInputElement;
  substeps: HTMLInputElement;
  clamp: HTMLInputElement;
}
const inputs = { f: [], x0: [], u: [], coef: [] } as unknown as Inputs;

const col = (i: number): string => `var(--s${i + 1})`;

function numInput(id: string, val: number, min: string, max: string, step: string, onchange: (v: number) => void): HTMLInputElement {
  const i = el('input', { id, type: 'number', class: 'num', min, max, step, inputmode: 'decimal' });
  i.value = String(val);
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

function buildControls(): void {
  const cf = $('ctlF');
  cf.appendChild(el('div', { class: 'row3 head' }, '<span>Фактор</span><span style="text-align:right">a</span><span style="text-align:right">b</span><span style="text-align:right">множитель</span>'));
  FAC.forEach((fc, j) => {
    const row = el('div', { class: 'row3' });
    row.appendChild(el('label', { for: `fa${j}`, title: fc.full }, `<b>${fc.s}</b> ${esc(fc.short)}`));
    const ia = numInput(`fa${j}`, P.factors[j].a, '-5', '5', '0.01', (v) => { P.factors[j].a = v; });
    const ib = numInput(`fb${j}`, P.factors[j].b, '-5', '5', '0.01', (v) => { P.factors[j].b = v; });
    const ik = numInput(`fk${j}`, P.scale[j], '0', '3', '0.05', (v) => { P.scale[j] = v; });
    ia.setAttribute('aria-label', `a для ${fc.s}`);
    ib.setAttribute('aria-label', `b для ${fc.s}`);
    ik.setAttribute('aria-label', `Множитель для ${fc.s}`);
    row.append(ia, ib, ik);
    cf.appendChild(row);
    inputs.f.push([ia, ib, ik]);
  });
  cf.appendChild(el('p', { class: 'note' }, 'F(t) = (a + b·t) × множитель, где t от 0 (начало периода) до 1 (конец).'));

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

  const cu = $('ctlU');
  cu.appendChild(el('p', { class: 'note' }, 'Добавляет постоянное слагаемое к правой части уравнения: dXᵢ/dt = … + Uᵢ. Положительное значение ускоряет рост переменной, отрицательное замедляет.'));
  VAR.forEach((v, i) => {
    const row = el('div', { class: 'row' });
    row.appendChild(el('label', { for: `u${i}`, title: v.full }, `<b>U${SUB[i]}</b> ${esc(v.short)}`));
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

  const co = $('ctlCoef');
  co.appendChild(el('p', { class: 'note' }, 'Функции влияния fₖ(Xⱼ) = a + b·Xⱼ, найденные авторами статьи регрессионным анализом.'));
  co.appendChild(el('div', { class: 'row3 head' }, '<span>Функция</span><span></span><span style="text-align:right">a</span><span style="text-align:right">b</span>'));
  P.coef.forEach((c, k) => {
    const row = el('div', { class: 'row3' });
    row.appendChild(el('label', { for: `ca${k}` }, `f${SUB[k]}(X${SUB[c.arg]})`));
    row.appendChild(el('span'));
    const ia = numInput(`ca${k}`, c.a, '-5', '5', '0.01', (v) => { P.coef[k].a = v; });
    const ib = numInput(`cb${k}`, c.b, '-5', '5', '0.01', (v) => { P.coef[k].b = v; });
    ia.setAttribute('aria-label', `a для f${k + 1}`);
    ib.setAttribute('aria-label', `b для f${k + 1}`);
    row.append(ia, ib);
    co.appendChild(row);
    inputs.coef.push([ia, ib]);
  });

  const dict = (a: Item[]): string => a.map((v) => `<div><b>${v.s}</b><span>${esc(v.full)}</span></div>`).join('');
  $('about').innerHTML =
    '<p>Система из восьми дифференциальных уравнений описывает, как внешние факторы и переменные влияют друг на друга. Решение ищется методом Рунге — Кутты 4-го порядка.</p>' +
    '<pre>dX₁/dt = F₃ − f₁(X₂)·f₂(X₃)·f₃(X₄)\n' +
    'dX₂/dt = (F₁+F₂+F₄)·f₄(X₄)·f₅(X₆)·f₆(X₇) − (F₃+F₅)·f₇(X₈)\n' +
    'dX₃/dt = F₄·f₈(X₇) − (F₃+F₅)·f₉(X₁)\n' +
    'dX₄/dt = F₂·f₁₀(X₂)·f₁₁(X₇) − (F₃+F₅)·f₁₂(X₁)\n' +
    'dX₅/dt = f₁₃(X₂) − F₅\n' +
    'dX₆/dt = F₂·f₁₄(X₂) − F₅\n' +
    'dX₇/dt = F₂·f₁₅(X₂)·f₁₆(X₃)·f₁₇(X₄) − (F₃+F₅)\n' +
    'dX₈/dt = F₅ − f₁₈(X₂)</pre>' +
    '<p><b>Допущения калькулятора</b></p><ul>' +
    '<li>Время t нормировано: 0 соответствует первому году периода, 1 последнему. При значениях по умолчанию период 2011–2023 годов.</li>' +
    '<li>Начальные значения X(0) в статье не приведены. По умолчанию подобраны так, чтобы все переменные оставались внутри диапазона от 0 до 1, а число происшествий менялось слабо, как на графике авторов. Их можно изменить.</li>' +
    '<li>Опубликованные коэффициенты слабо связывают повторяемость причин X₃ с числом происшествий X₂, поэтому многократный рост происшествий, показанный на рис. 5 статьи, этой системой не воспроизводится.</li>' +
    '<li>Проверка расчёта: значения совпали с отдельной реализацией на Python, а без ограничения диапазона и с решателем DOP853, расхождение не больше 1e-11.</li></ul>' +
    `<p><b>Обозначения</b></p><div class="dict">${dict(VAR)}${dict(FAC)}</div>`;
}

function syncInputs(): void {
  P.factors.forEach((fc, j) => {
    inputs.f[j][0].value = String(fc.a);
    inputs.f[j][1].value = String(fc.b);
    inputs.f[j][2].value = String(P.scale[j]);
  });
  P.x0.forEach((v, i) => { inputs.x0[i][0].value = String(v); inputs.x0[i][1].textContent = f2(v); });
  P.extra.forEach((v, i) => { inputs.u[i].value = String(v); });
  P.coef.forEach((c, k) => { inputs.coef[k][0].value = String(c.a); inputs.coef[k][1].value = String(c.b); });
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
      const keep = { years: P.years, substeps: P.substeps, clamp: P.clamp };
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
      `<i style="--c:${col(i)}"></i><b style="font-weight:600">${it.s}</b> ${esc(it.short)}`);
    b.addEventListener('click', () => {
      const k = sel.indexOf(i);
      if (k >= 0) { if (sel.length > 1) sel.splice(k, 1); } else sel.push(i);
      sel.sort((a, c) => a - c);
      render();
    });
    host.appendChild(b);
  });
}

function render(): void {
  pending = false;
  const base = Object.assign(defaults(), { years: P.years, substeps: P.substeps, clamp: P.clamp });
  const cur = solve(P);
  const bas = solve(base);
  const same = JSON.stringify(cur.rows) === JSON.stringify(bas.rows);
  const years = Array.from({ length: P.years + 1 }, (_, i) => String(startYear + i));
  const last = P.years;

  const x2 = cur.rows[last][1];
  const x2b = bas.rows[last][1];
  const x20 = cur.rows[0][1];
  const rel = x2b === 0 ? 0 : ((x2 - x2b) / x2b) * 100;
  let pill: string;
  if (same || Math.abs(rel) < 0.5) pill = '<span class="pill neutral">без изменений</span>';
  else if (rel < 0) pill = `<span class="pill good"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v10M3 8l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2"/></svg>${f2(Math.abs(rel))}% меньше</span>`;
  else pill = `<span class="pill bad"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 12V2M3 6l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2"/></svg>${f2(rel)}% больше</span>`;
  const dRun = x2 - x20;
  $('tiles').innerHTML =
    `<div class="tile"><div class="k">Происшествия X₂, ${years[last]}</div><div class="v">${f2(x2)}</div><div class="s">нормированное значение</div></div>` +
    `<div class="tile"><div class="k">К базовому сценарию</div><div class="v" style="font-family:var(--font-body);font-size:20px;padding-top:8px">${pill}</div><div class="s">базовый: ${f2(x2b)}</div></div>` +
    `<div class="tile"><div class="k">Изменение за период</div><div class="v">${dRun >= 0 ? '+' : '−'}${f2(Math.abs(dRun))}</div><div class="s">с ${f2(x20)} в ${years[0]}</div></div>`;

  $('keyline').innerHTML = same ? '' : '<svg viewBox="0 0 26 8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--muted)" stroke-width="2" stroke-dasharray="5 4"/></svg> пунктир: базовый сценарий';

  buildLegend($('legend'), VAR, shown);
  lineChart($('chart1'), {
    x: years, showBase: !same, directLabels: shown.length <= 4,
    aria: 'График нормированных значений переменных модели по годам',
    series: shown.map((i) => ({ sym: VAR[i].s, color: col(i), values: cur.rows.map((r) => r[i]), base: bas.rows.map((r) => r[i]) }))
  });

  buildLegend($('legendF'), FAC, shownF);
  lineChart($('chart2'), {
    x: years, showBase: false, directLabels: shownF.length <= 4, minHi: 1,
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
