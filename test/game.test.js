import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatch, patternCells } from '../src/engine/game.js';
import { randomLayout } from '../src/engine/layout.js';
import { botAction } from '../src/engine/bot.js';
import { createRng } from '../src/engine/rng.js';
import { idx } from '../src/engine/geometry.js';

function newGame(seed) {
  const rng = createRng(seed);
  return createGame({ layouts: [randomLayout(rng), randomLayout(rng)], seed });
}

function playOut(state, maxActions = 20000) {
  const rng = createRng(state.rng.s + 3);
  for (let i = 0; i < maxActions && state.phase !== 'gameover'; i++) {
    dispatch(state, botAction(state, rng));
  }
  return state;
}

test('celé hry dvou botů doběhnou do konce bez chyb', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const state = playOut(newGame(seed));
    assert.equal(state.phase, 'gameover', `seed ${seed} neskončil (tah ${state.turn}, fáze ${state.phase})`);
    assert.ok(state.winner === 0 || state.winner === 1);
    const loser = state.players[1 - state.winner];
    assert.ok(loser.ships.every((s) => s.sunk));
    assert.ok(loser.structures.filter((s) => s.type === 'DI' || s.type === 'DII').every((s) => s.destroyed));
    // stav musí jít serializovat
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(state)));
  }
});

test('tvary střel', () => {
  const state = newGame(3);
  const aim = idx(10, 10);
  assert.equal(patternCells(state, { pattern: 'nine' }, aim).length, 9);
  assert.deepEqual(patternCells(state, { pattern: 'bomber' }, aim), [idx(10, 9), idx(10, 10), idx(10, 11), idx(10, 12)]);
  assert.equal(patternCells(state, { pattern: 'sonar4' }, aim).length, 16);
  assert.ok(patternCells(state, { pattern: 'sonar4' }, aim).includes(idx(13, 7)));
  assert.equal(patternCells(state, { pattern: 'ulo' }, aim).length, 4);
  // u okraje se tvar ořízne
  assert.equal(patternCells(state, { pattern: 'nine' }, idx(0, 0)).length, 4);
});

function toPhase(state, phase, choose = {}) {
  const rng = createRng(1);
  for (let i = 0; i < 500 && state.phase !== phase; i++) {
    const a = botAction(state, rng);
    if (choose[state.phase]) Object.assign(a, choose[state.phase]);
    dispatch(state, a);
  }
  assert.equal(state.phase, phase);
}

test('zásah do vody, lodi a potopení', () => {
  const state = newGame(11);
  toPhase(state, 'aim');
  const ai = state.current;
  const D = state.players[1 - ai];
  const lodka = D.ships.find((s) => s.type === 'lodka');
  // Vypneme obranu, ať střely nesestřeluje.
  for (const s of D.structures) if (s.type === 'V') s.destroyed = true;
  state.attack.queue = [{ pattern: 'single' }, { pattern: 'single' }];
  dispatch(state, { type: 'fire', cell: lodka.cells[0] });
  assert.equal(state.players[ai].known[lodka.cells[0]], 'hit');
  dispatch(state, { type: 'fire', cell: lodka.cells[1] });
  assert.ok(lodka.sunk);
  assert.equal(state.players[ai].known[lodka.cells[1]], 'sunk');
  // Majitel potopené loďky umístí minu na začátku svého tahu.
  assert.equal(D.pendingMines.length, 1);
});

test('vzdušná obrana sestřelí střelu do 2 polí, dělo 1 prolétne', () => {
  const state = newGame(12);
  toPhase(state, 'aim');
  const ai = state.current;
  const D = state.players[1 - ai];
  const v = D.structures.find((s) => s.type === 'V');
  // políčko vedle obrany, které není samo obranou
  const target = [v.cells[0] + 1, v.cells[0] - 1, v.cells[0] + 24, v.cells[0] - 24]
    .find((c) => c >= 0 && c < 456 && !v.cells.includes(c));
  state.attack.queue = [{ pattern: 'single' }, { pattern: 'single', pass: true }];
  dispatch(state, { type: 'fire', cell: target });
  assert.equal(state.players[ai].known[target], 'down');
  assert.equal(D.hits[target], 0);
  dispatch(state, { type: 'fire', cell: target });
  assert.equal(D.hits[target], 1);
});

test('zásah majáku poškodí příď útočící lodi', () => {
  const state = newGame(13);
  toPhase(state, 'roll-domain');
  // vynutíme útok lodí
  const ai = state.current;
  const A = state.players[ai];
  const D = state.players[1 - ai];
  for (const s of D.structures) if (s.type === 'V') s.destroyed = true;
  const shipIndex = A.ships.findIndex((s) => s.type === 'letadlova');
  state.attack = { source: { kind: 'ship', index: shipIndex }, modes: [], queue: [{ pattern: 'single' }], extra: null };
  state.phase = 'aim';
  const lh = D.lighthouses[0].cell;
  dispatch(state, { type: 'fire', cell: lh });
  const ship = A.ships[shipIndex];
  assert.equal(ship.hit[0], true);
  assert.equal(D.known[ship.cells[0]], 'hit');
});

test('hledač odhalí obsah políčka bez poškození', () => {
  const state = newGame(14);
  toPhase(state, 'roll-domain');
  const ai = state.current;
  const D = state.players[1 - ai];
  const ship = D.ships[0];
  state.attack = { source: { kind: 'seeker' }, modes: [], queue: [{ pattern: 'reveal' }], extra: null };
  state.phase = 'aim';
  dispatch(state, { type: 'fire', cell: ship.cells[0] });
  assert.equal(state.players[ai].known[ship.cells[0]], 'ship');
  assert.equal(ship.hit[0], false);
});
