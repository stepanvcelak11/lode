// Hlavní řízení aplikace: menu, příprava hry, editor, hra, pravidla.

import { createGame } from '../engine/game.js';
import { randomLayout } from '../engine/layout.js';
import { createRng } from '../engine/rng.js';
import { openEditor } from './editor.js';
import { openGame } from './play.js';
import { h, store, hideToast } from './dom.js';
import { icon } from './icons.js';
import { markdownToHtml } from './markdown.js';

const SAVE_KEY = 'lode.save.v1';
const NAMES_KEY = 'lode.names';
const PREFS_KEY = 'lode.prefs';

const DIFFICULTIES = {
  easy: { label: 'Lehká', desc: 'Střílí většinou naslepo. Na seznámení se hrou.' },
  normal: { label: 'Střední', desc: 'Po zásahu loď dorazí, jinak hledá náhodně.' },
  hard: { label: 'Těžká', desc: 'Počítá, kde lodě mohou být, a vyhýbá se tvé obraně.' },
};
const SPEED_LABELS = { slow: 'Pomalu', normal: 'Normálně', fast: 'Rychle' };
const root = document.getElementById('app');
let current = null;

function cleanup() {
  if (current?.destroy) current.destroy();
  current = null;
  hideToast();
  window.scrollTo(0, 0);
}

const HERO = `<svg viewBox="0 0 360 170" class="hero-svg" aria-hidden="true">
  <defs>
    <linearGradient id="hs" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f2b544" stop-opacity=".35"/><stop offset="1" stop-color="#f2b544" stop-opacity="0"/></linearGradient>
  </defs>
  <circle cx="270" cy="52" r="26" fill="url(#hs)"/>
  <circle cx="270" cy="52" r="13" fill="#f2b544" opacity=".9"/>
  <g class="hero-ship">
    <path d="M70 112h190l-22 26H96z" fill="#dfe8f0"/>
    <path d="M110 112V94h70v18" fill="#c3d0dc"/>
    <path d="M128 94V78h28v16" fill="#dfe8f0"/>
    <rect x="138" y="62" width="6" height="16" fill="#9fb0c0"/>
    <path d="M180 100h52" stroke="#9fb0c0" stroke-width="6" stroke-linecap="round"/>
    <circle cx="112" cy="124" r="3" fill="#7d8fa1"/><circle cx="130" cy="124" r="3" fill="#7d8fa1"/><circle cx="148" cy="124" r="3" fill="#7d8fa1"/>
  </g>
  <path class="wave w1" d="M0 140c20-8 40-8 60 0s40 8 60 0c20-8 40-8 60 0s40 8 60 0c20-8 40-8 60 0s40 8 60 0c20-8 40-8 60 0s40 8 60 0c20-8 40-8 60 0s40 8 60 0v40H0z" fill="#1d5a8c"/>
  <path class="wave w2" d="M0 150c20-7 40-7 60 0s40 7 60 0c20-7 40-7 60 0s40 7 60 0c20-7 40-7 60 0s40 7 60 0c20-7 40-7 60 0s40 7 60 0c20-7 40-7 60 0s40 7 60 0v40H0z" fill="#134673"/>
</svg>`;

function home() {
  cleanup();
  const save = store.get(SAVE_KEY);
  const canResume = save && save.state && save.state.phase !== 'gameover';
  const item = (ic, title, sub, onclick, cls = '') => h('button', { type: 'button', class: `menu-item ${cls}`, onclick },
    h('span', { class: 'mi-ico' }, typeof ic === 'string' ? icon(ic) : ic),
    h('span', { class: 'mi-text' }, h('strong', {}, title), h('small', {}, sub)),
    h('span', { class: 'mi-arrow' }, '›'));
  root.replaceChildren(h('main', { class: 'home' },
    h('div', { class: 'hero', html: HERO }),
    h('h1', { class: 'logo-title' }, 'LODĚ'),
    h('p', { class: 'tagline' }, 'Námořní bitva s pevninou, děly, majáky a bonusy'),
    h('div', { class: 'menu' },
      canResume ? item('fire', 'Pokračovat ve hře', `${save.state.players[0].name} vs ${save.state.players[1].name} · tah ${save.state.turn}${save.mode === 'bot' ? ` · ${DIFFICULTIES[save.difficulty || 'normal'].label.toLowerCase()}` : ''}`, () => resume(save), 'primary') : null,
      item('ship', 'Hra proti počítači', 'Ty proti počítačovému admirálovi', () => setup('bot')),
      item(h('span', { class: 'two-av' }, h('i', { class: 'pc0' }, 'A'), h('i', { class: 'pc1' }, 'B')), 'Dva hráči', 'Na jednom telefonu, střídáte se', () => setup('hotseat')),
      item('book', 'Pravidla', 'Jak se hraje', rules, 'ghost')),
    h('p', { class: 'foot muted' }, 'Verze 0.3')));
}

function setup(mode) {
  cleanup();
  const names = store.get(NAMES_KEY, ['Hráč 1', 'Hráč 2']);
  const n1 = h('input', { type: 'text', value: names[0], maxlength: 16, 'aria-label': 'Jméno hráče 1', autocomplete: 'off' });
  const n2 = h('input', { type: 'text', value: mode === 'bot' ? 'Počítač' : names[1], maxlength: 16, 'aria-label': 'Jméno hráče 2', autocomplete: 'off', disabled: mode === 'bot' });
  const field = (k, labelText, input) => h('label', { class: `name-field pc${k}` }, h('span', { class: 'avatar' }, String(k + 1)), h('span', { class: 'nf-text' }, h('small', {}, labelText), input));
  const prefs = { difficulty: 'normal', speed: 'normal', ...store.get(PREFS_KEY, {}) };
  const diffEl = h('div', { class: 'diff' });
  const speedEl = h('div', { class: 'seg wide' });
  const renderPrefs = () => {
    diffEl.replaceChildren(...Object.entries(DIFFICULTIES).map(([id, d]) => h('button', {
      type: 'button', class: `diff-opt${prefs.difficulty === id ? ' active' : ''}`, 'aria-pressed': String(prefs.difficulty === id),
      onclick: () => { prefs.difficulty = id; renderPrefs(); },
    }, h('span', { class: `diff-dots d-${id}` }, h('i'), h('i'), h('i')), h('strong', {}, d.label), h('small', {}, d.desc))));
    speedEl.replaceChildren(...Object.entries(SPEED_LABELS).map(([id, l]) => h('button', {
      type: 'button', class: prefs.speed === id ? 'active' : '', onclick: () => { prefs.speed = id; renderPrefs(); },
    }, l)));
  };
  renderPrefs();
  const go = () => {
    const list = [n1.value.trim() || 'Hráč 1', n2.value.trim() || 'Hráč 2'];
    store.set(NAMES_KEY, mode === 'hotseat' ? list : [list[0], names[1]]);
    store.set(PREFS_KEY, prefs);
    placeFor(mode, list, 0, [], prefs);
  };
  root.replaceChildren(
    h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn', type: 'button', onclick: home, 'aria-label': 'Zpět' }, icon('back')),
      h('div', { class: 'title' }, h('strong', {}, mode === 'bot' ? 'Hra proti počítači' : 'Dva hráči'))),
    h('main', { class: 'setup' },
      h('div', { class: 'setup-card' },
        h('h2', {}, 'Kdo hraje?'),
        field(0, 'Hráč 1', n1),
        h('div', { class: 'vs-line' }, 'vs'),
        field(1, mode === 'bot' ? 'Soupeř' : 'Hráč 2', n2),
        mode === 'bot' ? h('div', { class: 'pref' }, h('h3', {}, 'Obtížnost'), diffEl) : null,
        mode === 'bot' ? h('div', { class: 'pref' }, h('h3', {}, 'Rychlost tahů počítače'), speedEl, h('small', { class: 'muted' }, 'Rychlost můžeš změnit i během hry.')) : null,
        h('ol', { class: 'how' },
          h('li', {}, 'Rozmístíš pevninu, stavby, ostrovy a lodě (nebo vše náhodně jedním tlačítkem).'),
          mode === 'bot' ? h('li', {}, 'Počítač si svou plochu rozmístí sám.') : h('li', {}, 'Pak předáš telefon a druhý hráč udělá totéž – nedívej se!'),
          h('li', {}, 'Každý tah začíná hodem kostkou. Hra tě vede krok za krokem.')),
        h('button', { type: 'button', class: 'btn primary big', onclick: go }, 'Pokračovat →'))));
}

function placeFor(mode, names, k, layouts, prefs = {}) {
  if (mode === 'bot' && k === 1) {
    layouts[1] = randomLayout(createRng(Date.now()));
    return start(mode, names, layouts, prefs);
  }
  if (k === 2) return start(mode, names, layouts, prefs);
  const go = () => openEditor(root, {
    playerName: names[k],
    playerIndex: k,
    initial: null,
    onBack: home,
    onDone: (layout) => { layouts[k] = layout; placeFor(mode, names, k + 1, layouts, prefs); },
  });
  if (mode === 'hotseat' && k === 1) passScreen(1, names[1], 'rozmístit svou plochu', go);
  else go();
}

function passScreen(k, name, what, onGo) {
  cleanup();
  root.replaceChildren(h('main', { class: `pass-screen pc${k}` },
    h('p', { class: 'muted' }, 'Předej zařízení'),
    h('div', { class: 'avatar big' }, name.slice(0, 1).toUpperCase()),
    h('h1', {}, name),
    h('p', {}, `Teď budeš ${what}. Ostatní se nedívají 🙈`),
    h('button', { type: 'button', class: 'btn primary big', onclick: onGo }, `Jsem ${name}`)));
}

function start(mode, names, layouts, prefs = {}) {
  const state = createGame({ layouts, names, seed: Date.now() });
  const save = { mode, botPlayer: 1, difficulty: prefs.difficulty || 'normal', speed: prefs.speed || 'normal', state };
  store.set(SAVE_KEY, save);
  resume(save);
}

function resume(save) {
  cleanup();
  current = openGame(root, {
    state: save.state,
    mode: save.mode,
    botPlayer: save.botPlayer,
    difficulty: save.difficulty || 'normal',
    speed: save.speed || 'normal',
    onChange: (state) => store.set(SAVE_KEY, { ...save, state }),
    onSettings: (patch) => {
      Object.assign(save, patch);
      store.set(SAVE_KEY, save);
      store.set(PREFS_KEY, { ...store.get(PREFS_KEY, {}), ...patch });
    },
    onExit: home,
    onNewGame: () => { store.remove(SAVE_KEY); home(); },
  });
}

async function rules() {
  cleanup();
  const body = h('article', { class: 'rules' }, h('p', { class: 'muted' }, 'Načítám pravidla…'));
  root.replaceChildren(
    h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn', type: 'button', onclick: home, 'aria-label': 'Zpět' }, icon('back')),
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
