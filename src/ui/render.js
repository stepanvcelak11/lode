// Jak vypadá které políčko – vlastní plocha a plocha soupeře (co o ní vím).
//
// Každé políčko má tři vrstvy:
//   terén  (t-sea / t-land / t-fog)            – pozadí políčka
//   kus    (p-ship / p-struct / p-reveal)       – ::before, spojuje se se sousedy (jn/je/js/jw)
//   značka (m-hit / m-miss / m-sunk / …)        – ::after, zásahy a nálezy
// a volitelně ikonu (SVG uvnitř políčka).

import { SHIP_TYPES, STRUCTURE_TYPES, WIDTH, HEIGHT } from '../engine/constants.js';
import { occupancy } from '../engine/layout.js';
import { KNOWN_NAMES } from '../engine/game.js';
import { label, xOf, yOf, idx } from '../engine/geometry.js';

const DIRS = [['jn', 0, 1], ['je', 1, 0], ['js', 0, -1], ['jw', -1, 0]];

function neighbor(i, dx, dy) {
  const x = xOf(i) + dx, y = yOf(i) + dy;
  return x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT ? -1 : idx(x, y);
}

// Spojení s okolními políčky téhož kusu (loď, stavba).
function joins(i, same) {
  const out = [];
  for (const [name, dx, dy] of DIRS) {
    const n = neighbor(i, dx, dy);
    if (n !== -1 && same(n)) out.push(name);
  }
  return out;
}

// Zaoblené rohy pobřeží – roh se zaoblí, když obě sousední strany jsou moře.
// Okraj plochy bereme jako pevninu (pevnina „pokračuje“ za okraj).
function coast(i, isLand) {
  const land = (dx, dy) => {
    const n = neighbor(i, dx, dy);
    return n === -1 || isLand(n);
  };
  const out = [];
  if (!land(0, 1) && !land(-1, 0)) out.push('rtl');
  if (!land(0, 1) && !land(1, 0)) out.push('rtr');
  if (!land(0, -1) && !land(-1, 0)) out.push('rbl');
  if (!land(0, -1) && !land(1, 0)) out.push('rbr');
  return out;
}

// Políčko, na kterém se u vícepolíčkové stavby ukáže ikona (levé horní).
function iconCell(cells) {
  return [...cells].sort((a, b) => yOf(b) - yOf(a) || xOf(a) - xOf(b))[0];
}

// Vlastní plocha: rozmístění + volitelně stav hry (zásahy soupeře, co soupeř ví).
export function ownRenderer(layout, player = null, opponentKnown = null) {
  const occ = occupancy(layout);
  const bows = new Set(layout.ships.map((s) => s.cells[0]));
  const structIcons = new Set(layout.structures.map((s) => iconCell(s.cells)));
  const mines = new Map((player?.mines || []).map((m) => [m.cell, m]));
  return (i) => {
    const cls = [];
    let icon = null;
    let mark = '';
    let title = label(i);
    const land = occ.land[i] === 1;
    cls.push(land ? 't-land' : 't-sea');
    if (land) cls.push(...coast(i, (n) => occ.land[n] === 1));

    const s = occ.ship[i];
    const st = occ.structure[i];
    if (s !== -1) {
      const ship = layout.ships[s];
      cls.push('p-ship', `ship-${ship.type}`, ...joins(i, (n) => occ.ship[n] === s));
      if (bows.has(i)) icon = 'bow';
      if (player?.ships[s]?.sunk) cls.push('sunk');
      title += ` – ${SHIP_TYPES[ship.type].name}`;
    } else if (st !== -1) {
      const struct = layout.structures[st];
      cls.push('p-struct', `st-${struct.type}`, ...joins(i, (n) => occ.structure[n] === st));
      if (structIcons.has(i)) icon = struct.type;
      if (player?.structures[st]?.destroyed) cls.push('destroyed');
      title += ` – ${STRUCTURE_TYPES[struct.type].name}`;
    } else if (occ.island[i]) {
      icon = 'island';
      title += ' – ostrov';
    } else if (occ.lighthouse[i]) {
      icon = 'lighthouse';
      title += ' – maják';
      if (player?.lighthouses.find((l) => l.cell === i)?.used) cls.push('used');
    }
    if (layout.special === i) {
      icon = 'special';
      cls.push('special');
      title += ' – speciální políčko';
      if (player?.special.used) cls.push('used');
    }
    if (mines.has(i)) {
      icon = 'mine';
      title += ' – mina';
      if (mines.get(i).used) cls.push('used');
    }
    if (player?.hits[i]) {
      if (s !== -1) mark = player.ships[s].sunk ? 'm-sunk' : 'm-hit';
      else if (st !== -1) mark = 'm-hit';
      else mark = 'm-miss';
    }
    if (opponentKnown && opponentKnown[i] && opponentKnown[i] !== 'down') {
      cls.push('seen');
      title += ' (soupeř o něm ví)';
    }
    if (mark) cls.push(mark);
    return { cls: cls.join(' '), icon, mark, title };
  };
}

// Plocha soupeře – jen to, co o ní hráč ví. `opponent` slouží jen k tomu,
// aby se potopené lodě a známé stavby vykreslily jako jeden celek.
export function knownRenderer(known, opponent = null) {
  const sunkShip = new Map();
  const structOf = new Map();
  const structIcon = new Map();
  if (opponent) {
    opponent.ships.forEach((s, k) => { if (s.sunk) s.cells.forEach((c) => sunkShip.set(c, k)); });
    opponent.structures.forEach((s, k) => {
      const knownCells = s.cells.filter((c) => known[c] && known[c].includes(':'));
      knownCells.forEach((c) => structOf.set(c, k));
      if (knownCells.length) structIcon.set(k, iconCell(knownCells));
    });
  }
  const isLandKnown = (n) => {
    const k = known[n];
    return !k || k === 'land' || k.includes(':');
  };
  return (i) => {
    const k = known[i];
    let title = label(i);
    if (!k) return { cls: 't-fog', title, mark: '' };
    title += ` – ${KNOWN_NAMES[k] || k}`;
    const cls = [];
    let icon = null;
    let mark = '';
    if (k === 'land' || k.includes(':')) {
      cls.push('t-land', ...coast(i, isLandKnown));
    } else if (k === 'ship' || k === 'radar' || k === 'down') {
      cls.push('t-fog');
    } else {
      cls.push('t-sea');
    }
    switch (k) {
      case 'water': mark = 'm-miss'; break;
      case 'hit': cls.push('p-ship', 'ship-unknown'); mark = 'm-hit'; break;
      case 'sunk': {
        const s = sunkShip.get(i);
        const type = s !== undefined ? opponent.ships[s].type : 'unknown';
        cls.push('p-ship', `ship-${type}`, 'sunk');
        if (s !== undefined) cls.push(...joins(i, (n) => sunkShip.get(n) === s && known[n] === 'sunk'));
        mark = 'm-sunk';
        break;
      }
      case 'ship': cls.push('p-reveal'); break;
      case 'island': icon = 'island'; break;
      case 'lighthouse': icon = 'lighthouse'; break;
      case 'lighthousex': icon = 'lighthouse'; cls.push('used'); mark = 'm-x'; break;
      case 'mine': icon = 'mine'; break;
      case 'minex': icon = 'mine'; cls.push('used'); break;
      case 'special': icon = 'special'; cls.push('special'); break;
      case 'specialx': icon = 'special'; cls.push('special', 'used'); break;
      case 'radar': mark = 'm-radar'; break;
      case 'down': mark = 'm-down'; break;
      default:
        if (k.includes(':')) {
          const [kind, type] = k.split(':');
          const sIdx = structOf.get(i);
          cls.push('p-struct', `st-${type}`);
          if (sIdx !== undefined) {
            cls.push(...joins(i, (n) => structOf.get(n) === sIdx));
            if (structIcon.get(sIdx) === i) icon = type;
          } else icon = type;
          if (kind === 'sx') { cls.push('destroyed'); mark = 'm-x'; }
        }
    }
    if (mark) cls.push(mark);
    return { cls: cls.join(' '), icon, mark, title };
  };
}
