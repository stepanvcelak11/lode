// Herní logika – stavový automat jedné hry pro dva hráče.
//
// Stav je čistý JSON (dá se uložit / poslat po síti). Všechny změny jdou přes
// dispatch(state, action). Náhoda je deterministická (state.rng).

import {
  CELLS, SHIP_TYPES, STRUCTURE_TYPES, SHIP_BY_TWO_DICE, SHIP_BY_ONE_DIE,
  BASE_BONUSES, BUNKER_BONUSES, SPECIAL_BONUSES, NINES_PER_GAME, SONARS_PER_GAME,
  AIR_DEFENSE_RANGE, MINE_RANGE,
} from './constants.js';
import {
  idx, xOf, yOf, inBounds, label, chebyshev, distanceToSet, cellsWithin, lineBlocked, neighbors4,
} from './geometry.js';
import { createRng, die, int, pick, shuffle } from './rng.js';
import { cloneLayout } from './layout.js';

// ---------------------------------------------------------------------------
// Vytvoření hry

function makePlayer(name, layout) {
  return {
    name,
    layout: cloneLayout(layout),
    hits: new Array(CELLS).fill(0),
    ships: layout.ships.map((s) => ({ type: s.type, cells: [...s.cells], hit: s.cells.map(() => false), sunk: false })),
    structures: layout.structures.map((s) => ({ type: s.type, cells: [...s.cells], hit: s.cells.map(() => false), destroyed: false })),
    lighthouses: layout.lighthouses.map((cell) => ({ cell, used: false })),
    mines: [],
    special: { cell: layout.special, used: false },
    charges: { nine: NINES_PER_GAME, sonar: SONARS_PER_GAME },
    effects: [],
    pendingMines: [],
    // Co tento hráč ví o ploše SOUPEŘE (kód pro každé políčko, '' = neznámo).
    known: new Array(CELLS).fill(''),
  };
}

export function createGame({ layouts, names = ['Hráč 1', 'Hráč 2'], seed = Date.now() }) {
  return {
    version: 1,
    rng: createRng(seed),
    players: [makePlayer(names[0], layouts[0]), makePlayer(names[1], layouts[1])],
    current: 0,
    turn: 0,
    phase: 'start',
    options: null,
    attack: null,
    pending: null,
    rolls: [],
    extraTurns: 0,
    doubleRolled: false,
    flash: null,
    winner: null,
    log: [],
  };
}

// ---------------------------------------------------------------------------
// Pomocné funkce

const other = (p) => 1 - p;

function log(state, text, player = state.current) {
  state.log.push({ turn: state.turn, player, text });
}

function roll(state, count, labelText) {
  const values = [];
  for (let i = 0; i < count; i++) values.push(die(state.rng));
  state.rolls.push({ values, label: labelText });
  return values;
}

const sum = (v) => v.reduce((a, b) => a + b, 0);
const isOdd = (n) => n % 2 === 1;

function hasEffect(player, kind, turn) {
  return player.effects.some((e) => e.kind === kind && turn >= e.activeFrom);
}

function findEffect(player, kind, turn) {
  return player.effects.find((e) => e.kind === kind && turn >= e.activeFrom);
}

function addEffect(state, playerIdx, kind, turns, extra = {}) {
  state.players[playerIdx].effects.push({ kind, turnsLeft: turns, activeFrom: state.turn + 1, ...extra });
}

function isBanned(state, playerIdx, target) {
  return state.players[playerIdx].effects.some((e) => e.kind === 'ban' && e.target === target && state.turn >= e.activeFrom);
}

export const aliveShips = (player) => player.ships.filter((s) => !s.sunk);

function structureAlive(player, type) {
  return player.structures.some((s) => s.type === type && !s.destroyed);
}

const cannonAlive = (player, type) => structureAlive(player, type);

function attackersLeft(player) {
  const list = aliveShips(player).map((s) => s.type);
  for (const t of ['DI', 'DII']) if (cannonAlive(player, t)) list.push(t);
  return list;
}

function hasLost(player) {
  return attackersLeft(player).length === 0;
}

// Dodatek 3: poslední útočník, který trefí jen 1 pole -> střely 3×1.
function lastSingleShooter(player) {
  const list = attackersLeft(player);
  return list.length === 1 && ['ponorka', 'lodka', 'DI', 'DII'].includes(list[0]);
}

function shipName(type) {
  return SHIP_TYPES[type].name;
}

// Co je na políčku hráčovy plochy (pohled vlastníka).
function cellContent(player, cell) {
  const shipIdx = player.ships.findIndex((s) => s.cells.includes(cell));
  if (shipIdx !== -1) return { kind: 'ship', index: shipIdx };
  if (player.layout.islands.includes(cell)) return { kind: 'island' };
  const sIdx = player.structures.findIndex((s) => s.cells.includes(cell));
  if (sIdx !== -1) return { kind: 'structure', index: sIdx };
  const lh = player.lighthouses.findIndex((l) => l.cell === cell);
  if (lh !== -1) return { kind: 'lighthouse', index: lh };
  if (player.layout.land.includes(cell)) return { kind: 'land' };
  return { kind: 'water' };
}

// ---------------------------------------------------------------------------
// Tvary střel

export function patternCells(state, item, aim, attackerIdx = state.current) {
  const p = state.players[attackerIdx];
  const x = xOf(aim), y = yOf(aim);
  const pts = [];
  switch (effectivePattern(state, item, attackerIdx)) {
    case 'single': case 'reveal': case 'guided': pts.push([x, y]); break;
    case 'line3': pts.push([x - 1, y], [x, y], [x + 1, y]); break;
    case 'nine': for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) pts.push([x + dx, y + dy]); break;
    case 'bomber': for (let dy = -1; dy <= 2; dy++) pts.push([x, y + dy]); break;
    case 'bomber3': for (let dy = -1; dy <= 1; dy++) pts.push([x, y + dy]); break;
    case 'plus': pts.push([x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]); break;
    case 'ulo': for (const [dx, dy] of p.layout.uloShot) pts.push([x + dx, y + dy]); break;
    case 'sonar4': for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) pts.push([x + dx, y - dy]); break;
    case 'sonar2': for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) pts.push([x + dx, y - dy]); break;
    default: pts.push([x, y]);
  }
  return pts.filter(([a, b]) => inBounds(a, b)).map(([a, b]) => idx(a, b));
}

// Úprava tvaru podle bonusu bunkru č. 6 a dodatku č. 3.
export function effectivePattern(state, item, attackerIdx = state.current) {
  const p = state.players[attackerIdx];
  const widen = hasEffect(p, 'bunker6', state.turn) || lastSingleShooter(p);
  if (!widen) return item.pattern;
  if (item.pattern === 'single' || item.pattern === 'guided') return 'line3';
  if (item.pattern === 'bomber' || item.pattern === 'bomber3') return hasEffect(p, 'bunker6', state.turn) ? 'plus' : item.pattern;
  return item.pattern;
}

export const PATTERN_NAMES = {
  single: 'střela 1×1', line3: 'střela 3×1', nine: 'devítka 3×3', bomber: 'bomba 1×4',
  bomber3: 'bomba 1×3', plus: 'bomba do plusu', ulo: 'střela ULO', sonar4: 'sonar 4×4',
  sonar2: 'mini-sonar 2×2', reveal: 'odhalení políčka', guided: 'naváděná střela',
};

export function currentItem(state) {
  return state.attack && state.attack.queue.length ? state.attack.queue[0] : null;
}

// ---------------------------------------------------------------------------
// Průběh tahu

function beginTurn(state) {
  state.turn += 1;
  state.attack = null;
  state.pending = null;
  state.options = null;
  state.flash = null;
  state.doubleRolled = false;
  const p = state.players[state.current];
  log(state, `— Tah ${state.turn}: hraje ${p.name} —`);
  if (hasEffect(p, 'double', state.turn)) {
    state.extraTurns += 1;
    log(state, 'Bonus ze speciálního políčka: v tomto kole hraješ dvakrát.');
    p.effects = p.effects.filter((e) => e.kind !== 'double');
  }
  continueTurnStart(state);
}

function continueTurnStart(state) {
  const p = state.players[state.current];
  if (p.pendingMines.length) {
    state.phase = 'place-mine';
    state.options = { cells: validMineCells(p, p.pendingMines[0]) };
    if (!state.options.cells.length) {
      log(state, 'Minu nebylo kam umístit.');
      p.pendingMines.shift();
      return continueTurnStart(state);
    }
    return;
  }
  if (hasEffect(p, 'base4', state.turn) && !state.doubleRolled) {
    state.phase = 'roll-double';
    return;
  }
  state.phase = 'roll-domain';
}

export function validMineCells(player, pending) {
  const out = [];
  const shipCells = new Set(player.ships.flatMap((s) => s.cells));
  const islands = new Set(player.layout.islands);
  const lighthouses = new Set(player.lighthouses.map((l) => l.cell));
  const mines = new Set(player.mines.map((m) => m.cell));
  for (let c = 0; c < CELLS; c++) {
    if (shipCells.has(c) || islands.has(c) || lighthouses.has(c) || mines.has(c)) continue;
    if (c === player.special.cell || player.hits[c]) continue;
    if (distanceToSet(c, pending.origin) > MINE_RANGE) continue;
    out.push(c);
  }
  return out;
}

function shipTypeAvailable(state, playerIdx, type, ignoreBans = false) {
  const p = state.players[playerIdx];
  return p.ships.some((s) => s.type === type && !s.sunk) && (ignoreBans || !isBanned(state, playerIdx, type));
}

function landOptions(state) {
  const pi = state.current;
  const p = state.players[pi];
  const cannons = ['DI', 'DII'].some((t) => cannonAlive(p, t) && !isBanned(state, pi, t));
  const baseAlive = structureAlive(p, 'Z');
  return [
    { id: 'cannons', label: 'Děla', enabled: cannons },
    { id: 'base', label: baseAlive ? 'Základna' : 'Bunkr', enabled: !isBanned(state, pi, 'Z') },
    { id: 'seeker', label: 'Hledač', enabled: structureAlive(p, 'H') && !isBanned(state, pi, 'H') },
  ];
}

function goLand(state) {
  state.phase = 'choose-land';
  state.options = { choices: landOptions(state) };
  if (!state.options.choices.some((c) => c.enabled)) {
    log(state, 'Na pevnině nemáš nic, čím bys mohl hrát.');
    state.phase = 'end';
  }
}

function rollShipType(state, playerIdx, purpose, ignoreBans = false) {
  const p = state.players[playerIdx];
  const available = Object.keys(SHIP_TYPES).filter((t) => shipTypeAvailable(state, playerIdx, t, ignoreBans));
  if (!available.length) return null;
  const oneDie = hasEffect(state.players[state.current], 'base3', state.turn);
  // Dodatek 4: zbývá jen ponorka a bitevní loďka -> sudé loďka, liché ponorka.
  if (available.length === 2 && available.includes('ponorka') && available.includes('lodka') && aliveShips(p).every((s) => ['ponorka', 'lodka'].includes(s.type))) {
    const v = roll(state, 1, `${purpose} (sudé loďka, liché ponorka)`);
    return isOdd(v[0]) ? 'ponorka' : 'lodka';
  }
  for (let guard = 0; guard < 200; guard++) {
    const v = roll(state, oneDie ? 1 : 2, purpose);
    const type = oneDie ? SHIP_BY_ONE_DIE[v[0]] : SHIP_BY_TWO_DICE[sum(v)];
    if (available.includes(type)) return type;
    log(state, `Padlo ${sum(v)} – ${shipName(type)} není k dispozici, hází se znovu.`);
  }
  return pick(state.rng, available);
}

// ---------------------------------------------------------------------------
// Útok

function shotMultiplier(state) {
  return hasEffect(state.players[state.current], 'base1', state.turn) ? 3 : 1;
}

function shipModes(state, ship) {
  const pi = state.current;
  const p = state.players[pi];
  const triple = shotMultiplier(state) === 3;
  const radarBanned = hasEffect(p, 'noRadar', state.turn);
  const n = (k) => k * (triple ? 3 : 1);
  const modes = [];
  switch (ship.type) {
    case 'letadlova':
      modes.push({ id: 'normal', label: `${n(3)} střely`, items: rep(n(3), 'single'), extra: 'single' });
      break;
    case 'bitevni':
      modes.push({ id: 'normal', label: `${n(2)} střely`, items: rep(n(2), 'single') });
      if (p.charges.nine > 0 && !radarBanned) modes.push({ id: 'nine', label: `Devítka 3×3 (zbývá ${p.charges.nine})`, items: rep(1, 'nine'), cost: 'nine' });
      break;
    case 'ponorka':
      modes.push({ id: 'normal', label: `${n(1)} střela`, items: rep(n(1), 'single') });
      if (p.charges.sonar > 0 && !radarBanned) modes.push({ id: 'sonar', label: `Sonar 4×4 (zbývá ${p.charges.sonar})`, items: rep(1, 'sonar4', { pass: true }), cost: 'sonar' });
      if (triple && !radarBanned) modes.push({ id: 'minisonar', label: '2× mini-sonar 2×2 (bonus)', items: rep(2, 'sonar2', { pass: true }) });
      break;
    case 'lodka':
      modes.push({ id: 'normal', label: `${n(1)} střela`, items: rep(n(1), 'single') });
      break;
    case 'bombarder':
      modes.push(triple
        ? { id: 'normal', label: '3× bomba 1×3 (bonus)', items: rep(3, 'bomber3') }
        : { id: 'normal', label: 'Bomba 1×4', items: rep(1, 'bomber') });
      break;
    case 'ulo':
      modes.push({ id: 'normal', label: triple ? '2× střela ULO (bonus)' : 'Střela ULO', items: rep(triple ? 2 : 1, 'ulo') });
      break;
    default:
  }
  return modes;
}

function cannonModes(state, type) {
  const triple = shotMultiplier(state) === 3;
  const n = (k) => k * (triple ? 3 : 1);
  const defender = state.players[other(state.current)];
  if (type === 'DI') {
    return [{ id: 'normal', label: `${n(1)} střela (neprochází obranou)`, items: rep(n(1), 'single', { pass: true }), extra: 'single', extraPass: true }];
  }
  const modes = [];
  if (aliveShips(defender).length) {
    modes.push({ id: 'guided', label: `${n(2)} naváděné střely`, items: rep(n(2), 'guided'), extra: 'guided' });
  }
  modes.push({ id: 'ordinary', label: `${n(1)} obyčejná střela`, items: rep(n(1), 'single') });
  return modes;
}

function rep(n, pattern, extra = {}) {
  return Array.from({ length: n }, () => ({ pattern, ...extra }));
}

function startAttack(state, source, modes) {
  state.attack = { source, modes, queue: [], extra: null, extraPass: false, mode: null };
  if (modes.length === 1) return chooseMode(state, modes[0].id);
  state.phase = 'choose-mode';
  state.options = { modes: modes.map(({ id, label: l }) => ({ id, label: l })) };
}

function chooseMode(state, modeId) {
  const a = state.attack;
  const mode = a.modes.find((m) => m.id === modeId);
  if (!mode) throw new Error('Neznámý způsob útoku.');
  const p = state.players[state.current];
  a.mode = modeId;
  a.queue = mode.items.map((it) => ({ ...it }));
  a.extra = mode.extra || null;
  a.extraPass = !!mode.extraPass;
  if (mode.cost === 'nine') p.charges.nine -= 1;
  if (mode.cost === 'sonar') p.charges.sonar -= 1;
  // Bonus základny č. 2: padlá loď (mimo loďky) navíc devítka, děla +1 střelu.
  if (hasEffect(p, 'base2', state.turn)) {
    if (a.source.kind === 'ship' && p.ships[a.source.index].type !== 'lodka' && !hasEffect(p, 'noRadar', state.turn)) {
      a.queue.push({ pattern: 'nine', free: true });
    } else if (a.source.kind === 'cannon') {
      const last = mode.items[mode.items.length - 1];
      a.queue.push({ ...last });
    }
  }
  log(state, `Útok: ${sourceName(state, a.source)} – ${mode.label}.`);
  state.options = null;
  state.phase = 'aim';
}

function sourceName(state, source) {
  if (source.kind === 'ship') return shipName(state.players[state.current].ships[source.index].type);
  if (source.kind === 'cannon') return STRUCTURE_TYPES[source.type].name;
  if (source.kind === 'seeker') return 'Hledač';
  if (source.kind === 'special') return 'Speciální políčko';
  return '';
}

function afterQueue(state) {
  const a = state.attack;
  if (state.winner !== null) return;
  if (state.pending) { state.phase = 'choose-bonus'; return; }
  if (a.queue.length) { state.phase = 'aim'; return; }
  if (a.extra && !a.extraDone) { state.phase = 'extra-roll'; return; }
  state.phase = 'end';
}

// Je střela sestřelena vzdušnou obranou obránce?
function shotDown(state, defenderIdx, aim) {
  const d = state.players[defenderIdx];
  if (isBanned(state, defenderIdx, 'V')) return false;
  for (const s of d.structures) {
    if (s.type !== 'V' || s.destroyed) continue;
    if (s.cells.includes(aim)) return false; // střela letí přímo na obranu
    if (distanceToSet(aim, s.cells) <= AIR_DEFENSE_RANGE) return true;
  }
  return false;
}

function fire(state, cell) {
  const a = state.attack;
  const item = a.queue[0];
  if (!item) throw new Error('Žádná střela k vystřelení.');
  const ai = state.current, di = other(ai);
  const A = state.players[ai];
  let aim = cell;
  if (item.pattern === 'guided') {
    aim = guidedLanding(state, ai, di);
    if (aim === null) { a.queue.shift(); return afterQueue(state); }
  } else if (aim === undefined || aim === null || aim < 0 || aim >= CELLS) {
    throw new Error('Vyber políčko.');
  }
  a.queue.shift();
  const pattern = effectivePattern(state, item, ai);

  if (pattern === 'sonar4' || pattern === 'sonar2') {
    radar(state, ai, di, aim, patternCells(state, item, aim, ai));
    return afterQueue(state);
  }
  if (pattern === 'reveal') {
    revealCell(state, ai, di, aim, true);
    return afterQueue(state);
  }
  if (!item.pass && shotDown(state, di, aim)) {
    log(state, `${PATTERN_NAMES[pattern]} na ${label(aim)}: SESTŘELENO vzdušnou obranou.`);
    if (!A.known[aim]) A.known[aim] = 'down';
    return afterQueue(state);
  }
  const cells = patternCells(state, item, aim, ai);
  const results = [];
  for (const c of cells) {
    if (state.winner !== null) break;
    results.push(hitCell(state, ai, di, c, a.source));
    // Loď mohla být zničena majákem – zbytek útoku propadá.
    if (a.source.kind === 'ship' && A.ships[a.source.index].sunk) {
      a.queue = [];
      a.extraDone = true;
      break;
    }
  }
  log(state, `${PATTERN_NAMES[pattern]} na ${label(aim)}: ${results.join(', ')}.`);
  if (state.winner !== null) { state.phase = 'gameover'; return; }
  afterQueue(state);
}

function markSunk(state, attackerIdx, ship) {
  for (const c of ship.cells) state.players[attackerIdx].known[c] = 'sunk';
}

function checkWinner(state, loserIdx) {
  if (state.winner === null && hasLost(state.players[loserIdx])) {
    state.winner = other(loserIdx);
    state.phase = 'gameover';
    log(state, `KONEC HRY – vyhrává ${state.players[state.winner].name}!`, state.winner);
  }
}

// Poškození lodi (střelou nebo nárazem na maják). Vrací text výsledku.
function damageShip(state, ownerIdx, shipIndex, cell, observerIdx) {
  const owner = state.players[ownerIdx];
  const ship = owner.ships[shipIndex];
  const k = ship.cells.indexOf(cell);
  owner.hits[cell] = 1;
  if (ship.hit[k]) return 'loď (už zasažená)';
  ship.hit[k] = true;
  if (ship.hit.every(Boolean)) {
    ship.sunk = true;
    markSunk(state, observerIdx, ship);
    if (ship.type === 'lodka') owner.pendingMines.push({ origin: [...ship.cells] });
    checkWinner(state, ownerIdx);
    return `POTOPENA ${shipName(ship.type)}`;
  }
  state.players[observerIdx].known[cell] = 'hit';
  return 'ZÁSAH lodi';
}

function attackerShip(state, ai, source) {
  return source && source.kind === 'ship' ? state.players[ai].ships[source.index] : null;
}

function hitCell(state, ai, di, cell, source) {
  const A = state.players[ai];
  const D = state.players[di];
  D.hits[cell] = 1;
  const notes = [];
  const protectedA = hasEffect(A, 'protect', state.turn);

  const mine = D.mines.find((m) => m.cell === cell && !m.used);
  if (mine) {
    mine.used = true;
    const ship = attackerShip(state, ai, source);
    if (ship && !ship.sunk && !protectedA) {
      const k = ship.cells.findIndex((c, i) => !ship.hit[i] && !D.known[c]);
      if (k !== -1) {
        D.known[ship.cells[k]] = 'ship';
        notes.push(`MINA – odhalena příď (${label(ship.cells[k])})`);
      } else notes.push('MINA');
    } else notes.push(protectedA ? 'MINA (bez účinku)' : 'MINA');
  }

  const content = cellContent(D, cell);
  let result;
  switch (content.kind) {
    case 'ship':
      result = damageShip(state, di, content.index, cell, ai);
      break;
    case 'island':
      A.known[cell] = 'island';
      result = 'zásah ostrov';
      break;
    case 'structure': {
      const s = D.structures[content.index];
      const k = s.cells.indexOf(cell);
      const name = STRUCTURE_TYPES[s.type].name;
      if (s.destroyed) { A.known[cell] = `sx:${s.type}`; result = `${name} (už zničeno)`; break; }
      s.hit[k] = true;
      const destroyed = s.type === 'Z' ? s.hit.every(Boolean) : true;
      if (destroyed) {
        s.destroyed = true;
        for (const c of s.cells) A.known[c] = `sx:${s.type}`;
        result = `${name.toUpperCase()} ZNIČENO`;
        if (s.type === 'Z') result += ' (od teď se hraje bunkr)';
        checkWinner(state, di);
      } else {
        A.known[cell] = `s:${s.type}`;
        result = `zásah ${name.toLowerCase()}`;
      }
      break;
    }
    case 'lighthouse': {
      const lh = D.lighthouses[content.index];
      A.known[cell] = 'lighthousex';
      if (lh.used) { result = 'maják (už zasažený)'; break; }
      lh.used = true;
      result = 'MAJÁK';
      const ship = attackerShip(state, ai, source);
      if (ship && !ship.sunk && !protectedA) {
        const k = ship.hit.findIndex((h) => !h);
        result += ` – ${shipName(ship.type)} nabourala (${label(ship.cells[k])})`;
        const r = damageShip(state, ai, source.index, ship.cells[k], di);
        if (ship.sunk) result += ` a ${r.toLowerCase()}`;
      } else if (ship && protectedA) {
        result += ' (bez účinku – ochrana)';
      }
      break;
    }
    case 'land':
      A.known[cell] = 'land';
      result = 'zásah pevnina';
      break;
    default:
      A.known[cell] = 'water';
      result = 'voda';
  }
  if (mine) A.known[cell] = A.known[cell] === 'water' || A.known[cell] === 'land' ? 'minex' : A.known[cell];

  if (D.special.cell === cell && !D.special.used) {
    D.special.used = true;
    if (A.known[cell] === 'water' || A.known[cell] === 'land') A.known[cell] = 'specialx';
    notes.push('SPECIÁLNÍ POLÍČKO');
    specialBonus(state, ai, di);
  }
  return [result, ...notes].join(' + ');
}

// Odhalení skutečného obsahu políčka (hledač, bonusy). Nic neničí.
function revealCell(state, ai, di, cell, logIt = false) {
  const A = state.players[ai];
  const D = state.players[di];
  const content = cellContent(D, cell);
  let code;
  switch (content.kind) {
    case 'ship': {
      const ship = D.ships[content.index];
      const k = ship.cells.indexOf(cell);
      code = ship.sunk ? 'sunk' : ship.hit[k] ? 'hit' : 'ship';
      break;
    }
    case 'island': code = 'island'; break;
    case 'structure': {
      const s = D.structures[content.index];
      code = `${s.destroyed ? 'sx' : 's'}:${s.type}`;
      break;
    }
    case 'lighthouse': code = D.lighthouses[content.index].used ? 'lighthousex' : 'lighthouse'; break;
    case 'land': code = 'land'; break;
    default: code = 'water';
  }
  if (code === 'water' || code === 'land') {
    if (D.mines.some((m) => m.cell === cell && !m.used)) code = 'mine';
    else if (D.special.cell === cell && !D.special.used) code = 'special';
  }
  A.known[cell] = code;
  if (logIt) log(state, `Odhaleno ${label(cell)}: ${KNOWN_NAMES[code] || code}.`);
  return code;
}

export const KNOWN_NAMES = {
  water: 'voda', ship: 'loď', hit: 'zasažená loď', sunk: 'potopená loď', island: 'ostrov', land: 'pevnina',
  lighthouse: 'maják', lighthousex: 'zasažený maják', mine: 'mina', minex: 'vybuchlá mina',
  special: 'speciální políčko', specialx: 'použité speciální políčko', radar: 'něco tu je', down: 'sestřeleno',
};
for (const [t, def] of Object.entries(STRUCTURE_TYPES)) {
  KNOWN_NAMES[`s:${t}`] = def.name.toLowerCase();
  KNOWN_NAMES[`sx:${t}`] = `${def.name.toLowerCase()} (zničeno)`;
}

// Radar / sonar: odhalí nejbližší věc v oblasti (jen že tam něco je).
// Ostrovy blokují výhled – co je za nimi, zůstane skryté.
function radar(state, ai, di, origin, area) {
  const A = state.players[ai];
  const D = state.players[di];
  const islands = new Set(D.layout.islands);
  const entityOf = (c) => {
    const content = cellContent(D, c);
    if (content.kind === 'ship') return `ship${content.index}`;
    if (content.kind === 'island') return `island${c}`;
    if (content.kind === 'lighthouse') return `lh${c}`;
    if (content.kind === 'structure' || content.kind === 'land') return 'land';
    return null;
  };
  const visible = (c) => c === origin || !lineBlocked(origin, c, islands);
  const unknown = (c) => !A.known[c] || A.known[c] === 'down';
  const candidates = area
    .filter((c) => entityOf(c) && unknown(c) && visible(c))
    .sort((a, b) => chebyshev(origin, a) - chebyshev(origin, b)
      || (Math.abs(xOf(a) - xOf(origin)) + Math.abs(yOf(a) - yOf(origin))) - (Math.abs(xOf(b) - xOf(origin)) + Math.abs(yOf(b) - yOf(origin))));
  if (!candidates.length) {
    log(state, `Sonar z ${label(origin)}: nic nenalezeno.`);
    return;
  }
  const entity = entityOf(candidates[0]);
  let found = area.filter((c) => entityOf(c) === entity && unknown(c) && visible(c));
  if (entity === 'land') {
    // Jen souvislá pevnina kolem nalezeného políčka.
    const set = new Set(found);
    const seen = new Set([candidates[0]]);
    const stack = [candidates[0]];
    while (stack.length) {
      const c = stack.pop();
      for (const n of neighbors4(c)) if (set.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
    }
    found = [...seen];
  }
  for (const c of found) A.known[c] = 'radar';
  log(state, `Sonar z ${label(origin)}: něco nalezeno (${found.map(label).join(', ')}).`);
}

// Kam dopadne naváděná střela: kostky určí loď, soupeř (zde automaticky
// v jeho prospěch) vybere políčko max. 1 (s ochranou 2) pole od ní.
function guidedLanding(state, ai, di) {
  const D = state.players[di];
  const A = state.players[ai];
  const type = rollShipType(state, di, 'Naváděná střela – na kterou loď', true);
  if (!type) { log(state, 'Naváděná střela nemá cíl.'); return null; }
  const ship = pick(state.rng, D.ships.filter((s) => s.type === type && !s.sunk));
  const range = hasEffect(D, 'protect', state.turn) ? 2 : 1;
  const own = new Set(ship.cells);
  const candidates = new Set();
  for (const c of ship.cells) for (const n of cellsWithin(c, range)) if (!own.has(n)) candidates.add(n);
  const score = (c) => {
    if (shotDown(state, di, c)) return -2;
    if (A.known[c]) return -1;
    const content = cellContent(D, c);
    if (D.special.cell === c && !D.special.used) return 8;
    switch (content.kind) {
      case 'water': return D.mines.some((m) => m.cell === c && !m.used) ? 3 : 0;
      case 'island': return 0.5;
      case 'land': return 1;
      case 'lighthouse': return 3;
      case 'structure': return 9;
      default: return 10;
    }
  };
  const list = shuffle(state.rng, [...candidates]);
  list.sort((a, b) => score(a) - score(b));
  const target = list[0];
  log(state, `Naváděná střela míří k lodi ${shipName(type)}, soupeř ji navedl na ${label(target)}.`);
  return target;
}

function specialBonus(state, ai, di) {
  const v = roll(state, 1, 'Bonus speciálního políčka');
  const n = v[0];
  const A = state.players[ai];
  const D = state.players[di];
  log(state, `Speciální políčko – bonus ${n}: ${SPECIAL_BONUSES[n]}`);
  switch (n) {
    case 1:
      addEffect(state, ai, 'double', 1);
      break;
    case 2: {
      const options = [];
      for (const t of Object.keys(SHIP_TYPES)) if (D.ships.some((s) => s.type === t && !s.sunk)) options.push({ id: t, label: shipName(t) });
      for (const t of ['DI', 'DII', 'H', 'V']) if (structureAlive(D, t)) options.push({ id: t, label: STRUCTURE_TYPES[t].name });
      options.push({ id: 'Z', label: structureAlive(D, 'Z') ? 'Základna' : 'Bunkr' });
      state.pending = { kind: 'ban', options };
      break;
    }
    case 3: {
      for (const c of D.layout.islands) if (A.known[c] !== 'island') A.known[c] = 'island';
      const base = D.structures.find((s) => s.type === 'Z');
      const land = D.layout.land.filter((c) => !A.known[c] && distanceToSet(c, base.cells) <= 5);
      for (const c of shuffle(state.rng, land).slice(0, 2)) revealCell(state, ai, di, c, true);
      break;
    }
    case 4: {
      const cells = D.ships.filter((s) => !s.sunk).flatMap((s) => s.cells.filter((c, i) => !s.hit[i] && !A.known[c]));
      if (cells.length) {
        const c = pick(state.rng, cells);
        A.known[c] = 'ship';
        log(state, `Soupeř odhalil dílek lodi na ${label(c)}.`);
      }
      break;
    }
    case 5: {
      const options = [];
      if (A.charges.nine < NINES_PER_GAME) options.push({ id: 'nine', label: 'Devítka' });
      if (A.charges.sonar < SONARS_PER_GAME) options.push({ id: 'sonar', label: 'Sonar' });
      if (options.length === 1) applyRecharge(state, ai, options[0].id);
      else if (options.length > 1) state.pending = { kind: 'recharge', options };
      else log(state, 'Máš plně nabito.');
      break;
    }
    case 6:
      if (!state.attack) state.attack = { source: { kind: 'special' }, modes: [], queue: [], extra: null };
      state.attack.queue.unshift(...rep(4, 'reveal'));
      break;
    default:
  }
}

function applyRecharge(state, ai, what) {
  const A = state.players[ai];
  if (what === 'nine') A.charges.nine += 1;
  else A.charges.sonar += 1;
  log(state, `Dobito: ${what === 'nine' ? 'devítka' : 'sonar'}.`);
}

function baseBonus(state, bunker) {
  const pi = state.current;
  const v = roll(state, 1, bunker ? 'Bonus bunkru' : 'Bonus základny');
  const n = v[0];
  const text = (bunker ? BUNKER_BONUSES : BASE_BONUSES)[n];
  log(state, `${bunker ? 'Bunkr' : 'Základna'} – bonus ${n}: ${text}`);
  switch (n) {
    case 1: addEffect(state, pi, 'base1', 1); break;
    case 2: addEffect(state, pi, 'base2', 1); break;
    case 3: addEffect(state, pi, 'base3', 1); break;
    case 4: addEffect(state, pi, 'base4', 1); break;
    case 5:
      if (bunker) state.flash = { viewer: pi, of: other(pi), turn: state.turn };
      else addEffect(state, pi, 'protect', 5);
      break;
    case 6:
      if (bunker) addEffect(state, pi, 'bunker6', 1);
      else addEffect(state, other(pi), 'noRadar', 2);
      break;
    default:
  }
}

function endTurn(state) {
  const pi = state.current;
  const p = state.players[pi];
  for (const e of p.effects) if (state.turn >= e.activeFrom) e.turnsLeft -= 1;
  p.effects = p.effects.filter((e) => e.turnsLeft > 0);
  if (state.extraTurns > 0) {
    state.extraTurns -= 1;
    log(state, `${p.name} hraje ještě jeden tah.`);
  } else {
    state.current = other(pi);
  }
  beginTurn(state);
}

// ---------------------------------------------------------------------------
// Akce

export function dispatch(state, action) {
  if (state.phase === 'gameover') throw new Error('Hra skončila.');
  state.rolls = [];
  const pi = state.current;
  const P = state.players[pi];
  const expect = (...phases) => {
    if (!phases.includes(state.phase)) throw new Error(`Akce ${action.type} teď nejde (fáze ${state.phase}).`);
  };

  switch (action.type) {
    case 'rollStart': {
      expect('start');
      for (let g = 0; g < 100; g++) {
        const [a] = roll(state, 1, `${state.players[0].name} – kdo začíná`);
        const [b] = roll(state, 1, `${state.players[1].name} – kdo začíná`);
        if (a !== b) { state.current = a > b ? 0 : 1; break; }
      }
      log(state, `Začíná ${state.players[state.current].name}.`);
      beginTurn(state);
      break;
    }
    case 'placeMine': {
      expect('place-mine');
      if (!state.options.cells.includes(action.cell)) throw new Error('Sem minu umístit nelze.');
      P.mines.push({ cell: action.cell, used: false });
      P.pendingMines.shift();
      log(state, 'Mina z potopené loďky byla umístěna.');
      continueTurnStart(state);
      break;
    }
    case 'rollDouble': {
      expect('roll-double');
      const v = roll(state, 2, 'Bonus – hraješ dvakrát? (liché ano)');
      if (isOdd(sum(v))) { state.extraTurns += 1; log(state, `Padlo ${sum(v)} – hraješ dvakrát!`); }
      else log(state, `Padlo ${sum(v)} – nic.`);
      state.doubleRolled = true;
      continueTurnStart(state);
      break;
    }
    case 'rollDomain': {
      expect('roll-domain');
      const [d] = roll(state, 1, 'Voda (sudé) nebo pevnina (liché)?');
      if (!isOdd(d)) {
        log(state, `Padlo ${d} – hraješ za lodě.`);
        if (!Object.keys(SHIP_TYPES).some((t) => shipTypeAvailable(state, pi, t))) {
          log(state, 'Nemáš žádnou loď, kterou bys mohl hrát – hraješ pevninu.');
          goLand(state);
        } else {
          state.phase = 'roll-ship';
        }
      } else {
        log(state, `Padlo ${d} – hraješ za pevninu.`);
        goLand(state);
      }
      break;
    }
    case 'rollShip': {
      expect('roll-ship');
      const type = rollShipType(state, pi, 'Výběr lodě');
      if (!type) { goLand(state); break; }
      log(state, `Hraje ${shipName(type)}.`);
      const ships = P.ships.map((s, i) => ({ s, i })).filter(({ s }) => s.type === type && !s.sunk);
      if (ships.length === 1) startAttack(state, { kind: 'ship', index: ships[0].i }, shipModes(state, ships[0].s));
      else {
        state.phase = 'choose-ship';
        state.options = { ships: ships.map(({ i }) => i) };
      }
      break;
    }
    case 'chooseShip': {
      expect('choose-ship');
      if (!state.options.ships.includes(action.index)) throw new Error('Tuhle loď vybrat nelze.');
      startAttack(state, { kind: 'ship', index: action.index }, shipModes(state, P.ships[action.index]));
      break;
    }
    case 'chooseLand': {
      expect('choose-land');
      const choice = state.options.choices.find((c) => c.id === action.choice);
      if (!choice || !choice.enabled) throw new Error('Tohle teď hrát nelze.');
      log(state, `Volba: ${choice.label}.`);
      state.options = null;
      state.phase = { cannons: 'roll-cannon', base: 'roll-bonus', seeker: 'roll-seek' }[action.choice];
      break;
    }
    case 'rollCannon': {
      expect('roll-cannon');
      const usable = ['DI', 'DII'].filter((t) => cannonAlive(P, t) && !isBanned(state, pi, t));
      let type = usable[0];
      if (usable.length === 2) {
        const v = roll(state, hasEffect(P, 'base3', state.turn) ? 1 : 2, 'Které dělo? (sudé obyčejné, liché naváděné)');
        type = isOdd(sum(v)) ? 'DII' : 'DI';
      }
      log(state, `Střílí ${STRUCTURE_TYPES[type].name}.`);
      startAttack(state, { kind: 'cannon', type }, cannonModes(state, type));
      break;
    }
    case 'rollBonus': {
      expect('roll-bonus');
      if (structureAlive(P, 'Z')) baseBonus(state, false);
      else {
        const [d] = roll(state, 1, 'Bunkr – dostaneš bonus? (liché ano)');
        if (isOdd(d)) baseBonus(state, true);
        else log(state, `Padlo ${d} – bunkr tentokrát nic nedal.`);
      }
      state.phase = 'end';
      break;
    }
    case 'rollSeek': {
      expect('roll-seek');
      const v = roll(state, 2, 'Funguje hledač? (liché ano)');
      if (isOdd(sum(v))) {
        log(state, `Padlo ${sum(v)} – hledač funguje, odhal 4 políčka.`);
        state.attack = { source: { kind: 'seeker' }, modes: [], queue: rep(4, 'reveal'), extra: null };
        state.phase = 'aim';
      } else {
        log(state, `Padlo ${sum(v)} – hledač nefunguje.`);
        state.phase = 'end';
      }
      break;
    }
    case 'chooseMode': {
      expect('choose-mode');
      chooseMode(state, action.mode);
      break;
    }
    case 'fire': {
      expect('aim');
      fire(state, action.cell);
      break;
    }
    case 'skipRest': {
      expect('aim');
      state.attack.queue = [];
      state.attack.extraDone = true;
      log(state, 'Zbývající střely nevyužity.');
      afterQueue(state);
      break;
    }
    case 'rollExtra': {
      expect('extra-roll');
      const a = state.attack;
      const isCannon = a.source.kind === 'cannon';
      const v = roll(state, isCannon && !hasEffect(P, 'base3', state.turn) ? 2 : 1, 'Další střela? (liché ano)');
      a.extraDone = true;
      if (isOdd(sum(v))) {
        log(state, `Padlo ${sum(v)} – ještě jedna střela!`);
        a.queue.push({ pattern: a.extra, pass: a.extraPass });
      } else log(state, `Padlo ${sum(v)} – další střela nebude.`);
      afterQueue(state);
      break;
    }
    case 'chooseBonus': {
      expect('choose-bonus');
      const pend = state.pending;
      const opt = pend.options.find((o) => o.id === action.choice);
      if (!opt) throw new Error('Neplatná volba.');
      if (pend.kind === 'ban') {
        addEffect(state, other(pi), 'ban', 5, { target: opt.id });
        log(state, `Soupeř nesmí 5 kol použít: ${opt.label}.`);
      } else if (pend.kind === 'recharge') {
        applyRecharge(state, pi, opt.id);
      }
      state.pending = null;
      if (state.attack) afterQueue(state);
      else state.phase = 'end';
      break;
    }
    case 'endTurn': {
      expect('end');
      endTurn(state);
      break;
    }
    default:
      throw new Error(`Neznámá akce ${action.type}.`);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Přehled pro záznamník

export function recordSheet(state, pi) {
  const p = state.players[pi];
  const ships = {};
  for (const s of p.ships) {
    ships[s.type] = ships[s.type] || { alive: 0, total: 0 };
    ships[s.type].total += 1;
    if (!s.sunk) ships[s.type].alive += 1;
  }
  const structures = {};
  for (const s of p.structures) {
    structures[s.type] = structures[s.type] || { alive: 0, total: 0 };
    structures[s.type].total += 1;
    if (!s.destroyed) structures[s.type].alive += 1;
  }
  return {
    name: p.name,
    ships,
    structures,
    charges: { ...p.charges },
    effects: p.effects.map((e) => ({ ...e, active: state.turn >= e.activeFrom })),
    uloShot: p.layout.uloShot,
    bunker: !structureAlive(p, 'Z'),
  };
}

export const EFFECT_NAMES = {
  base1: '300 % střel',
  base2: 'Devítka zdarma / děla +1',
  base3: 'Výběr jednou kostkou',
  base4: 'Hod o dvojitý tah',
  protect: 'Ochrana (maják, mina, naváděné)',
  noRadar: 'Zákaz radaru a devítky',
  bunker6: 'Střely 3×1',
  double: 'Dvojitý tah',
  ban: 'Zákaz',
};
