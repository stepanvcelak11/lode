// Herní obrazovka – plocha soupeře, vlastní plocha, záznamník, deník a panel akcí.

import { SHIP_TYPES, SHIP_ORDER, STRUCTURE_TYPES } from '../engine/constants.js';
import { label, normalizeShape } from '../engine/geometry.js';
import {
  dispatch, currentItem, patternCells, effectivePattern, PATTERN_NAMES, recordSheet, EFFECT_NAMES,
} from '../engine/game.js';
import { botAction } from '../engine/bot.js';
import { createRng } from '../engine/rng.js';
import { Board } from './board.js';
import { ownRenderer, knownRenderer } from './render.js';
import { h, clear, toast, DICE_FACES } from './dom.js';

const BOT_DELAY = { aim: 900, default: 650 };

export function openGame(root, { state, mode, botPlayer = 1, onChange, onExit, onNewGame }) {
  let tab = 'target';
  let aim = null;
  let mineCell = null;
  let passFor = mode === 'hotseat' ? null : -1; // komu jsme naposledy ukázali obrazovku
  let botTimer = null;
  let flashShown = null;
  let revealAll = false;
  const botRng = createRng(Date.now());

  const viewer = () => (mode === 'bot' ? 1 - botPlayer : state.current);
  const isBotTurn = () => mode === 'bot' && state.current === botPlayer && state.phase !== 'gameover';

  const targetBoard = new Board({ onCell: onTargetCell });
  const ownBoard = new Board({ onCell: onOwnCell });
  const titleEl = h('div', { class: 'title' });
  const tabsEl = h('nav', { class: 'tabs', role: 'tablist' });
  const panel = h('section', { class: 'panel', 'aria-live': 'polite' });
  const recordsEl = h('div', { class: 'records' });
  const logEl = h('ol', { class: 'log' });
  const overlay = h('div', { class: 'overlay hidden' });
  const main = h('main', { class: 'game' },
    h('section', { class: 'pane pane-target' }, h('h2', { class: 'pane-title' }, 'Plocha soupeře'), targetBoard.el),
    h('section', { class: 'pane pane-own' }, h('h2', { class: 'pane-title' }, 'Moje plocha'), ownBoard.el),
    h('section', { class: 'pane pane-records' }, recordsEl),
    h('section', { class: 'pane pane-log' }, logEl),
  );

  clear(root).append(
    h('header', { class: 'topbar' },
      h('button', { class: 'btn ghost', type: 'button', onclick: exit, 'aria-label': 'Menu' }, '☰'),
      titleEl,
      h('span', { class: 'spacer' })),
    tabsEl, main, panel, overlay,
  );

  function exit() {
    clearTimeout(botTimer);
    onExit();
  }

  function act(action) {
    try {
      dispatch(state, action);
    } catch (e) {
      toast(e.message);
      return;
    }
    aim = null;
    mineCell = null;
    onChange(state);
    render();
  }

  function onTargetCell(i) {
    if (isBotTurn() || state.phase !== 'aim' || overlayOpen()) return;
    const item = currentItem(state);
    if (!item || item.pattern === 'guided') return;
    aim = i;
    render();
  }

  function onOwnCell(i) {
    if (isBotTurn() || state.phase !== 'place-mine' || overlayOpen()) return;
    if (!state.options.cells.includes(i)) { toast('Sem minu dát nejde – max. 10 polí od potopené loďky, volné nezasažené políčko.'); return; }
    mineCell = i;
    render();
  }

  const overlayOpen = () => !overlay.classList.contains('hidden');

  // ---------------------------------------------------------------- render
  function render() {
    const v = viewer();
    const me = state.players[v];
    const opp = state.players[1 - v];

    // Předání zařízení (hra dvou hráčů na jednom telefonu)
    if (mode === 'hotseat' && state.phase !== 'start' && state.phase !== 'gameover' && passFor !== state.current) {
      showPass();
    }

    titleEl.replaceChildren(
      h('strong', {}, state.phase === 'gameover' ? 'Konec hry' : state.phase === 'start' ? 'Nová hra' : `Tah ${state.turn}`),
      h('span', {}, state.phase === 'start' ? 'kdo začne?' : `hraje ${state.players[state.current].name}`),
    );

    if (state.phase === 'place-mine' && !isBotTurn()) tab = 'own';
    renderTabs();
    main.dataset.tab = tab;

    // Plocha soupeře
    const item = state.phase === 'aim' && !isBotTurn() ? currentItem(state) : null;
    const preview = new Set(item && aim !== null ? patternCells(state, item, aim) : []);
    const showOpp = state.phase === 'gameover' && revealAll;
    const targetRender = showOpp ? ownRenderer(opp.layout, opp, me.known) : knownRenderer(me.known);
    targetBoard.update((i) => {
      const r = targetRender(i);
      if (preview.has(i)) r.cls += ' preview';
      if (i === aim) r.cls += ' aim';
      return r;
    });
    targetBoard.el.classList.toggle('targeting', !!item && item.pattern !== 'guided');

    // Vlastní plocha
    const ownRender = ownRenderer(me.layout, me, opp.known);
    const mineOptions = state.phase === 'place-mine' && !isBotTurn() ? new Set(state.options.cells) : null;
    ownBoard.update((i) => {
      const r = ownRender(i);
      if (mineOptions?.has(i)) r.cls += ' option';
      if (i === mineCell) r.cls += ' aim';
      return r;
    });

    renderRecords(me, opp, v);
    renderLog();
    renderPanel();
    maybeFlash();
    scheduleBot();
  }

  function renderTabs() {
    const tabs = [['target', 'Soupeř'], ['own', 'Moje plocha'], ['records', 'Záznamník'], ['log', 'Deník']];
    tabsEl.replaceChildren(...tabs.map(([id, text]) => h('button', {
      type: 'button', role: 'tab', class: tab === id ? 'active' : '', 'aria-selected': String(tab === id),
      onclick: () => { tab = id; render(); },
    }, text)));
  }

  function diceView() {
    if (!state.rolls.length) return null;
    return h('div', { class: 'dice-row' }, state.rolls.map((r) => h('div', { class: 'roll' },
      h('span', { class: 'faces' }, r.values.map((n) => h('span', { class: 'die' }, DICE_FACES[n]))),
      h('span', { class: 'roll-label' }, `${r.label}: ${r.values.reduce((a, b) => a + b, 0)}`))));
  }

  function lastMessages() {
    const out = [];
    for (let k = state.log.length - 1; k >= 0 && out.length < 3; k--) {
      const t = state.log[k].text;
      if (t.startsWith('—')) break;
      out.unshift(t);
    }
    return out.length ? h('ul', { class: 'messages' }, out.map((t) => h('li', {}, t))) : null;
  }

  function btn(text, onclick, cls = '') {
    return h('button', { type: 'button', class: `btn ${cls}`, onclick }, text);
  }

  function renderPanel() {
    const s = state;
    const parts = [];
    if (s.phase === 'gameover') {
      const win = s.players[s.winner];
      parts.push(h('p', { class: 'prompt big' }, `🏆 Vyhrává ${win.name}!`));
      parts.push(h('div', { class: 'row-btns' },
        btn(revealAll ? 'Skrýt plochu soupeře' : 'Ukázat plochu soupeře', () => { revealAll = !revealAll; tab = 'target'; render(); }),
        btn('Nová hra', () => { clearTimeout(botTimer); onNewGame(); }, 'primary')));
      panel.replaceChildren(...parts);
      return;
    }
    parts.push(diceView());
    parts.push(lastMessages());
    if (isBotTurn()) {
      parts.push(h('p', { class: 'prompt' }, '🤖 Počítač hraje…'));
      panel.replaceChildren(...parts.filter(Boolean));
      return;
    }
    const P = s.players[s.current];
    const o = s.options || {};
    switch (s.phase) {
      case 'start':
        parts.push(h('p', { class: 'prompt' }, 'Kdo začne? Oba hráči hodí kostkou, větší číslo začíná.'));
        parts.push(btn('🎲 Hodit kostkou', () => act({ type: 'rollStart' }), 'primary'));
        break;
      case 'place-mine':
        parts.push(h('p', { class: 'prompt' }, '💣 Tvoje loďka byla potopena – umísti minu (na své ploše, do 10 polí od loďky).'));
        parts.push(h('div', { class: 'row-btns' },
          btn(mineCell === null ? 'Vyber políčko' : `Umístit minu na ${label(mineCell)}`, () => mineCell !== null && act({ type: 'placeMine', cell: mineCell }), mineCell === null ? 'disabled' : 'primary'),
          btn('Náhodně', () => act({ type: 'placeMine', cell: o.cells[Math.floor(Math.random() * o.cells.length)] }))));
        break;
      case 'roll-double':
        parts.push(h('p', { class: 'prompt' }, 'Bonus: hoď dvěma kostkami – liché číslo = hraješ dvakrát.'));
        parts.push(btn('🎲 Hodit', () => act({ type: 'rollDouble' }), 'primary'));
        break;
      case 'roll-domain':
        parts.push(h('p', { class: 'prompt' }, 'Hoď kostkou: sudé = lodě, liché = pevnina.'));
        parts.push(btn('🎲 Hodit', () => act({ type: 'rollDomain' }), 'primary'));
        break;
      case 'roll-ship':
        parts.push(h('p', { class: 'prompt' }, 'Hoď kostkami – určí, kterou lodí budeš hrát.'));
        parts.push(btn('🎲 Hodit', () => act({ type: 'rollShip' }), 'primary'));
        break;
      case 'choose-ship':
        parts.push(h('p', { class: 'prompt' }, 'Kterou z lodí budeš hrát?'));
        parts.push(h('div', { class: 'row-btns' }, o.ships.map((k) => btn(`${SHIP_TYPES[P.ships[k].type].name} (příď ${label(P.ships[k].cells[0])})`, () => act({ type: 'chooseShip', index: k })))));
        break;
      case 'choose-land':
        parts.push(h('p', { class: 'prompt' }, 'Hraješ pevninu – co použiješ?'));
        parts.push(h('div', { class: 'row-btns' }, o.choices.map((c) => btn(c.label, () => act({ type: 'chooseLand', choice: c.id }), c.enabled ? '' : 'disabled'))));
        break;
      case 'roll-cannon':
        parts.push(h('p', { class: 'prompt' }, 'Hoď kostkami: sudé = obyčejné dělo, liché = naváděné střely.'));
        parts.push(btn('🎲 Hodit', () => act({ type: 'rollCannon' }), 'primary'));
        break;
      case 'roll-bonus':
        parts.push(h('p', { class: 'prompt' }, P.structures.some((x) => x.type === 'Z' && !x.destroyed) ? 'Základna: hoď kostkou o bonus.' : 'Bunkr: nejdřív hoď, jestli bonus dostaneš (liché ano).'));
        parts.push(btn('🎲 Hodit', () => act({ type: 'rollBonus' }), 'primary'));
        break;
      case 'roll-seek':
        parts.push(h('p', { class: 'prompt' }, 'Hledač: hoď kostkami, jestli funguje (liché ano).'));
        parts.push(btn('🎲 Hodit', () => act({ type: 'rollSeek' }), 'primary'));
        break;
      case 'choose-mode':
        parts.push(h('p', { class: 'prompt' }, 'Jak zaútočíš?'));
        parts.push(h('div', { class: 'row-btns' }, o.modes.map((m) => btn(m.label, () => act({ type: 'chooseMode', mode: m.id })))));
        break;
      case 'aim': {
        const item = currentItem(s);
        const left = s.attack.queue.length;
        const pat = effectivePattern(s, item);
        if (item.pattern === 'guided') {
          parts.push(h('p', { class: 'prompt' }, `🚀 Naváděná střela (zbývá ${left}). Kostky určí loď, soupeř místo dopadu.`));
          parts.push(h('div', { class: 'row-btns' }, btn('🚀 Odpálit', () => act({ type: 'fire' }), 'primary'), btn('Nevyužít zbytek', () => act({ type: 'skipRest' }))));
          break;
        }
        const verb = pat === 'reveal' ? '🔍 Odhalit' : pat.startsWith('sonar') ? '📡 Sonar' : '🔥 Vystřelit';
        const hint = pat.startsWith('sonar') ? ' Klepni na levý horní roh oblasti.' : pat === 'bomber' ? ' Míříš na 2. políčko odspodu.' : pat === 'ulo' ? ' Míříš políčkem ◎ tvé střely.' : '';
        parts.push(h('p', { class: 'prompt' }, `Vyber cíl na ploše soupeře: ${PATTERN_NAMES[pat]} (zbývá ${left}).${hint}`));
        parts.push(h('div', { class: 'row-btns' },
          btn(aim === null ? 'Klepni na políčko' : `${verb} na ${label(aim)}`, () => aim !== null && act({ type: 'fire', cell: aim }), aim === null ? 'disabled' : 'primary'),
          btn('Nevyužít zbytek', () => { if (confirm('Opravdu nevyužít zbývající střely?')) act({ type: 'skipRest' }); })));
        if (tab !== 'target') { tab = 'target'; queueMicrotask(render); }
        break;
      }
      case 'extra-roll':
        parts.push(h('p', { class: 'prompt' }, 'Hoď o další střelu (liché = ještě jedna).'));
        parts.push(btn('🎲 Hodit', () => act({ type: 'rollExtra' }), 'primary'));
        break;
      case 'choose-bonus':
        parts.push(h('p', { class: 'prompt' }, s.pending.kind === 'ban' ? 'Co soupeři na 5 kol zakážeš?' : 'Co si dobiješ?'));
        parts.push(h('div', { class: 'row-btns' }, s.pending.options.map((op) => btn(op.label, () => act({ type: 'chooseBonus', choice: op.id })))));
        break;
      case 'end':
        parts.push(btn('Ukončit tah ➜', () => act({ type: 'endTurn' }), 'primary'));
        break;
      default:
        parts.push(h('p', {}, s.phase));
    }
    panel.replaceChildren(...parts.filter(Boolean));
  }

  function shotPreview(shape) {
    if (!shape?.length) return null;
    const n = normalizeShape(shape);
    const w = Math.max(...n.map((p) => p[0])) + 1;
    const hh = Math.max(...n.map((p) => p[1])) + 1;
    const map = new Map(n.map((p, k) => [p.join(','), k]));
    const grid = h('div', { class: 'mini', style: { gridTemplateColumns: `repeat(${w}, 1fr)` } });
    for (let y = hh - 1; y >= 0; y--) for (let x = 0; x < w; x++) {
      const k = map.get(`${x},${y}`);
      grid.append(h('span', { class: k === undefined ? '' : k === 0 ? 'on bow' : 'on' }));
    }
    return grid;
  }

  function renderRecords(me, opp, v) {
    const sheets = [recordSheet(state, v), recordSheet(state, 1 - v)];
    const col = (sheet, own) => {
      const p = own ? me : opp;
      const rows = [];
      rows.push(h('tr', { class: 'sec' }, h('th', { colspan: 2 }, 'Lodě')));
      for (const t of SHIP_ORDER) {
        const x = sheet.ships[t];
        rows.push(h('tr', {}, h('td', {}, SHIP_TYPES[t].name), h('td', { class: 'num' }, pips(x.alive, x.total))));
      }
      rows.push(h('tr', { class: 'sec' }, h('th', { colspan: 2 }, 'Speciální střely')));
      rows.push(h('tr', {}, h('td', {}, 'Devítky'), h('td', { class: 'num' }, pips(sheet.charges.nine, 2))));
      rows.push(h('tr', {}, h('td', {}, 'Sonary'), h('td', { class: 'num' }, pips(sheet.charges.sonar, 4))));
      rows.push(h('tr', { class: 'sec' }, h('th', { colspan: 2 }, 'Stavby')));
      for (const t of ['Z', 'DI', 'DII', 'V', 'P', 'H']) {
        const x = sheet.structures[t];
        const name = t === 'Z' && sheet.bunker ? 'Bunkr (základna zničena)' : STRUCTURE_TYPES[t].name;
        rows.push(h('tr', {}, h('td', {}, name), h('td', { class: 'num' }, t === 'Z' && sheet.bunker ? '∞' : pips(x.alive, x.total))));
      }
      if (own) {
        rows.push(h('tr', {}, h('td', {}, 'Majáky'), h('td', { class: 'num' }, pips(p.lighthouses.filter((l) => !l.used).length, p.lighthouses.length))));
        rows.push(h('tr', {}, h('td', {}, 'Miny'), h('td', { class: 'num' }, String(p.mines.filter((m) => !m.used).length))));
      }
      rows.push(h('tr', { class: 'sec' }, h('th', { colspan: 2 }, 'Bonusy a omezení')));
      const effects = sheet.effects;
      if (!effects.length) rows.push(h('tr', {}, h('td', { colspan: 2, class: 'muted' }, '—')));
      for (const e of effects) {
        const name = e.kind === 'ban' ? `Zákaz: ${SHIP_TYPES[e.target]?.name || STRUCTURE_TYPES[e.target]?.name || e.target}` : EFFECT_NAMES[e.kind];
        rows.push(h('tr', {}, h('td', {}, name), h('td', { class: 'num' }, e.active ? `${e.turnsLeft} ${e.turnsLeft === 1 ? 'tah' : 'tahy'}` : 'od příštího tahu')));
      }
      return h('div', { class: 'sheet' },
        h('h3', {}, own ? `${sheet.name} (já)` : sheet.name),
        own ? h('div', { class: 'ulo-mini' }, h('span', {}, 'Střela ULO'), shotPreview(sheet.uloShot)) : null,
        h('table', {}, h('tbody', {}, rows)));
    };
    recordsEl.replaceChildren(col(sheets[0], true), col(sheets[1], false));
  }

  function pips(alive, total) {
    return h('span', { class: 'pips' }, Array.from({ length: total }, (_, k) => h('i', { class: k < alive ? 'on' : 'off' })));
  }

  // Nejnovější tah nahoře, uvnitř tahu chronologicky.
  function renderLog() {
    const groups = [];
    for (const e of state.log.slice(-300)) {
      if (e.text.startsWith('—') || !groups.length) groups.push([]);
      groups[groups.length - 1].push(e);
    }
    logEl.replaceChildren(...groups.reverse().flat().map((e) => h('li', { class: e.text.startsWith('—') ? 'turn' : '' }, e.text)));
  }

  // -------------------------------------------------------------- overlays
  function showPass() {
    const p = state.players[state.current];
    overlay.classList.remove('hidden');
    overlay.replaceChildren(h('div', { class: 'pass' },
      h('p', { class: 'muted' }, 'Předej zařízení'),
      h('h2', {}, p.name),
      h('p', {}, 'Ostatní se nedívají 🙈'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => {
        passFor = state.current;
        overlay.classList.add('hidden');
        tab = state.phase === 'place-mine' ? 'own' : 'target';
        render();
      } }, `Jsem ${p.name} – ukázat`)));
  }

  function maybeFlash() {
    const f = state.flash;
    if (!f || f.viewer !== viewer() || flashShown === f.turn || isBotTurn()) return;
    flashShown = f.turn;
    const opp = state.players[f.of];
    const b = new Board({ small: true });
    b.update(ownRenderer(opp.layout, opp));
    overlay.classList.remove('hidden');
    overlay.replaceChildren(h('div', { class: 'flash' }, h('h2', {}, 'Plocha soupeře – 1 sekunda!'), b.el));
    setTimeout(() => { overlay.classList.add('hidden'); render(); }, 1000);
  }

  // ------------------------------------------------------------------- bot
  function scheduleBot() {
    clearTimeout(botTimer);
    if (!isBotTurn()) return;
    if (tab === 'target') { tab = 'own'; queueMicrotask(render); return; }
    botTimer = setTimeout(() => {
      const action = botAction(state, botRng);
      if (!action) return;
      act(action);
      if (!isBotTurn() && state.phase !== 'gameover') { tab = 'target'; render(); }
    }, BOT_DELAY[state.phase] || BOT_DELAY.default);
  }

  render();
  return { destroy: () => clearTimeout(botTimer) };
}
