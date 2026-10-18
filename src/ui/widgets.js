// Opakovaně používané prvky: siluety lodí, flotila, náhled střely, legenda.

import { SHIP_TYPES, SHIP_ORDER } from '../engine/constants.js';
import { normalizeShape, xOf, yOf } from '../engine/geometry.js';
import { h } from './dom.js';
import { ICONS } from './icons.js';

// Miniaturní tvar z [[dx,dy],...]. `marks` = Map(index -> třída) pro jednotlivé dílky.
export function shapeEl(shape, { cls = '', marks = new Map(), bow = false } = {}) {
  if (!shape?.length) return h('div', { class: `shape ${cls}` });
  const n = normalizeShape(shape);
  const w = Math.max(...n.map((p) => p[0])) + 1;
  const hh = Math.max(...n.map((p) => p[1])) + 1;
  const at = new Map(n.map((p, k) => [p.join(','), k]));
  const grid = h('div', { class: `shape ${cls}`, style: { gridTemplateColumns: `repeat(${w}, var(--u))`, gridTemplateRows: `repeat(${hh}, var(--u))` } });
  for (let y = hh - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) {
      const k = at.get(`${x},${y}`);
      if (k === undefined) { grid.append(h('i')); continue; }
      const c = ['on'];
      if (bow && k === 0) c.push('bow');
      if (marks.has(k)) c.push(marks.get(k));
      // spoje se sousedy, ať tvar působí jako jeden kus
      for (const [name, dx, dy] of [['jn', 0, 1], ['je', 1, 0], ['js', 0, -1], ['jw', -1, 0]]) {
        if (at.has(`${x + dx},${y + dy}`)) c.push(name);
      }
      grid.append(h('i', { class: c.join(' ') }));
    }
  }
  return grid;
}

export function cellsShape(cells) {
  return cells.map((c) => [xOf(c), yOf(c)]);
}

export function shipSilhouette(type, cells = null, opts = {}) {
  const shape = cells ? cellsShape(cells) : (SHIP_TYPES[type].shape || [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
  return shapeEl(shape, { ...opts, cls: `sil ship-${type} ${opts.cls || ''}` });
}

// Flotila: vlastní (se zásahy) nebo soupeřova (jen co je potopené).
export function fleetStrip(player, { own }) {
  const items = [];
  for (const type of SHIP_ORDER) {
    player.ships.forEach((s) => {
      if (s.type !== type) return;
      const marks = new Map();
      if (own) s.hit.forEach((hit, k) => { if (hit) marks.set(k, 'hit'); });
      const sil = shipSilhouette(type, own ? s.cells : null, { marks, cls: s.sunk ? 'sunk' : '' });
      items.push(h('div', { class: `fleet-item${s.sunk ? ' sunk' : ''}`, title: `${SHIP_TYPES[type].name}${s.sunk ? ' – potopena' : ''}` }, sil));
    });
  }
  const alive = player.ships.filter((s) => !s.sunk).length;
  return h('div', { class: 'fleet' },
    h('div', { class: 'fleet-head' }, h('span', {}, own ? 'Moje flotila' : 'Flotila soupeře'), h('b', {}, `${alive} / ${player.ships.length}`)),
    h('div', { class: 'fleet-row' }, items));
}

const PATTERN_SHAPES = {
  single: [[0, 0]],
  line3: [[-1, 0], [0, 0], [1, 0]],
  nine: [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
  bomber: [[0, -1], [0, 0], [0, 1], [0, 2]],
  bomber3: [[0, -1], [0, 0], [0, 1]],
  plus: [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]],
  sonar4: Array.from({ length: 16 }, (_, k) => [k % 4, -Math.floor(k / 4)]),
  sonar2: [[0, 0], [1, 0], [0, -1], [1, -1]],
  reveal: [[0, 0]],
  guided: [[0, 0]],
};

export function patternEl(pattern, uloShot = null, count = 1) {
  const shape = pattern === 'ulo' ? uloShot : PATTERN_SHAPES[pattern] || [[0, 0]];
  const el = shapeEl(shape, { cls: `pat pat-${pattern}` });
  if (count <= 1) return el;
  return h('div', { class: 'pat-multi' }, el, h('span', { class: 'pat-count' }, `× ${count}`));
}

// Ukázka políčka pro legendu – stejné třídy jako na ploše.
function sample(cls, iconName = null) {
  const el = h('span', { class: `cell sample ${cls}` });
  if (iconName) el.innerHTML = ICONS[iconName];
  return el;
}

export function legendEl() {
  const groups = [
    ['Plocha soupeře', [
      [sample('t-fog'), 'Neprozkoumané moře'],
      [sample('t-sea m-miss'), 'Voda – vedle'],
      [sample('t-sea p-ship ship-unknown m-hit'), 'Zásah lodi'],
      [h('span', { class: 'sample-pair' }, sample('t-sea p-ship ship-bitevni sunk m-sunk je'), sample('t-sea p-ship ship-bitevni sunk m-sunk jw')), 'Potopená loď'],
      [sample('t-fog p-reveal'), 'Odhalená loď (zatím bez zásahu)'],
      [sample('t-fog m-radar'), 'Sonar: něco tu je'],
      [sample('t-fog m-down'), 'Střela sestřelena obranou'],
      [sample('t-land'), 'Pevnina'],
      [sample('t-land p-struct destroyed m-x', 'DI'), 'Zničená stavba'],
    ]],
    ['Terén a stavby', [
      [sample('t-sea', 'island'), 'Ostrov'],
      [sample('t-sea', 'lighthouse'), 'Maják'],
      [sample('t-sea special', 'special'), 'Speciální políčko'],
      [sample('t-sea', 'mine'), 'Mina'],
      [sample('t-land p-struct', 'Z'), 'Základna (2×2)'],
      [sample('t-land p-struct', 'P'), 'Přístav (2×1)'],
      [sample('t-land p-struct', 'V'), 'Vzdušná obrana (2×1)'],
      [sample('t-land p-struct', 'DI'), 'Dělo 1 – obyčejné'],
      [sample('t-land p-struct', 'DII'), 'Dělo 2 – naváděné střely'],
      [sample('t-land p-struct', 'H'), 'Hledač (3 pole)'],
    ]],
    ['Moje plocha', [
      [sample('t-sea p-ship ship-ponorka', 'bow'), 'Příď lodi'],
      [sample('t-sea p-ship ship-ponorka m-hit'), 'Moje zasažená loď'],
      [sample('t-sea m-miss'), 'Soupeř střílel vedle'],
      [sample('t-sea seen'), 'Políčko, o kterém soupeř ví'],
    ]],
  ];
  return h('div', { class: 'legend' }, groups.map(([title, rows]) => h('section', {},
    h('h3', {}, title),
    h('ul', {}, rows.map(([s, text]) => h('li', {}, s, h('span', {}, text)))))));
}
