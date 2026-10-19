// Herní obrazovka – plocha soupeře, vlastní plocha, záznamník, deník a panel akcí.

import { SHIP_TYPES, SHIP_ORDER, STRUCTURE_TYPES } from '../engine/constants.js';
import { label } from '../engine/geometry.js';
import {
  dispatch, currentItem, patternCells, effectivePattern, PATTERN_NAMES, recordSheet, EFFECT_NAMES,
} from '../engine/game.js';
import { botAction } from '../engine/bot.js';
import { createRng } from '../engine/rng.js';
import { Board } from './board.js';
import { ownRenderer, knownRenderer } from './render.js';
import { showDice } from './dice.js';
import { icon } from './icons.js';
import { shipSilhouette, fleetStrip, patternEl, legendEl, shapeEl } from './widgets.js';
import { h, toast } from './dom.js';

// Prodlevy počítače (ms) při normální rychlosti; rychlost je násobí.
const BOT_DELAY = { aim: 1200, end: 1000, default: 1100 };
const AIM_PREVIEW = 1500;
export const SPEEDS = {
  slow: { label: 'Pomalu', mult: 1.8 },
  normal: { label: 'Normálně', mult: 1 },
  fast: { label: 'Rychle', mult: 0.45 },
};
const TURN_START = ['place-mine', 'roll-double', 'roll-domain'];

export function openGame(root, { state, mode, botPlayer = 1, difficulty = 'normal', speed: initialSpeed = 'normal', onChange, onExit, onNewGame, onSettings = () => {} }) {
  let tab = 'target';
  let aim = null;
  let mineCell = null;
  let passFor = mode === 'hotseat' ? null : -1; // komu jsme naposledy ukázali obrazovku
  let botTimer = null;
  let flashShown = null;
  let revealAll = false;
  let gameoverShown = false;
  let speed = SPEEDS[initialSpeed] ? initialSpeed : 'normal';
  let botAim = null; // kam počítač právě míří (náhled před výstřelem)
  let ackTurn = null; // tah, ve kterém hráč už viděl shrnutí soupeřova tahu
  const botRng = createRng(Date.now());
  const mult = () => SPEEDS[speed].mult;

  const viewer = () => (mode === 'bot' ? 1 - botPlayer : state.current);
  const isBotTurn = () => mode === 'bot' && state.current === botPlayer && state.phase !== 'gameover';
  const pcls = (p) => `pc${p}`;
  // Iniciála do kolečka; když mají oba stejnou, ukáže se číslo hráče.
  const initial = (p) => {
    const [a, b] = state.players.map((x) => x.name.trim().slice(0, 1).toUpperCase());
    return a === b ? String(p + 1) : [a, b][p];
  };

  const targetBoard = new Board({ onCell: onTargetCell, caption: 'Plocha soupeře' });
  const ownBoard = new Board({ onCell: onOwnCell, caption: 'Moje plocha' });
  const titleEl = h('div', { class: 'title' });
  const scoreEl = h('div', { class: 'score' });
  const tabsEl = h('nav', { class: 'tabs', role: 'tablist' });
  const panel = h('section', { class: 'panel', 'aria-live': 'polite' });
  const oppFleet = h('div');
  const ownFleet = h('div');
  const recordsEl = h('div', { class: 'records' });
  const logEl = h('div', { class: 'log' });
  const diceLayer = h('div', { class: 'dice-layer' });
  const sheetLayer = h('div', { class: 'sheet-layer' });
  const passLayer = h('div', { class: 'pass-layer' });
  const main = h('main', { class: 'game' },
    h('section', { class: 'pane pane-target' }, targetBoard.el, oppFleet),
    h('section', { class: 'pane pane-own' }, ownBoard.el, ownFleet),
    h('section', { class: 'pane pane-records' }, recordsEl),
    h('section', { class: 'pane pane-log' }, logEl),
  );

  root.replaceChildren(
    h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn', type: 'button', onclick: exit, 'aria-label': 'Zpět do menu', title: 'Menu (hra se uloží)' }, icon('back')),
      titleEl,
      h('button', { class: 'icon-btn', type: 'button', onclick: openLegend, 'aria-label': 'Legenda', title: 'Co znamenají symboly' }, icon('help'))),
    scoreEl, tabsEl, main, panel, diceLayer, sheetLayer, passLayer,
  );

  function exit() {
    clearTimeout(botTimer);
    onExit();
  }

  // ----------------------------------------------------------------- akce
  function act(action) {
    const ai = state.current;
    const logStart = state.log.length;
    const byBot = isBotTurn();
    try {
      dispatch(state, action);
    } catch (e) {
      toast(e.message);
      return;
    }
    const texts = state.log.slice(logStart).map((e) => e.text).filter((t) => !t.startsWith('—'));
    aim = null;
    mineCell = null;
    onChange(state);
    if (state.rolls.length) showDice(diceLayer, state.rolls, texts, { fast: byBot, speed: mult(), onClose: () => render() });
    if (action.type === 'fire') announce(texts, ai);
    render({ animate: true });
  }

  function announce(texts, ai) {
    const all = texts.join(' | ');
    const mine = mode === 'bot' ? ai === viewer() : true;
    const board = mine ? targetBoard : ownBoard;
    const who = mine ? '' : 'Soupeř: ';
    let b = null;
    let m;
    if ((m = /POTOPENA ([^+|,.]+)/.exec(all))) b = [`${who}Potopena!`, m[1].trim(), 'sunk', 'fire'];
    else if ((m = /([^:|,]+?) ZNIČENO/i.exec(all))) b = [`${who}Zničeno!`, m[1].replace(/^.*: /, '').trim().toLowerCase(), 'sunk', 'fire'];
    else if (/ZÁSAH lodi/.test(all)) b = [`${who}Zásah!`, 'trefa do lodi', 'hit', 'fire'];
    else if (/MAJÁK/.test(all)) b = [`${who}Maják!`, /nabourala/.test(all) ? 'loď nabourala' : 'zasažen maják', 'warn', 'fire'];
    else if (/SESTŘELENO/.test(all)) b = [`${who}Sestřeleno`, 'vzdušná obrana', 'down', 'target'];
    else if (/MINA/.test(all)) b = [`${who}Mina!`, 'odhalena příď lodi', 'warn', 'target'];
    else if (/Sonar/.test(all)) b = [`${who}Sonar`, /nic nenalezeno/.test(all) ? 'nic nenalezeno' : 'něco nalezeno!', 'radar', 'radar'];
    else if ((m = /Odhaleno [^:]+: ([^.|]+)/.exec(all))) b = [`${who}Odhaleno`, m[1], 'info', 'eye'];
    else if ((m = /zásah (ostrov|pevnina|[a-zá-ž ]+)/.exec(all))) b = [`${who}Zásah`, m[1], 'info', 'target'];
    else if (/voda/.test(all)) b = [`${who}Vedle`, 'jen voda', 'miss', 'target'];
    if (!b || /KONEC HRY/.test(all)) return;
    if (/SPECIÁLNÍ POLÍČKO/.test(all)) b[1] += ' · ★ speciální políčko!';
    board.showBanner(b[0], b[2], b[1], b[3]);
    if (!mine && navigator.vibrate && ['hit', 'sunk'].includes(b[2])) navigator.vibrate(60);
  }

  function onTargetCell(i) {
    if (diceOpen()) return;
    const item = !isBotTurn() && state.phase === 'aim' ? currentItem(state) : null;
    if (!item || item.pattern === 'guided') {
      toast(targetBoard.cells[i].title);
      return;
    }
    aim = i;
    render();
  }

  function onOwnCell(i) {
    if (diceOpen()) return;
    if (isBotTurn() || state.phase !== 'place-mine') {
      toast(ownBoard.cells[i].title);
      return;
    }
    if (!state.options.cells.includes(i)) { toast('Sem minu dát nejde – vyber zeleně označené políčko.'); return; }
    mineCell = i;
    render();
  }

  const diceOpen = () => diceLayer.classList.contains('show');

  // ---------------------------------------------------------------- render
  function render({ animate = false } = {}) {
    const v = viewer();
    const me = state.players[v];
    const opp = state.players[1 - v];

    if (mode === 'hotseat' && state.phase !== 'start' && state.phase !== 'gameover' && passFor !== state.current && !diceOpen()) showPass();

    // Hlavička a skóre
    const phaseTitle = state.phase === 'gameover' ? 'Konec hry' : state.phase === 'start' ? 'Nová hra' : `Tah ${state.turn}`;
    titleEl.replaceChildren(h('strong', {}, phaseTitle),
      h('span', {}, state.phase === 'start' ? 'Kdo začne?' : state.phase === 'gameover' ? `Vítězí ${state.players[state.winner].name}` : `Na tahu: ${state.players[state.current].name}`));
    renderScore(v);

    // Automatické přepínání záložek podle situace
    if (summaryEntries().length) tab = 'own';
    if (state.phase === 'place-mine' && !isBotTurn()) tab = 'own';
    if (state.phase === 'aim' && !isBotTurn()) tab = 'target';
    renderTabs();
    main.dataset.tab = tab;

    // Plocha soupeře
    const item = state.phase === 'aim' && !isBotTurn() ? currentItem(state) : null;
    const preview = new Set(item && aim !== null && item.pattern !== 'guided' ? patternCells(state, item, aim) : []);
    const showOpp = state.phase === 'gameover' && revealAll;
    const targetRender = showOpp ? ownRenderer(opp.layout, opp) : knownRenderer(me.known, opp);
    targetBoard.update((i) => {
      const r = targetRender(i);
      if (preview.has(i)) r.cls += ' preview';
      if (i === aim) r.cls += ' aim';
      return r;
    }, { animate });
    targetBoard.el.classList.toggle('targeting', !!item && item.pattern !== 'guided');
    oppFleet.replaceChildren(fleetStrip(opp, { own: false }));

    // Vlastní plocha
    const ownRender = ownRenderer(me.layout, me, opp.known);
    const mineOptions = state.phase === 'place-mine' && !isBotTurn() ? new Set(state.options.cells) : null;
    const botItem = botAim !== null && isBotTurn() ? currentItem(state) : null;
    const botPreview = new Set(botItem ? patternCells(state, botItem, botAim) : []);
    ownBoard.update((i) => {
      const r = ownRender(i);
      if (mineOptions?.has(i)) r.cls += ' option';
      if (botPreview.has(i)) r.cls += ' preview enemy';
      if (i === mineCell || (botItem && i === botAim)) r.cls += ' aim';
      return r;
    }, { animate });
    ownFleet.replaceChildren(fleetStrip(me, { own: true }));

    renderRecords(v);
    renderLog();
    renderPanel();
    maybeFlash();
    maybeGameover();
    scheduleBot();
  }

  function renderScore(v) {
    const pill = (p) => {
      const P = state.players[p];
      const alive = P.ships.filter((s) => !s.sunk).length;
      const active = state.phase !== 'gameover' && state.phase !== 'start' && state.current === p;
      return h('div', { class: `pill ${pcls(p)}${active ? ' active' : ''}${state.winner === p ? ' winner' : ''}` },
        h('span', { class: 'avatar' }, initial(p)),
        h('span', { class: 'pill-name' }, P.name, p === v && mode === 'bot' ? h('small', {}, ' (ty)') : null),
        h('span', { class: 'pill-ships', title: 'Zbývající lodě' }, icon('ship'), String(alive)),
        active ? h('span', { class: 'pill-turn' }, 'na tahu') : null);
    };
    scoreEl.replaceChildren(pill(0), h('span', { class: 'vs' }, 'vs'), pill(1));
  }

  function renderTabs() {
    const tabs = [['target', 'Soupeř', 'target'], ['own', 'Moje', 'ship'], ['records', 'Záznamník', 'sheet'], ['log', 'Deník', 'list']];
    tabsEl.replaceChildren(...tabs.map(([id, text, ic]) => h('button', {
      type: 'button', role: 'tab', class: tab === id ? 'active' : '', 'aria-selected': String(tab === id),
      onclick: () => { tab = id; render(); },
    }, icon(ic), h('span', {}, text))));
  }

  // ---------------------------------------------------------------- panel
  function card(ic, title, desc, onclick, { disabled = false, note = null, primary = false } = {}) {
    return h('button', { type: 'button', class: `choice${disabled ? ' disabled' : ''}${primary ? ' primary' : ''}`, onclick: disabled ? null : onclick, disabled },
      h('span', { class: 'choice-ico' }, ic),
      h('span', { class: 'choice-text' }, h('strong', {}, title), desc ? h('small', {}, desc) : null),
      note ? h('span', { class: 'choice-note' }, note) : null);
  }

  function bigBtn(text, onclick, { ic = 'dice', disabled = false } = {}) {
    return h('button', { type: 'button', class: `btn primary big${disabled ? ' disabled' : ''}`, onclick: disabled ? null : onclick, disabled },
      ic ? icon(ic) : null, h('span', {}, text));
  }

  function sourceInfo() {
    const a = state.attack;
    const P = state.players[state.current];
    if (!a?.source) return null;
    const s = a.source;
    if (s.kind === 'ship') {
      const ship = P.ships[s.index];
      return { domain: 'water', name: SHIP_TYPES[ship.type].name, ic: shipSilhouette(ship.type, null, { cls: 'tiny' }) };
    }
    if (s.kind === 'cannon') return { domain: 'land', name: STRUCTURE_TYPES[s.type].name.replace(' (naváděné střely)', ''), ic: icon(s.type, 'chip-ico st-tile') };
    if (s.kind === 'seeker') return { domain: 'land', name: 'Hledač', ic: icon('H', 'chip-ico st-tile') };
    if (s.kind === 'special') return { domain: null, name: 'Speciální políčko', ic: icon('special', 'chip-ico') };
    return null;
  }

  function contextChips() {
    const ph = state.phase;
    let domain = null;
    const src = sourceInfo();
    if (['roll-ship', 'choose-ship'].includes(ph)) domain = 'water';
    if (['choose-land', 'roll-cannon', 'roll-bonus', 'roll-seek'].includes(ph)) domain = 'land';
    if (src?.domain) domain = src.domain;
    const chips = [];
    if (domain) chips.push(h('span', { class: `chip-ctx ${domain}` }, icon(domain === 'water' ? 'sea' : 'land', 'chip-ico'), domain === 'water' ? 'Moře' : 'Pevnina'));
    if (src) chips.push(h('span', { class: 'chip-ctx' }, src.ic, src.name));
    if (state.attack?.queue?.length && ph === 'aim') {
      const q = state.attack.queue.length;
      chips.push(h('span', { class: 'chip-ctx ammo', title: 'Zbývající střely' },
        Array.from({ length: Math.min(q, 9) }, () => h('i')), q > 9 ? `+${q - 9}` : null));
    }
    return chips.length ? h('div', { class: 'ctx' }, chips) : null;
  }

  function lastResults() {
    const out = [];
    for (let k = state.log.length - 1; k >= 0 && out.length < 3; k--) {
      const t = state.log[k].text;
      if (t.startsWith('—')) break;
      out.unshift(t);
    }
    return out.length ? h('ul', { class: 'messages' }, out.map((t) => h('li', {}, t))) : null;
  }

  function instruction(title, sub) {
    return h('div', { class: 'instr' }, h('h2', {}, title), sub ? h('p', {}, sub) : null);
  }

  function modeCard(m) {
    const full = state.attack.modes.find((x) => x.id === m.id);
    const P = state.players[state.current];
    const first = full.items[0];
    const n = full.items.length;
    const desc = {
      nine: 'Zasáhne celé pole 3×3',
      sonar: 'Odhalí nejbližší věc v poli 4×4',
      minisonar: 'Dvakrát odhalí pole 2×2 (zdarma)',
      guided: 'Kostky vyberou loď, soupeř místo dopadu',
      ordinary: 'Obyčejná střela – obrana ji může sestřelit',
    }[m.id] || (first.pattern === 'bomber' ? 'Bomba na 4 pole svisle' : first.pattern === 'ulo' ? 'Střela tvého tvaru' : first.pass ? 'Proletí vzdušnou obranou' : 'Střela na 1 políčko');
    return card(patternEl(first.pattern, P.layout.uloShot, n), m.label, desc, () => act({ type: 'chooseMode', mode: m.id }));
  }

  // Záznamy soupeřových tahů od mého posledního tahu (pro shrnutí na začátku tahu).
  function summaryEntries() {
    if (isBotTurn() || state.phase === 'gameover' || !TURN_START.includes(state.phase) || ackTurn === state.turn) return [];
    if (mode === 'hotseat' && passFor !== state.current) return [];
    const v = viewer();
    const out = [];
    for (let k = state.log.length - 1; k >= 0; k--) {
      const e = state.log[k];
      if (e.turn >= state.turn) continue;
      if (e.player === v) break;
      out.unshift(e);
    }
    return out.some((e) => !e.text.startsWith('—')) ? out : [];
  }

  function summaryList(entries) {
    return h('ul', { class: 'summary' }, entries.map((e) => {
      const t = e.text;
      if (t.startsWith('—')) return h('li', { class: 'sum-head' }, t.replace(/—/g, '').trim());
      const cls = /POTOPENA|ZNIČENO|KONEC/.test(t) ? 'big' : /ZÁSAH|MAJÁK|MINA|SPECIÁL|zásah/.test(t) ? 'hot' : /bonus|Bonus/.test(t) ? 'bonus' : '';
      return h('li', { class: cls }, t);
    }));
  }

  function speedControl() {
    return h('div', { class: 'speed' }, h('span', { class: 'muted' }, 'Rychlost počítače'),
      h('div', { class: 'seg' }, Object.entries(SPEEDS).map(([id, sp]) => h('button', {
        type: 'button', class: speed === id ? 'active' : '',
        onclick: () => { speed = id; onSettings({ speed }); render(); },
      }, sp.label))));
  }

  function renderPanel() {
    const s = state;
    const parts = [];
    if (s.phase === 'gameover') {
      parts.push(instruction(`🏆 Vítězí ${s.players[s.winner].name}!`, `Hra skončila v ${s.turn}. tahu.`));
      parts.push(h('div', { class: 'actions two' },
        h('button', { type: 'button', class: 'btn', onclick: () => { revealAll = !revealAll; tab = 'target'; render(); } }, revealAll ? 'Skrýt plochu soupeře' : 'Ukázat plochu soupeře'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => { clearTimeout(botTimer); onNewGame(); } }, 'Nová hra')));
      panel.replaceChildren(...parts);
      return;
    }
    if (isBotTurn()) {
      const item = botAim !== null ? currentItem(s) : null;
      parts.push(h('div', { class: 'bot-thinking' }, h('span', { class: 'spinner' }),
        h('strong', {}, item ? `${s.players[s.current].name} míří na ${label(botAim)}` : `${s.players[s.current].name} hraje…`),
        item ? h('span', { class: 'muted' }, ` · ${PATTERN_NAMES[effectivePattern(s, item)]}`) : null));
      parts.push(lastResults());
      parts.push(speedControl());
      panel.replaceChildren(...parts.filter(Boolean));
      return;
    }
    const summary = summaryEntries();
    if (summary.length) {
      const opp = s.players[1 - viewer()];
      parts.push(instruction(`Co udělal ${opp.name}`, 'Na své ploše (záložka Moje) vidíš, kam soupeř střílel.'));
      parts.push(summaryList(summary));
      parts.push(bigBtn('Můj tah', () => { ackTurn = s.turn; tab = 'target'; render(); }, { ic: null }));
      panel.replaceChildren(...parts.filter(Boolean));
      return;
    }
    parts.push(contextChips());
    const P = s.players[s.current];
    const o = s.options || {};
    const hasBase = P.structures.some((x) => x.type === 'Z' && !x.destroyed);
    switch (s.phase) {
      case 'start':
        parts.push(instruction('Kdo začne?', 'Oba hráči hodí kostkou – vyšší číslo začíná.'));
        parts.push(bigBtn('Hodit kostkami', () => act({ type: 'rollStart' })));
        break;
      case 'place-mine':
        parts.push(instruction('💣 Polož minu', 'Tvoje loďka byla potopena. Vyber zelené políčko na své ploše (do 10 polí od ní).'));
        parts.push(h('div', { class: 'actions two' },
          h('button', { type: 'button', class: 'btn', onclick: () => act({ type: 'placeMine', cell: o.cells[Math.floor(Math.random() * o.cells.length)] }) }, 'Náhodně'),
          bigBtn(mineCell === null ? 'Vyber políčko' : `Položit na ${label(mineCell)}`, () => act({ type: 'placeMine', cell: mineCell }), { ic: 'target', disabled: mineCell === null })));
        break;
      case 'roll-double':
        parts.push(instruction('Bonus: dvojitý tah?', 'Hoď dvěma kostkami – liché číslo znamená, že hraješ dvakrát.'));
        parts.push(bigBtn('Hodit', () => act({ type: 'rollDouble' })));
        break;
      case 'roll-domain':
        parts.push(instruction('Hoď kostkou', null));
        parts.push(h('div', { class: 'odds' },
          h('span', { class: 'odd water' }, icon('sea', 'chip-ico'), h('b', {}, 'Sudé'), ' → hraješ lodí'),
          h('span', { class: 'odd land' }, icon('land', 'chip-ico'), h('b', {}, 'Liché'), ' → hraješ pevninou')));
        parts.push(bigBtn('Hodit kostkou', () => act({ type: 'rollDomain' })));
        break;
      case 'roll-ship':
        parts.push(instruction('Která loď vyrazí?', 'Součet dvou kostek určí loď. Čím vzácnější součet, tím silnější loď.'));
        parts.push(h('div', { class: 'ship-odds' }, [
          ['ulo', '2'], ['letadlova', '4'], ['bombarder', '10'], ['bitevni', '7'], ['ponorka', '6 · 8'], ['lodka', '3 5 9 11 12'],
        ].map(([t, n]) => h('div', { class: `so${P.ships.some((x) => x.type === t && !x.sunk) ? '' : ' gone'}` }, shipSilhouette(t, null, { cls: 'tiny' }), h('b', {}, n)))));
        parts.push(bigBtn('Hodit kostkami', () => act({ type: 'rollShip' })));
        break;
      case 'choose-ship':
        parts.push(instruction('Kterou loď pošleš?', 'Máš jich víc stejného druhu – vyber jednu.'));
        parts.push(h('div', { class: 'choices' }, o.ships.map((k) => {
          const ship = P.ships[k];
          const dmg = ship.hit.filter(Boolean).length;
          return card(shipSilhouette(ship.type, ship.cells, { marks: new Map(ship.hit.map((x, j) => [j, x ? 'hit' : '']).filter(([, c]) => c)) }),
            SHIP_TYPES[ship.type].name, `příď na ${label(ship.cells[0])}${dmg ? ` · zásahy ${dmg}` : ''}`, () => act({ type: 'chooseShip', index: k }));
        })));
        break;
      case 'choose-land': {
        parts.push(instruction('Co použiješ na pevnině?', 'Vyber si bez kostek.'));
        const info = {
          cannons: ['DI', 'Děla', 'Kostky vyberou dělo 1 nebo 2'],
          base: ['Z', hasBase ? 'Základna' : 'Bunkr', hasBase ? 'Celý tah = hod o silný bonus' : 'Liché = dostaneš bonus'],
          seeker: ['H', 'Hledač', 'Odhalí 4 políčka (když funguje)'],
        };
        parts.push(h('div', { class: 'choices' }, o.choices.map((c) => {
          const [ic, t, d] = info[c.id];
          return card(icon(ic, 'choice-svg st-tile'), t, d, () => act({ type: 'chooseLand', choice: c.id }), { disabled: !c.enabled, note: c.enabled ? null : 'nelze' });
        })));
        break;
      }
      case 'roll-cannon':
        parts.push(instruction('Které dělo vystřelí?', null));
        parts.push(h('div', { class: 'odds' },
          h('span', { class: 'odd' }, icon('DI', 'chip-ico st-tile'), h('b', {}, 'Sudé'), ' → Dělo 1 (obyčejné)'),
          h('span', { class: 'odd' }, icon('DII', 'chip-ico st-tile'), h('b', {}, 'Liché'), ' → Dělo 2 (naváděné)')));
        parts.push(bigBtn('Hodit kostkami', () => act({ type: 'rollCannon' })));
        break;
      case 'roll-bonus':
        parts.push(instruction(hasBase ? 'Základna – hoď o bonus' : 'Bunkr', hasBase ? 'Číslo na kostce určí bonus (popis najdeš v Záznamníku).' : 'Nejdřív hoď, jestli bonus dostaneš (liché ano).'));
        parts.push(bigBtn('Hodit', () => act({ type: 'rollBonus' })));
        break;
      case 'roll-seek':
        parts.push(instruction('Funguje hledač?', 'Hoď dvěma kostkami – liché číslo = hledač funguje.'));
        parts.push(bigBtn('Hodit kostkami', () => act({ type: 'rollSeek' })));
        break;
      case 'choose-mode':
        parts.push(instruction('Jak zaútočíš?', null));
        parts.push(h('div', { class: 'choices' }, o.modes.map(modeCard)));
        break;
      case 'aim': {
        const item = currentItem(s);
        const pat = effectivePattern(s, item);
        if (item.pattern === 'guided') {
          parts.push(instruction('🚀 Naváděná střela', 'Kostky určí soupeřovu loď, soupeř pak vybere místo dopadu kousek od ní.'));
          parts.push(h('div', { class: 'actions two' },
            h('button', { type: 'button', class: 'btn', onclick: () => act({ type: 'skipRest' }) }, 'Nevyužít'),
            bigBtn('Odpálit', () => act({ type: 'fire' }), { ic: 'rocket' })));
          break;
        }
        const verb = pat === 'reveal' ? 'Odhalit' : pat.startsWith('sonar') ? 'Spustit sonar' : 'Vystřelit';
        const hint = pat.startsWith('sonar') ? 'Klepni na levý horní roh oblasti.'
          : pat === 'bomber' ? 'Míříš na 2. políčko odspodu.'
            : pat === 'ulo' ? 'Míříš políčkem ◎ své střely.'
              : pat === 'reveal' ? 'Klepni na políčko, které chceš odhalit.' : 'Klepni na políčko na ploše soupeře.';
        parts.push(h('div', { class: 'aim-row' },
          patternEl(pat, P.layout.uloShot),
          instruction(aim === null ? 'Zaměř cíl' : `Cíl: ${label(aim)}`, `${PATTERN_NAMES[pat][0].toUpperCase()}${PATTERN_NAMES[pat].slice(1)}. ${hint}`)));
        parts.push(h('div', { class: 'actions two' },
          h('button', { type: 'button', class: 'btn', onclick: () => { if (confirm('Opravdu nevyužít zbývající střely?')) act({ type: 'skipRest' }); } }, 'Nevyužít'),
          bigBtn(aim === null ? 'Vyber cíl na ploše' : `${verb} na ${label(aim)}`, () => act({ type: 'fire', cell: aim }), { ic: pat === 'reveal' ? 'eye' : pat.startsWith('sonar') ? 'radar' : 'fire', disabled: aim === null })));
        break;
      }
      case 'extra-roll':
        parts.push(instruction('Střela navíc?', 'Hoď kostkou – liché číslo = ještě jedna střela.'));
        parts.push(bigBtn('Hodit', () => act({ type: 'rollExtra' })));
        break;
      case 'choose-bonus':
        parts.push(instruction(s.pending.kind === 'ban' ? '★ Co soupeři zakážeš na 5 kol?' : '★ Co si dobiješ?', null));
        parts.push(h('div', { class: 'choices' }, s.pending.options.map((op) => {
          const ic = SHIP_TYPES[op.id] ? shipSilhouette(op.id, null, { cls: 'tiny' }) : icon(op.id === 'nine' ? 'target' : op.id === 'sonar' ? 'radar' : op.id, `choice-svg${STRUCTURE_TYPES[op.id] ? ' st-tile' : ''}`);
          return card(ic, op.label, null, () => act({ type: 'chooseBonus', choice: op.id }));
        })));
        break;
      case 'end': {
        const next = s.extraTurns > 0 ? 'Hraješ ještě jednou!' : mode === 'hotseat' ? `Předat tah: ${s.players[1 - s.current].name}` : 'Ukončit tah';
        parts.push(lastResults());
        parts.push(bigBtn(next, () => act({ type: 'endTurn' }), { ic: null }));
        break;
      }
      default:
        parts.push(h('p', {}, s.phase));
    }
    panel.replaceChildren(...parts.filter(Boolean));
  }

  // ------------------------------------------------------------ záznamník
  function renderRecords(v) {
    const col = (p) => {
      const sheet = recordSheet(state, p);
      const P = state.players[p];
      const own = p === v;
      const row = (ic, name, value, cls = '') => h('div', { class: `rec-row ${cls}` }, h('span', { class: 'rec-ico' }, ic), h('span', { class: 'rec-name' }, name), h('span', { class: 'rec-val' }, value));
      const pips = (alive, total) => h('span', { class: 'pips' }, Array.from({ length: total }, (_, k) => h('i', { class: k < alive ? 'on' : 'off' })));
      const ships = SHIP_ORDER.map((t) => row(shipSilhouette(t, null, { cls: 'tiny' }), SHIP_TYPES[t].name, pips(sheet.ships[t].alive, sheet.ships[t].total), sheet.ships[t].alive ? '' : 'gone'));
      const structs = ['Z', 'DI', 'DII', 'V', 'P', 'H'].map((t) => {
        const x = sheet.structures[t];
        if (t === 'Z' && sheet.bunker) return row(icon('Z', 'rec-svg st-tile'), 'Bunkr (základna padla)', h('span', { class: 'inf' }, '∞'));
        return row(icon(t, 'rec-svg st-tile'), STRUCTURE_TYPES[t].name.replace(' (naváděné střely)', ' – naváděné'), pips(x.alive, x.total), x.alive ? '' : 'gone');
      });
      const effects = sheet.effects.map((e) => {
        const name = e.kind === 'ban' ? `Zákaz: ${SHIP_TYPES[e.target]?.name || STRUCTURE_TYPES[e.target]?.name || e.target}` : EFFECT_NAMES[e.kind];
        return h('div', { class: `effect${e.active ? '' : ' pending'}` }, h('span', {}, name), h('b', {}, e.active ? `${e.turnsLeft}×` : 'příští tah'));
      });
      return h('article', { class: `rec ${pcls(p)}` },
        h('header', {}, h('span', { class: 'avatar' }, initial(p)), h('h3', {}, P.name), own ? h('small', {}, 'já') : null),
        h('h4', {}, 'Lodě'), ships,
        h('h4', {}, 'Speciální střely'),
        row(icon('target', 'rec-svg'), 'Devítky (3×3)', pips(sheet.charges.nine, 2)),
        row(icon('radar', 'rec-svg'), 'Sonary (4×4)', pips(sheet.charges.sonar, 4)),
        own ? h('div', { class: 'rec-ulo' }, h('span', {}, 'Tvar střely ULO'), shapeEl(sheet.uloShot, { cls: 'sil ship-ulo', bow: true })) : null,
        h('h4', {}, 'Stavby'), structs,
        own ? row(icon('lighthouse', 'rec-svg sea-tile'), 'Majáky', pips(P.lighthouses.filter((l) => !l.used).length, P.lighthouses.length)) : null,
        own ? row(icon('mine', 'rec-svg sea-tile'), 'Položené miny', String(P.mines.filter((m) => !m.used).length)) : null,
        h('h4', {}, 'Bonusy a omezení'),
        effects.length ? effects : h('p', { class: 'muted small' }, 'Žádné'));
    };
    recordsEl.replaceChildren(col(v), col(1 - v));
  }

  // Nejnovější tah nahoře, uvnitř tahu chronologicky.
  function renderLog() {
    const groups = [];
    for (const e of state.log.slice(-400)) {
      if (e.text.startsWith('—') || !groups.length) groups.push({ player: e.player, head: e.text.startsWith('—') ? e.text.replace(/—/g, '').trim() : null, items: [] });
      else groups[groups.length - 1].items.push(e.text);
    }
    logEl.replaceChildren(...groups.reverse().slice(0, 60).map((g) => h('article', { class: `log-turn ${pcls(g.player)}` },
      g.head ? h('header', {}, h('span', { class: 'dot' }), g.head) : null,
      h('ul', {}, g.items.map((t) => h('li', { class: /POTOPENA|ZNIČENO|KONEC/.test(t) ? 'big' : /ZÁSAH|MAJÁK|MINA|SPECIÁL/.test(t) ? 'hot' : '' }, t))))));
  }

  // -------------------------------------------------------------- vrstvy
  function openSheet(title, body, actions = []) {
    sheetLayer.replaceChildren(h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
      h('header', {}, h('h2', {}, title), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Zavřít', onclick: closeSheet }, '✕')),
      h('div', { class: 'sheet-body' }, body),
      actions.length ? h('footer', {}, actions) : null));
    sheetLayer.classList.add('show');
    sheetLayer.onclick = (e) => { if (e.target === sheetLayer) closeSheet(); };
  }

  function closeSheet() {
    sheetLayer.classList.remove('show');
  }

  function openLegend() {
    openSheet('Co znamenají symboly', legendEl());
  }

  function showPass() {
    const p = state.current;
    const P = state.players[p];
    passLayer.classList.add('show');
    passLayer.replaceChildren(h('div', { class: `pass ${pcls(p)}` },
      h('p', { class: 'muted' }, 'Předej zařízení'),
      h('div', { class: 'avatar big' }, initial(p)),
      h('h2', {}, P.name),
      h('p', {}, 'Ostatní se nedívají 🙈'),
      h('button', { type: 'button', class: 'btn primary big', onclick: () => {
        passFor = state.current;
        passLayer.classList.remove('show');
        tab = state.phase === 'place-mine' ? 'own' : 'target';
        render();
      } }, `Jsem ${P.name} – hrát`)));
  }

  function maybeFlash() {
    const f = state.flash;
    if (!f || f.viewer !== viewer() || flashShown === f.turn || isBotTurn()) return;
    flashShown = f.turn;
    const opp = state.players[f.of];
    const b = new Board({ small: true });
    b.update(ownRenderer(opp.layout, opp));
    passLayer.classList.add('show');
    passLayer.replaceChildren(h('div', { class: 'flash' }, h('h2', {}, '👀 Plocha soupeře – jen 1 sekundu!'), h('div', { class: 'flash-bar' }), b.el));
    setTimeout(() => { passLayer.classList.remove('show'); render(); }, 1000);
  }

  function maybeGameover() {
    if (state.phase !== 'gameover' || gameoverShown) return;
    gameoverShown = true;
    const w = state.winner;
    const sunkBy = (p) => state.players[1 - p].ships.filter((s) => s.sunk).length;
    setTimeout(() => openSheet('Konec hry', h('div', { class: `gameover ${pcls(w)}` },
      h('div', { class: 'trophy' }, icon('trophy')),
      h('h2', {}, `Vítězí ${state.players[w].name}!`),
      h('div', { class: 'stats' },
        h('div', {}, h('b', {}, String(state.turn)), h('span', {}, 'tahů')),
        h('div', {}, h('b', {}, String(sunkBy(0))), h('span', {}, `potopil ${state.players[0].name}`)),
        h('div', {}, h('b', {}, String(sunkBy(1))), h('span', {}, `potopil ${state.players[1].name}`)))),
    [
      h('button', { type: 'button', class: 'btn', onclick: () => { closeSheet(); revealAll = true; tab = 'target'; render(); } }, 'Prohlédnout plochy'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => { clearTimeout(botTimer); onNewGame(); } }, 'Nová hra'),
    ]), 900);
  }

  // ------------------------------------------------------------------- bot
  function scheduleBot() {
    if (botAim !== null) return; // čeká se na výstřel po náhledu
    clearTimeout(botTimer);
    if (!isBotTurn()) return;
    if (tab === 'target') { tab = 'own'; queueMicrotask(render); return; }
    const delay = (BOT_DELAY[state.phase] || BOT_DELAY.default) * mult();
    botTimer = setTimeout(() => {
      if (diceOpen()) { scheduleBot(); return; }
      const action = botAction(state, botRng, difficulty);
      if (!action) return;
      // Před výstřelem počítač nejdřív ukáže, kam míří.
      if (action.type === 'fire' && action.cell !== undefined && botAim === null) {
        botAim = action.cell;
        render();
        clearTimeout(botTimer);
        botTimer = setTimeout(() => { botAim = null; act(action); }, AIM_PREVIEW * mult());
        return;
      }
      act(action);
    }, delay);
  }

  render();
  return { destroy: () => clearTimeout(botTimer) };
}
