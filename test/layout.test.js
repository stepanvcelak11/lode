import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomLayout, validateLayout, emptyLayout, shipPlacementErrors } from '../src/engine/layout.js';
import { createRng } from '../src/engine/rng.js';
import { idx, label } from '../src/engine/geometry.js';
import { WIDTH, HEIGHT } from '../src/engine/constants.js';

test('plocha má 24 sloupců a 19 řádků (A–R včetně CH)', () => {
  assert.equal(WIDTH, 24);
  assert.equal(HEIGHT, 19);
  assert.equal(label(idx(0, 0)), 'A1');
  assert.equal(label(idx(23, 18)), 'R24');
  assert.equal(label(idx(4, 8)), 'CH5');
});

test('náhodné rozmístění je vždy platné', () => {
  const rng = createRng(42);
  for (let i = 0; i < 30; i++) {
    const layout = randomLayout(rng);
    assert.deepEqual(validateLayout(layout), []);
  }
});

test('prázdné rozmístění hlásí chyby', () => {
  const errors = validateLayout(emptyLayout());
  assert.ok(errors.some((e) => e.includes('Pevnina')));
  assert.ok(errors.some((e) => e.includes('Letadlová')));
});

test('pevnina v horní řadě je chyba', () => {
  const layout = randomLayout(createRng(1));
  const moved = layout.land.find((c) => !layout.structures.some((s) => s.cells.includes(c)));
  layout.land = layout.land.filter((c) => c !== moved).concat(idx(0, HEIGHT - 1));
  assert.ok(validateLayout(layout).some((e) => e.includes('horní řadě')));
});

test('velká loď se nesmí dotýkat jiné lodi, malá smí', () => {
  const layout = emptyLayout();
  layout.ships.push({ type: 'ponorka', cells: [idx(5, 10), idx(6, 10), idx(7, 10)] });
  // bitevní loď těsně nad ponorkou
  const big = [idx(5, 11), idx(6, 11), idx(7, 11), idx(5, 12), idx(6, 12), idx(7, 12)];
  assert.ok(shipPlacementErrors(layout, 'bitevni', big).some((e) => e.includes('dotýkat')));
  const small = [idx(5, 11), idx(6, 11)];
  assert.deepEqual(shipPlacementErrors(layout, 'lodka', small), []);
});

test('špatný tvar lodi je odmítnut', () => {
  const layout = emptyLayout();
  const cells = [idx(1, 1), idx(2, 1), idx(3, 2)];
  assert.ok(shipPlacementErrors(layout, 'ponorka', cells).some((e) => e.includes('tvar')));
});
