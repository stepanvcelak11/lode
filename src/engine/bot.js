// Počítačový hráč ve třech obtížnostech. Slouží i k testům.
//
//   easy   – střílí většinou naslepo, volby dělá náhodně
//   normal – po zásahu dorazí okolí, jinak střílí náhodně
//   hard   – počítá „mapu pravděpodobnosti“, kde mohou ležet zbývající lodě
//            (respektuje pravidla rozmístění), vyhýbá se vzdušné obraně
//            a volí útoky i bonusy s rozmyslem

import { CELLS, SHIP_TYPES, AIR_DEFENSE_RANGE } from './constants.js';
import {
  neighbors4, neighbors8, transformShape, placeShape, shapeKey, distanceToSet,
} from './geometry.js';
import { createRng, int, pick, next } from './rng.js';
import { currentItem, patternCells, effectivePattern } from './game.js';

export const LEVELS = ['easy', 'normal', 'hard'];

// Políčka, kde soupeřova loď určitě není.
const NOT_SHIP = new Set(['water', 'island', 'land', 'lighthouse', 'lighthousex', 'mine', 'minex', 'special', 'specialx', 'sunk']);
const isStruct = (k) => k.startsWith('s:') || k.startsWith('sx:');
const blocked = (k) => NOT_SHIP.has(k) || isStruct(k);
// Neprozkoumaná (nebo jen částečně známá) políčka, kam má smysl střílet.
const OPEN = (k) => !k || k === 'down' || k === 'radar' || k === 'ship';

// Všechny natočení tvarů lodí (bez duplicit).
const SHAPES = {};
for (const [type, def] of Object.entries(SHIP_TYPES)) {
  const shapes = new Map();
  const base = def.shape || [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]; // ULO odhadujeme rovným tvarem
  for (let r = 0; r < 4; r++) for (const m of [false, true]) {
    const s = transformShape(base, r, m);
    shapes.set(shapeKey(s), s);
  }
  SHAPES[type] = [...shapes.values()];
}

// Mapa „tepla“ – v kolika možných polohách zbývajících lodí políčko leží.
export function heatMap(state, me = state.current) {
  const known = state.players[me].known;
  const opp = state.players[1 - me];
  const heat = new Float64Array(CELLS);
  const avoidBig = new Uint8Array(CELLS);
  for (let c = 0; c < CELLS; c++) {
    const k = known[c];
    if (k === 'land' || k === 'island' || k === 'sunk' || k.startsWith('lighthouse') || (isStruct(k) && !k.endsWith(':P'))) {
      for (const n of neighbors8(c)) avoidBig[n] = 1;
    }
  }
  for (const ship of opp.ships) {
    if (ship.sunk) continue;
    const big = SHIP_TYPES[ship.type].big;
    for (const shape of SHAPES[ship.type]) {
      const w = Math.max(...shape.map((p) => p[0]));
      const hgt = Math.max(...shape.map((p) => p[1]));
      for (let y = 0; y < 19 - hgt; y++) {
        for (let x = 0; x < 24 - w; x++) {
          const cells = placeShape(shape, x, y);
          if (!cells) continue;
          let ok = true;
          let hits = 0;
          let seen = 0;
          for (const c of cells) {
            const k = known[c];
            if (blocked(k) || (big && avoidBig[c])) { ok = false; break; }
            if (k === 'hit') hits += 1;
            if (k === 'ship' || k === 'radar') seen += 1;
          }
          if (!ok) continue;
          const weight = (1 + 25 * hits) * (1 + 3 * seen);
          for (const c of cells) if (OPEN(known[c])) heat[c] += weight;
        }
      }
    }
  }
  // Děla stojí na pevnině – neznámá políčka u známé pevniny jsou podezřelá.
  const cannons = opp.structures.filter((x) => (x.type === 'DI' || x.type === 'DII') && !x.destroyed).length;
  if (cannons) {
    const shipsLeft = opp.ships.filter((x) => !x.sunk).length;
    const w = shipsLeft ? 2 : 60;
    for (let c = 0; c < CELLS; c++) {
      if (!OPEN(known[c])) continue;
      const landish = neighbors8(c).filter((n) => known[n] === 'land' || isStruct(known[n])).length;
      heat[c] += landish * w * cannons;
    }
  }
  // Odhalený dílek lodi je jistý cíl.
  for (let c = 0; c < CELLS; c++) if (known[c] === 'ship') heat[c] += 1e6;
  // Kolem zásahů (i u lodí, jejichž tvar neznáme – ULO) přidáme jistotu.
  for (let c = 0; c < CELLS; c++) {
    if (known[c] !== 'hit') continue;
    for (const n of neighbors4(c)) if (OPEN(known[n])) heat[n] += 400;
  }
  return heat;
}

function knownAirDefense(state, me) {
  const known = state.players[me].known;
  const cells = [];
  for (let c = 0; c < CELLS; c++) if (known[c] === 's:V') cells.push(c);
  return cells;
}

// Nejlepší místo pro aktuální střelu podle mapy tepla.
function bestAim(state, rng) {
  const me = state.current;
  const item = currentItem(state);
  const known = state.players[me].known;
  const heat = heatMap(state, me);
  const pat = effectivePattern(state, item);
  const defense = item.pass || pat === 'reveal' || pat.startsWith('sonar') ? [] : knownAirDefense(state, me);
  let best = -1;
  let list = [];
  for (let aim = 0; aim < CELLS; aim++) {
    let score = 0;
    for (const c of patternCells(state, item, aim)) {
      if (!OPEN(known[c])) continue;
      score += heat[c] + 0.01;
    }
    // Hledač a sonar mají cenu jen na neprozkoumaném.
    if (pat === 'reveal' && known[aim]) score = 0;
    if (defense.length && distanceToSet(aim, defense) <= AIR_DEFENSE_RANGE && !defense.includes(aim)) score *= 0.1;
    if (score > best * 1.0001) { best = score; list = [aim]; } else if (score >= best * 0.98) list.push(aim);
  }
  return list.length ? pick(rng, list) : int(rng, CELLS);
}

// Střední obtížnost: dorážení kolem zásahů, jinak náhoda.
function huntAim(state, rng, chance = 1) {
  const me = state.players[state.current];
  const item = currentItem(state);
  const known = me.known;
  const hot = [];
  if (next(rng) < chance) {
    for (let c = 0; c < CELLS; c++) {
      if (known[c] === 'ship' && item.pattern !== 'reveal') hot.push(c);
      if (known[c] === 'hit' || known[c] === 'radar' || known[c] === 'ship') {
        for (const n of neighbors4(c)) if (OPEN(known[n]) && known[n] !== 'ship') hot.push(n);
      }
    }
  }
  if (item.pattern !== 'sonar4' && item.pattern !== 'sonar2' && hot.length) return pick(rng, hot);
  const free = [];
  for (let c = 0; c < CELLS; c++) if (!known[c]) free.push(c);
  return free.length ? pick(rng, free) : int(rng, CELLS);
}

function chooseTarget(state, rng, level) {
  if (level === 'hard') return bestAim(state, rng);
  if (level === 'easy') return huntAim(state, rng, 0.15);
  return huntAim(state, rng, 1);
}

function hasOpenHits(state) {
  return state.players[state.current].known.some((k) => k === 'hit' || k === 'ship');
}

function chooseMode(state, rng, level) {
  const modes = state.options.modes.map((m) => m.id);
  if (level !== 'hard') return pick(rng, modes);
  const attack = state.attack;
  const P = state.players[state.current];
  const ship = attack.source.kind === 'ship' ? P.ships[attack.source.index] : null;
  if (modes.includes('guided')) return 'guided'; // dopadne vždy u lodi = cenná informace
  if (modes.includes('minisonar') && !hasOpenHits(state)) return 'minisonar';
  if (ship?.type === 'bitevni' && modes.includes('nine')) {
    // devítku jen když je kde – v pozdější hře nebo při rozstřílené lodi
    const unknown = P.known.filter((k) => !k).length;
    if (hasOpenHits(state) || unknown < 300 || P.charges.nine === 2 && state.turn > 20) return 'nine';
  }
  if (ship?.type === 'ponorka' && modes.includes('sonar') && !hasOpenHits(state) && next(rng) < 0.5) return 'sonar';
  return modes.includes('normal') ? 'normal' : modes[0];
}

function chooseLand(state, rng, level) {
  const enabled = state.options.choices.filter((c) => c.enabled);
  const byId = (id) => enabled.find((c) => c.id === id);
  if (level === 'easy') return pick(rng, enabled).id;
  if (level === 'hard') {
    const P = state.players[state.current];
    const baseAlive = P.structures.some((s) => s.type === 'Z' && !s.destroyed);
    // Silný bonus základny se vyplatí, když zrovna není co dorážet.
    if (byId('base') && baseAlive && !hasOpenHits(state) && next(rng) < 0.45) return 'base';
    if (byId('cannons')) return 'cannons';
    if (byId('seeker')) return 'seeker';
    return enabled[0].id;
  }
  const cannons = byId('cannons');
  return (cannons && int(rng, 3) > 0 ? cannons : pick(rng, enabled)).id;
}

// Minu dáme tam, kam soupeř nejspíš střílí – těsně k vlastním lodím.
function chooseMine(state, rng, level) {
  const cells = state.options.cells;
  if (level !== 'hard') return pick(rng, cells);
  const P = state.players[state.current];
  const own = new Set(P.ships.filter((s) => !s.sunk).flatMap((s) => s.cells));
  const near = cells.filter((c) => neighbors8(c).some((n) => own.has(n)));
  return pick(rng, near.length ? near : cells);
}

function chooseBonus(state, rng, level) {
  const options = state.pending.options.map((o) => o.id);
  if (level !== 'hard') return pick(rng, options);
  const order = state.pending.kind === 'ban'
    ? ['DII', 'letadlova', 'bitevni', 'DI', 'V', 'Z', 'ulo', 'ponorka', 'H', 'bombarder', 'lodka']
    : ['sonar', 'nine'];
  return order.find((o) => options.includes(o)) || options[0];
}

export function botAction(state, rng = createRng(state.turn * 7919 + 1), level = 'normal') {
  const o = state.options || {};
  switch (state.phase) {
    case 'start': return { type: 'rollStart' };
    case 'place-mine': return { type: 'placeMine', cell: chooseMine(state, rng, level) };
    case 'roll-double': return { type: 'rollDouble' };
    case 'roll-domain': return { type: 'rollDomain' };
    case 'roll-ship': return { type: 'rollShip' };
    case 'choose-ship': return { type: 'chooseShip', index: o.ships[level === 'easy' ? int(rng, o.ships.length) : 0] };
    case 'choose-land': return { type: 'chooseLand', choice: chooseLand(state, rng, level) };
    case 'roll-cannon': return { type: 'rollCannon' };
    case 'roll-bonus': return { type: 'rollBonus' };
    case 'roll-seek': return { type: 'rollSeek' };
    case 'choose-mode': return { type: 'chooseMode', mode: chooseMode(state, rng, level) };
    case 'aim': return { type: 'fire', cell: chooseTarget(state, rng, level) };
    case 'extra-roll': return { type: 'rollExtra' };
    case 'choose-bonus': return { type: 'chooseBonus', choice: chooseBonus(state, rng, level) };
    case 'end': return { type: 'endTurn' };
    default: return null;
  }
}
