// Jednoduchý počítačový hráč. Slouží k testům a jako soupeř pro hru jednoho hráče.

import { CELLS } from './constants.js';
import { neighbors4 } from './geometry.js';
import { createRng, int, pick } from './rng.js';
import { currentItem } from './game.js';

const UNKNOWN = new Set(['', 'down', 'radar', 'ship']);

function chooseTarget(state, rng) {
  const me = state.players[state.current];
  const item = currentItem(state);
  const known = me.known;
  // Dobíjení zasažených lodí: sousedé zásahů a odhalených dílků.
  const hot = [];
  for (let c = 0; c < CELLS; c++) {
    if (known[c] === 'hit' || known[c] === 'radar' || known[c] === 'ship') {
      if (known[c] !== 'hit' && item.pattern !== 'reveal') hot.push(c);
      for (const n of neighbors4(c)) if (UNKNOWN.has(known[n]) && known[n] !== 'ship') hot.push(n);
    }
  }
  if (item.pattern !== 'sonar4' && item.pattern !== 'sonar2' && hot.length) return pick(rng, hot);
  const free = [];
  for (let c = 0; c < CELLS; c++) if (!known[c]) free.push(c);
  return free.length ? pick(rng, free) : int(rng, CELLS);
}

export function botAction(state, rng = createRng(state.turn * 7919 + 1)) {
  const o = state.options || {};
  switch (state.phase) {
    case 'start': return { type: 'rollStart' };
    case 'place-mine': return { type: 'placeMine', cell: pick(rng, o.cells) };
    case 'roll-double': return { type: 'rollDouble' };
    case 'roll-domain': return { type: 'rollDomain' };
    case 'roll-ship': return { type: 'rollShip' };
    case 'choose-ship': return { type: 'chooseShip', index: o.ships[0] };
    case 'choose-land': {
      const enabled = o.choices.filter((c) => c.enabled);
      const cannons = enabled.find((c) => c.id === 'cannons');
      return { type: 'chooseLand', choice: (cannons && int(rng, 3) > 0 ? cannons : pick(rng, enabled)).id };
    }
    case 'roll-cannon': return { type: 'rollCannon' };
    case 'roll-bonus': return { type: 'rollBonus' };
    case 'roll-seek': return { type: 'rollSeek' };
    case 'choose-mode': return { type: 'chooseMode', mode: pick(rng, o.modes).id };
    case 'aim': return { type: 'fire', cell: chooseTarget(state, rng) };
    case 'extra-roll': return { type: 'rollExtra' };
    case 'choose-bonus': return { type: 'chooseBonus', choice: state.pending.options[0].id };
    case 'end': return { type: 'endTurn' };
    default: return null;
  }
}
