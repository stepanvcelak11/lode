// Animované kostky – ukážou se při každém hodu a vysvětlí, co padlo.

import { h } from './dom.js';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export function dieEl(value, cls = '') {
  const el = h('div', { class: `die3 ${cls}` });
  setFace(el, value);
  return el;
}

function setFace(el, value) {
  el.replaceChildren(...Array.from({ length: 9 }, (_, k) => h('i', { class: PIPS[value].includes(k) ? 'pip' : '' })));
  el.dataset.v = value;
}

let closeTimer = null;

// layer – prvek překryvu; rolls – [{values, label}]; messages – texty výsledku.
export function showDice(layer, rolls, messages = [], { fast = false, onClose = null } = {}) {
  clearTimeout(closeTimer);
  const close = () => {
    if (!layer.classList.contains('show')) return;
    layer.classList.remove('show');
    clearTimeout(closeTimer);
    if (onClose) onClose();
  };
  const rows = rolls.map((r, k) => {
    const total = r.values.reduce((a, b) => a + b, 0);
    const dice = r.values.map((v) => dieEl(1 + Math.floor(Math.random() * 6), 'rolling'));
    const sumEl = h('div', { class: 'dice-sum' }, r.values.length > 1 ? `= ${total}` : '');
    const row = h('div', { class: 'dice-line', style: { animationDelay: `${k * 120}ms` } },
      h('div', { class: 'dice-label' }, r.label),
      h('div', { class: 'dice-faces' }, dice, sumEl));
    // „kutálení“: rychle střídáme stěny, pak ukážeme výsledek
    const spin = setInterval(() => dice.forEach((d) => setFace(d, 1 + Math.floor(Math.random() * 6))), 70);
    setTimeout(() => {
      clearInterval(spin);
      dice.forEach((d, j) => { setFace(d, r.values[j]); d.classList.remove('rolling'); d.classList.add('landed'); });
      sumEl.classList.add('show');
    }, (fast ? 260 : 520) + k * 140);
    return row;
  });
  const shown = messages.filter(Boolean).slice(-4);
  layer.replaceChildren(h('div', { class: 'dice-card', role: 'dialog', 'aria-label': 'Hod kostkou' },
    rows,
    shown.length ? h('ul', { class: 'dice-result' }, shown.map((m) => h('li', {}, m))) : null,
    h('div', { class: 'dice-hint' }, 'Klepni kamkoli pro pokračování')));
  layer.onclick = close;
  layer.classList.add('show');
  const wait = (fast ? 1300 : 2300) + rolls.length * 300;
  closeTimer = setTimeout(close, wait);
}
