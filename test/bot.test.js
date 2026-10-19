import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatch } from '../src/engine/game.js';
import { randomLayout } from '../src/engine/layout.js';
import { botAction, LEVELS } from '../src/engine/bot.js';
import { createRng } from '../src/engine/rng.js';

function play(levels, seed) {
  const rng = createRng(1000 + seed);
  const state = createGame({ layouts: [randomLayout(rng), randomLayout(rng)], seed: 77 + seed });
  const r = createRng(seed + 5);
  for (let n = 0; n < 60000 && state.phase !== 'gameover'; n++) dispatch(state, botAction(state, r, levels[state.current]));
  return state;
}

test('každá obtížnost dohraje hru bez chyb', () => {
  for (const level of LEVELS) {
    const state = play([level, level], 1);
    assert.equal(state.phase, 'gameover', level);
  }
});

test('těžký počítač většinou porazí lehkého', () => {
  let wins = 0;
  const games = 10;
  for (let g = 0; g < games; g++) {
    const levels = g % 2 ? ['easy', 'hard'] : ['hard', 'easy'];
    const state = play(levels, g);
    if (levels[state.winner] === 'hard') wins += 1;
  }
  assert.ok(wins >= 7, `těžký vyhrál jen ${wins}/${games}`);
});
