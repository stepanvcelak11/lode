// Jak vypadá které políčko – vlastní plocha a plocha soupeře (co o ní vím).

import { SHIP_TYPES, STRUCTURE_TYPES } from '../engine/constants.js';
import { occupancy } from '../engine/layout.js';
import { KNOWN_NAMES } from '../engine/game.js';
import { label } from '../engine/geometry.js';

// Vlastní plocha: rozmístění + volitelně stav hry (zásahy soupeře, co soupeř ví).
export function ownRenderer(layout, player = null, opponentKnown = null) {
  const occ = occupancy(layout);
  const bows = new Set(layout.ships.map((s) => s.cells[0]));
  const mines = new Map((player?.mines || []).map((m) => [m.cell, m]));
  return (i) => {
    const cls = [];
    let text = '';
    let title = label(i);
    const s = occ.ship[i];
    if (occ.land[i]) cls.push('land');
    else cls.push('water');
    if (occ.structure[i] !== -1) {
      const st = layout.structures[occ.structure[i]];
      cls.push('struct');
      text = STRUCTURE_TYPES[st.type].short;
      title += ` – ${STRUCTURE_TYPES[st.type].name}`;
      if (player?.structures[occ.structure[i]]?.destroyed) cls.push('destroyed');
    }
    if (occ.island[i]) { cls.push('island'); text = 'O'; title += ' – ostrov'; }
    if (occ.lighthouse[i]) {
      cls.push('lighthouse');
      text = 'M';
      title += ' – maják';
      if (player?.lighthouses.find((l) => l.cell === i)?.used) cls.push('used');
    }
    if (layout.special === i) {
      cls.push('special');
      text = 'S';
      title += ' – speciální políčko';
      if (player?.special.used) cls.push('used');
    }
    if (mines.has(i)) {
      cls.push('mine');
      text = '✸';
      title += ' – mina';
      if (mines.get(i).used) cls.push('used');
    }
    if (s !== -1) {
      const ship = layout.ships[s];
      cls.push('ship', `ship-${ship.type}`);
      text = bows.has(i) ? '◆' : '';
      title += ` – ${SHIP_TYPES[ship.type].name}`;
      if (player?.ships[s]?.sunk) cls.push('sunk');
    }
    if (player?.hits[i]) { cls.push('hit'); }
    if (opponentKnown && opponentKnown[i]) cls.push('seen');
    return { cls: cls.join(' '), text, title };
  };
}

const KNOWN_TEXT = {
  water: '·', ship: '', hit: '✕', sunk: '✕', island: 'O', land: '', lighthouse: 'M', lighthousex: 'M',
  mine: '✸', minex: '✸', special: 'S', specialx: 'S', radar: '?', down: '⊘',
};

// Plocha soupeře – jen to, co o ní hráč ví.
export function knownRenderer(known) {
  return (i) => {
    const k = known[i];
    let title = label(i);
    if (!k) return { cls: 'fog', title };
    title += ` – ${KNOWN_NAMES[k] || k}`;
    if (k.startsWith('s:') || k.startsWith('sx:')) {
      const type = k.split(':')[1];
      return { cls: `k-struct${k.startsWith('sx') ? ' destroyed' : ''}`, text: STRUCTURE_TYPES[type].short, title };
    }
    return { cls: `k-${k}`, text: KNOWN_TEXT[k] ?? '', title };
  };
}

// Celá plocha soupeře bez mlhy (bonus bunkru č. 5 – ukázka na 1 sekundu).
export function revealAllRenderer(player) {
  return ownRenderer(player.layout, player);
}
