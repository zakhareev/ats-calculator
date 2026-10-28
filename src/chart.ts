import { el, f2 } from './dom';

const NS = 'http://www.w3.org/2000/svg';

export interface Series { sym: string; color: string; values: number[]; base?: number[] }
export interface ChartOpts {
  x: string[];
  series: Series[];
  showBase: boolean;
  directLabels: boolean;
  aria: string;
  minHi?: number;
}

function niceStep(span: number): number {
  for (const c of [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10]) if (span / c <= 6) return c;
  return 10;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e;
}

export function lineChart(host: HTMLElement, o: ChartOpts): void {
  host.innerHTML = '';
  const W = Math.max(280, host.clientWidth || 600);
  const H = W < 520 ? 250 : 320;
  const m = { l: 40, r: o.directLabels ? 46 : 16, t: 12, b: 28 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const n = o.x.length;
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of o.series) {
    for (const v of s.values) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (s.base) for (const v of s.base) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  }
  lo = Math.min(0, Math.floor(lo * 10) / 10);
  hi = Math.max(o.minHi ?? 1, Math.ceil(hi * 10) / 10);
  const step = niceStep(hi - lo);
  hi = Math.ceil(hi / step - 1e-9) * step;
  lo = Math.floor(lo / step + 1e-9) * step;
  const X = (i: number): number => m.l + (n === 1 ? 0 : i / (n - 1)) * pw;
  const Y = (v: number): number => m.t + (1 - (v - lo) / (hi - lo)) * ph;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': o.aria, height: H });
  const g = svgEl('g', {});
  svg.appendChild(g);
  for (let v = lo; v <= hi + 1e-9; v += step) {
    const y = Y(v);
    g.appendChild(svgEl('line', { x1: m.l, x2: m.l + pw, y1: y, y2: y, stroke: 'var(--grid)', 'stroke-width': 1 }));
    const t = svgEl('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end' });
    t.textContent = (Math.round(v * 100) / 100).toString().replace('.', ',');
    g.appendChild(t);
  }
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 52))));
  for (let i = 0; i < n; i++) {
    if (i % every !== 0 && i !== n - 1) continue;
    if (i !== n - 1 && n - 1 - i < every / 2) continue;
    const tx = svgEl('text', { x: X(i), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' });
    tx.textContent = o.x[i];
    g.appendChild(tx);
  }
  const path = (vals: number[]): string => vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  for (const s of o.series) {
    if (s.base && o.showBase) {
      g.appendChild(svgEl('path', { d: path(s.base), fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-dasharray': '5 4', opacity: 0.55, 'stroke-linejoin': 'round' }));
    }
  }
  for (const s of o.series) {
    g.appendChild(svgEl('path', { d: path(s.values), fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    g.appendChild(svgEl('circle', { cx: X(n - 1), cy: Y(s.values[n - 1]), r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2 }));
  }
  if (o.directLabels) {
    const labs = o.series.map((s) => ({ y: Y(s.values[n - 1]), s })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 13) labs[k].y = labs[k - 1].y + 13;
    for (const l of labs) {
      const tt = svgEl('text', { x: X(n - 1) + 10, y: l.y + 4, class: 'lab' });
      tt.style.fill = l.s.color;
      tt.textContent = l.s.sym;
      g.appendChild(tt);
    }
  }
  const hv = svgEl('g', { visibility: 'hidden' });
  const vline = svgEl('line', { y1: m.t, y2: m.t + ph, stroke: 'var(--muted)', 'stroke-width': 1, 'stroke-dasharray': '3 3' });
  hv.appendChild(vline);
  const dots = o.series.map((s) => {
    const c = svgEl('circle', { r: 4.5, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2 });
    hv.appendChild(c);
    return c;
  });
  svg.appendChild(hv);
  const hit = svgEl('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' });
  svg.appendChild(hit);
  host.appendChild(svg);
  const tip = el('div', { class: 'tip' });
  tip.hidden = true;
  host.appendChild(tip);

  const move = (ev: PointerEvent): void => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / r.width);
    const idx = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / pw) * (n - 1))));
    const xx = X(idx);
    vline.setAttribute('x1', String(xx));
    vline.setAttribute('x2', String(xx));
    o.series.forEach((s, q) => { dots[q].setAttribute('cx', String(xx)); dots[q].setAttribute('cy', String(Y(s.values[idx]))); });
    hv.setAttribute('visibility', 'visible');
    const rows = o.series.map((s) => {
      const diff = s.base && o.showBase && Math.abs(s.base[idx] - s.values[idx]) > 0.0005;
      const extra = diff ? ` <span style="color:var(--muted)">(баз. ${f2(s.base![idx])})</span>` : '';
      return `<div><span class="n"><i style="--c:${s.color}"></i>${s.sym}</span><em>${f2(s.values[idx])}${extra}</em></div>`;
    }).join('');
    tip.innerHTML = `<b>${o.x[idx]}</b>${rows}`;
    tip.hidden = false;
    const tw = tip.offsetWidth;
    let left = xx + 14;
    if (left + tw > W - 4) left = xx - tw - 14;
    tip.style.left = `${Math.max(4, left)}px`;
  };
  const leave = (): void => { hv.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', leave);
}
