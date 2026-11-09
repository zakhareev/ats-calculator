import type { Params } from './model';

export interface Item { s: string; short: string; full: string }

export const VAR: Item[] = [
  { s: 'Xпроис', short: 'Происшествия', full: 'Число авиационных происшествий в год' },
  { s: 'Xстар', short: 'Старые ВС', full: 'Доля воздушных судов старше 15 лет' },
  { s: 'Xнаруш', short: 'Нарушения и ошибки', full: 'Количество нарушений и ошибок пилотов в год' },
  { s: 'Xбил', short: 'Проданные билеты', full: 'Количество проданных авиабилетов в год' },
  { s: 'Xчел', short: 'Человеческий фактор', full: 'Влияние человеческого фактора в происшествиях' },
  { s: 'Xтех', short: 'Технический фактор', full: 'Влияние технического фактора в происшествиях' },
  { s: 'Xнов', short: 'Новые ВС', full: 'Доля новых воздушных судов' },
  { s: 'Xтрен', short: 'Тренажёры', full: 'Среднее время тренировок на сертифицированных тренажёрах, дней в год' },
  { s: 'Xконтр', short: 'Контроль контрафакта', full: 'Показатель активности органов контроля за оборотом контрафакта' },
  { s: 'Xповт', short: 'Повторяемость причин', full: 'Повторяемость причин происшествий' }
];

export const FAC: Item[] = [
  { s: 'Price', short: 'Цена топлива', full: 'Стоимость авиатоплива' },
  { s: 'For', short: 'Иностранные ВС', full: 'Доля иностранных самолётов' },
  { s: 'Dol', short: 'Курс доллара', full: 'Валютный курс доллара' },
  { s: 'Covid', short: 'Covid', full: 'Влияние пандемии' },
  { s: 'Law', short: 'Нормативные акты', full: 'Количество нормативно-правовых актов, относящихся к авиации' }
];

const SUBS = '₀₁₂₃₄₅₆₇₈₉';
export const sub = (n: number): string => String(n).split('').map((d) => SUBS[Number(d)]).join('');

export interface Preset { id: string; name: string; set: (p: Params) => void }

export const PRESETS: Preset[] = [
  { id: 'base', name: 'Базовый', set: () => {} },
  { id: 'law', name: 'Больше нормативных актов (Law ×1,3)', set: (p) => { p.scale[4] = 1.3; } },
  { id: 'price', name: 'Дорогое топливо (Price ×1,3)', set: (p) => { p.scale[0] = 1.3; } },
  { id: 'for', name: 'Больше иностранных ВС (For ×1,3)', set: (p) => { p.scale[1] = 1.3; } },
  { id: 'dol', name: 'Дорогой доллар (Dol ×1,3)', set: (p) => { p.scale[2] = 1.3; } },
  { id: 'nocovid', name: 'Без влияния Covid (Covid ×0)', set: (p) => { p.scale[3] = 0; } },
  { id: 'train', name: 'Больше тренировок (Uтрен +0,2)', set: (p) => { p.extra[7] = 0.2; } }
];
