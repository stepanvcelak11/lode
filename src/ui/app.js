// Hlavní řízení aplikace: menu, příprava hry, editor, hra, pravidla.

import { createGame } from '../engine/game.js';
import { randomLayout } from '../engine/layout.js';
import { createRng } from '../engine/rng.js';
import { openEditor } from './editor.js';
import { openGame } from './play.js';
import { h, clear, store } from './dom.js';
import { markdownToHtml } from './markdown.js';

const SAVE_KEY = 'lode.save.v1';
const NAMES_KEY = 'lode.names';
const root = document.getElementById('app');
let current = null;

function cleanup() {
  if (current?.destroy) current.destroy();
  current = null;
}

function home() {
  cleanup();
  const save = store.get(SAVE_KEY);
  clear(root).append(h('main', { class: 'home' },
    h('div', { class: 'logo', 'aria-hidden': 'true' }, '⚓'),
    h('h1', {}, 'LODĚ'),
    h('p', { class: 'muted' }, 'Námořní bitva s pevninou, děly, majáky a bonusy'),
    h('div', { class: 'menu' },
      save && save.state.phase !== 'gameover'
        ? h('button', { type: 'button', class: 'btn primary', onclick: () => resume(save) }, `▶ Pokračovat (tah ${save.state.turn})`)
        : null,
      h('button', { type: 'button', class: 'btn', onclick: () => setup('bot') }, '🤖 Hra proti počítači'),
      h('button', { type: 'button', class: 'btn', onclick: () => setup('hotseat') }, '👥 Dva hráči na jednom zařízení'),
      h('button', { type: 'button', class: 'btn ghost', onclick: rules }, '📖 Pravidla')),
    h('p', { class: 'foot muted' }, 'Verze 0.1 · prototyp')));
}

function setup(mode) {
  cleanup();
  const names = store.get(NAMES_KEY, ['Hráč 1', 'Hráč 2']);
  const n1 = h('input', { type: 'text', value: names[0], maxlength: 20, 'aria-label': 'Jméno hráče 1' });
  const n2 = h('input', { type: 'text', value: mode === 'bot' ? 'Počítač' : names[1], maxlength: 20, 'aria-label': 'Jméno hráče 2', disabled: mode === 'bot' });
  clear(root).append(h('main', { class: 'setup' },
    h('h1', {}, mode === 'bot' ? 'Hra proti počítači' : 'Dva hráči'),
    h('label', {}, 'Hráč 1', n1),
    h('label', {}, mode === 'bot' ? 'Soupeř' : 'Hráč 2', n2),
    h('p', { class: 'muted' }, mode === 'bot'
      ? 'Nejdřív si rozmístíš svou plochu. Počítač si ji rozmístí sám.'
      : 'Každý hráč si postupně rozmístí plochu – druhý se nedívá.'),
    h('div', { class: 'row-btns' },
      h('button', { type: 'button', class: 'btn ghost', onclick: home }, 'Zpět'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => {
        const list = [n1.value.trim() || 'Hráč 1', n2.value.trim() || 'Hráč 2'];
        if (mode === 'hotseat') store.set(NAMES_KEY, list);
        else store.set(NAMES_KEY, [list[0], names[1]]);
        placeFor(mode, list, 0, []);
      } }, 'Pokračovat'))));
}

function placeFor(mode, names, k, layouts) {
  if (mode === 'bot' && k === 1) {
    layouts[1] = randomLayout(createRng(Date.now()));
    return start(mode, names, layouts);
  }
  if (k === 2) return start(mode, names, layouts);
  const go = () => openEditor(root, {
    playerName: names[k],
    initial: null,
    onBack: home,
    onDone: (layout) => { layouts[k] = layout; placeFor(mode, names, k + 1, layouts); },
  });
  if (mode === 'hotseat' && k === 1) passScreen(names[1], 'rozmístit svou plochu', go);
  else go();
}

function passScreen(name, what, onGo) {
  clear(root).append(h('main', { class: 'pass-screen' },
    h('p', { class: 'muted' }, 'Předej zařízení'),
    h('h1', {}, name),
    h('p', {}, `Teď budeš ${what}. Ostatní se nedívají 🙈`),
    h('button', { type: 'button', class: 'btn primary', onclick: onGo }, `Jsem ${name}`)));
}

function start(mode, names, layouts) {
  const state = createGame({ layouts, names, seed: Date.now() });
  const save = { mode, botPlayer: 1, state };
  store.set(SAVE_KEY, save);
  resume(save);
}

function resume(save) {
  cleanup();
  current = openGame(root, {
    state: save.state,
    mode: save.mode,
    botPlayer: save.botPlayer,
    onChange: (state) => store.set(SAVE_KEY, { ...save, state }),
    onExit: home,
    onNewGame: () => { store.remove(SAVE_KEY); home(); },
  });
}

async function rules() {
  cleanup();
  const body = h('article', { class: 'rules' }, h('p', { class: 'muted' }, 'Načítám pravidla…'));
  clear(root).append(
    h('header', { class: 'topbar' },
      h('button', { class: 'btn ghost', type: 'button', onclick: home }, '←'),
      h('div', { class: 'title' }, h('strong', {}, 'Pravidla'))),
    h('main', { class: 'rules-wrap' }, body));
  try {
    const res = await fetch('PRAVIDLA.md');
    body.innerHTML = markdownToHtml(await res.text());
  } catch {
    body.replaceChildren(h('p', {}, 'Pravidla se nepodařilo načíst.'));
  }
}

home();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
