// Editor rozmístění – hráč si nakreslí pevninu, stavby, ostrovy, majáky,
// speciální políčko, lodě a tvar střely ULO.

import {
  SHIP_TYPES, SHIP_ORDER, STRUCTURE_TYPES, LAND_CELLS, MAX_ISLANDS, MAX_LIGHTHOUSES, ULO_SHOT_SIZE,
} from '../engine/constants.js';
import {
  idx, xOf, yOf, inBounds, transformShape, isConnected4, anchorShape, normalizeShape,
} from '../engine/geometry.js';
import {
  emptyLayout, cloneLayout, occupancy, validateLayout, shipPlacementErrors, randomLayout, shipSize, tryPlaceShip,
} from '../engine/layout.js';
import { createRng } from '../engine/rng.js';
import { Board } from './board.js';
import { ownRenderer } from './render.js';
import { h, clear, toast } from './dom.js';

const TOOL_GROUPS = [
  { title: 'Terén', tools: [
    { id: 'land', label: 'Pevnina' },
    { id: 'island', label: 'Ostrov' },
    { id: 'lighthouse', label: 'Maják' },
    { id: 'special', label: 'Speciální' },
    { id: 'erase', label: 'Guma' },
  ] },
  { title: 'Stavby (na pevnině)', tools: ['Z', 'P', 'V', 'DI', 'DII', 'H'].map((id) => ({ id, label: STRUCTURE_TYPES[id].name })) },
  { title: 'Lodě', tools: SHIP_ORDER.map((id) => ({ id, label: SHIP_TYPES[id].name })) },
];

export function openEditor(root, { playerName, initial, onDone, onBack }) {
  let layout = initial ? cloneLayout(initial) : emptyLayout();
  let tool = 'land';
  let rotation = 0;
  let mirrored = false;
  let draft = [];
  let hover = null;
  let showErrors = false;

  const board = new Board({ onCell: (i) => { apply(i); refresh(); } });
  board.grid.addEventListener('mouseover', (e) => {
    const t = e.target.closest('.cell');
    hover = t ? Number(t.dataset.i) : null;
    paint();
  });
  board.grid.addEventListener('mouseleave', () => { hover = null; paint(); });

  const palette = h('div', { class: 'palette' });
  const status = h('div', { class: 'editor-status' });
  const shotEditor = h('div', { class: 'ulo-shot' });
  const doneBtn = h('button', { class: 'btn primary', type: 'button', onclick: finish }, 'Hotovo');

  clear(root).append(
    h('header', { class: 'topbar' },
      h('button', { class: 'btn ghost', type: 'button', onclick: onBack }, '←'),
      h('div', { class: 'title' }, h('strong', {}, playerName), h('span', {}, 'rozmísti svou plochu')),
      doneBtn),
    h('main', { class: 'editor' },
      h('section', { class: 'editor-board' }, board.el),
      h('aside', { class: 'editor-side' },
        palette,
        h('div', { class: 'row-btns' },
          h('button', { class: 'btn', type: 'button', onclick: () => { layout = randomLayout(createRng(Date.now())); draft = []; refresh(); } }, '🎲 Náhodně vše'),
          h('button', { class: 'btn', type: 'button', onclick: randomShips }, '🎲 Jen lodě'),
          h('button', { class: 'btn danger', type: 'button', onclick: () => { if (confirm('Opravdu vymazat celé rozmístění?')) { layout = emptyLayout(); draft = []; refresh(); } } }, 'Vymazat')),
        shotEditor,
        status)),
  );

  function count(kind) {
    if (kind === 'land') return layout.land.length;
    if (kind === 'island') return layout.islands.length;
    if (kind === 'lighthouse') return layout.lighthouses.length;
    if (kind === 'special') return layout.special === null ? 0 : 1;
    if (STRUCTURE_TYPES[kind]) return layout.structures.filter((s) => s.type === kind).length;
    if (SHIP_TYPES[kind]) return layout.ships.filter((s) => s.type === kind).length;
    return 0;
  }

  function maxOf(kind) {
    if (kind === 'land') return LAND_CELLS;
    if (kind === 'island') return MAX_ISLANDS;
    if (kind === 'lighthouse') return MAX_LIGHTHOUSES;
    if (kind === 'special') return 1;
    if (STRUCTURE_TYPES[kind]) return STRUCTURE_TYPES[kind].count;
    if (SHIP_TYPES[kind]) return SHIP_TYPES[kind].count;
    return null;
  }

  function currentShape() {
    if (SHIP_TYPES[tool]?.shape) return transformShape(SHIP_TYPES[tool].shape, rotation, mirrored);
    const def = STRUCTURE_TYPES[tool];
    if (def?.rect) {
      const [w, hh] = rotation % 2 ? [def.rect[1], def.rect[0]] : def.rect;
      const out = [];
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) out.push([x, y]);
      return out;
    }
    return null;
  }

  // Buňky tvaru tak, aby příď (první buňka) ležela na kliknutém políčku.
  function cellsAt(i) {
    const shape = currentShape();
    if (!shape) return null;
    const [bx, by] = shape[0];
    const out = [];
    for (const [dx, dy] of shape) {
      const x = xOf(i) + dx - bx, y = yOf(i) + dy - by;
      if (!inBounds(x, y)) return null;
      out.push(idx(x, y));
    }
    return out;
  }

  function removeShipAt(i) {
    const k = layout.ships.findIndex((s) => s.cells.includes(i));
    if (k === -1) return null;
    const [ship] = layout.ships.splice(k, 1);
    return ship;
  }

  function removeStructureAt(i) {
    const k = layout.structures.findIndex((s) => s.cells.includes(i));
    if (k === -1) return null;
    const [s] = layout.structures.splice(k, 1);
    return s;
  }

  function blockedForLand(c, occ) {
    return occ.ship[c] !== -1 || occ.island[c] || occ.lighthouse[c];
  }

  function placeStructure(type, cells) {
    const occ = occupancy(layout);
    if (cells.some((c) => blockedForLand(c, occ))) return toast('Stavba musí stát na volném místě (bez lodí, ostrovů a majáků).');
    if (cells.some((c) => occ.structure[c] !== -1)) return toast('Tady už stojí jiná stavba.');
    if (count(type) >= maxOf(type)) {
      // přesun: odeber nejstarší stavbu stejného typu
      const k = layout.structures.findIndex((s) => s.type === type);
      layout.structures.splice(k, 1);
    }
    for (const c of cells) if (!layout.land.includes(c)) layout.land.push(c);
    if (cells.includes(layout.special)) layout.special = null;
    layout.structures.push({ type, cells });
  }

  function apply(i) {
    const occ = occupancy(layout);
    if (tool === 'erase') {
      if (removeShipAt(i)) return;
      if (layout.special === i) { layout.special = null; return; }
      if (removeStructureAt(i)) return;
      if (layout.islands.includes(i)) { layout.islands = layout.islands.filter((c) => c !== i); return; }
      if (layout.lighthouses.includes(i)) { layout.lighthouses = layout.lighthouses.filter((c) => c !== i); return; }
      layout.land = layout.land.filter((c) => c !== i);
      return;
    }
    // Klepnutí na loď nástrojem lodě = zvednout ji (pak ji lze položit jinam).
    if (SHIP_TYPES[tool] && occ.ship[i] !== -1) {
      const ship = removeShipAt(i);
      tool = ship.type;
      draft = [];
      toast(`${SHIP_TYPES[ship.type].name} zvednuta – klepni, kam ji položit.`);
      return;
    }
    switch (tool) {
      case 'land': {
        if (layout.land.includes(i)) {
          removeStructureAt(i);
          layout.land = layout.land.filter((c) => c !== i);
        } else {
          if (blockedForLand(i, occ)) return toast('Na lodi, ostrově ani majáku nemůže být pevnina.');
          layout.land.push(i);
        }
        return;
      }
      case 'island':
        if (layout.islands.includes(i)) { layout.islands = layout.islands.filter((c) => c !== i); return; }
        if (occ.land[i] || occ.ship[i] !== -1 || occ.lighthouse[i] || layout.special === i) return toast('Ostrov patří na volnou vodu.');
        if (count('island') >= MAX_ISLANDS) return toast(`Ostrovů může být nejvýš ${MAX_ISLANDS}.`);
        layout.islands.push(i);
        return;
      case 'lighthouse':
        if (layout.lighthouses.includes(i)) { layout.lighthouses = layout.lighthouses.filter((c) => c !== i); return; }
        if (occ.land[i] || occ.ship[i] !== -1 || occ.island[i] || layout.special === i) return toast('Maják patří na volnou vodu (max. 3 pole od pevniny).');
        if (count('lighthouse') >= MAX_LIGHTHOUSES) return toast(`Majáky mohou být nejvýš ${MAX_LIGHTHOUSES}.`);
        layout.lighthouses.push(i);
        return;
      case 'special':
        if (occ.ship[i] !== -1 || occ.island[i] || occ.lighthouse[i] || occ.structure[i] !== -1) return toast('Speciální políčko patří na volnou vodu nebo volnou pevninu.');
        layout.special = layout.special === i ? null : i;
        return;
      case 'H':
      case 'ulo': {
        const size = tool === 'H' ? 3 : shipSize('ulo');
        if (draft.includes(i)) { draft = draft.filter((c) => c !== i); return; }
        draft.push(i);
        if (draft.length < size) return;
        const cells = draft;
        draft = [];
        if (!isConnected4(cells)) return toast('Políčka musí být spojená (ne úhlopříčně). Zkus to znovu.');
        if (tool === 'H') return placeStructure('H', cells);
        if (count('ulo') >= 1) return toast('ULO už je rozmístěné.');
        const errors = shipPlacementErrors(layout, 'ulo', cells);
        if (errors.length) return toast(errors[0]);
        layout.ships.push({ type: 'ulo', cells });
        return;
      }
      default:
    }
    const cells = cellsAt(i);
    if (!cells) return toast('Nevejde se na plochu.');
    if (STRUCTURE_TYPES[tool]) return placeStructure(tool, cells);
    if (SHIP_TYPES[tool]) {
      if (count(tool) >= maxOf(tool)) return toast(`${SHIP_TYPES[tool].name}: všechny už jsou na ploše. Klepnutím na loď ji zvedneš.`);
      const errors = shipPlacementErrors(layout, tool, cells);
      if (errors.length) return toast(errors[0]);
      layout.ships.push({ type: tool, cells });
    }
  }

  function randomShips() {
    const rng = createRng(Date.now());
    for (let attempt = 0; attempt < 30; attempt++) {
      const trial = cloneLayout(layout);
      trial.ships = [];
      const ok = SHIP_ORDER.every((type) => Array.from({ length: SHIP_TYPES[type].count }).every(() => tryPlaceShip(rng, trial, type, 600)));
      if (ok) { layout = trial; draft = []; refresh(); return; }
    }
    toast('Lodě se nepodařilo rozmístit – uvolni víc moře.');
  }

  function finish() {
    const errors = validateLayout(layout);
    if (errors.length) {
      showErrors = true;
      refresh();
      toast(`Rozmístění ještě není hotové (${errors.length} ${errors.length === 1 ? 'chyba' : 'chyb'}).`);
      return;
    }
    onDone(cloneLayout(layout));
  }

  function shapePreview(shape) {
    if (!shape) return null;
    const n = normalizeShape(shape);
    const w = Math.max(...n.map((p) => p[0])) + 1;
    const hh = Math.max(...n.map((p) => p[1])) + 1;
    const set = new Map(n.map((p, k) => [p.join(','), k]));
    const grid = h('div', { class: 'mini', style: { gridTemplateColumns: `repeat(${w}, 1fr)` } });
    for (let y = hh - 1; y >= 0; y--) {
      for (let x = 0; x < w; x++) {
        const k = set.get(`${x},${y}`);
        grid.append(h('span', { class: k === undefined ? '' : k === 0 ? 'on bow' : 'on' }));
      }
    }
    return grid;
  }

  function renderPalette() {
    clear(palette);
    for (const g of TOOL_GROUPS) {
      palette.append(h('div', { class: 'group-title' }, g.title));
      const row = h('div', { class: 'chips' });
      for (const t of g.tools) {
        const max = maxOf(t.id);
        const c = count(t.id);
        const full = max !== null && (t.id === 'land' ? c === max : c >= max);
        row.append(h('button', {
          type: 'button',
          class: `chip${tool === t.id ? ' active' : ''}${full ? ' done' : ''} chip-${t.id}`,
          onclick: () => { tool = t.id; draft = []; refresh(); },
        }, t.label, max !== null ? h('small', {}, ` ${c}/${max}`) : null));
      }
      palette.append(row);
    }
    const shape = currentShape();
    const hint = {
      land: 'Klepnutím přidáš / odebereš pole pevniny. Stavby pevninu přidají samy.',
      island: 'Ostrov 1×1 na vodě, nejvýš 3 vedle sebe.',
      lighthouse: 'Maják na vodě, nejvýš 3 pole od pevniny.',
      special: 'Jedno speciální políčko na volné vodě nebo pevnině.',
      erase: 'Klepnutím odstraníš, co na políčku je.',
      H: `Klepni postupně na 3 spojená políčka (${draft.length}/3).`,
      ulo: `Klepni postupně na 5 spojených políček (${draft.length}/5).`,
    }[tool];
    palette.append(h('div', { class: 'tool-hint' },
      shape ? h('div', { class: 'shape-row' },
        shapePreview(shape),
        h('div', { class: 'row-btns' },
          h('button', { class: 'btn small', type: 'button', onclick: () => { rotation = (rotation + 1) % 4; refresh(); } }, '⟳ Otočit'),
          SHIP_TYPES[tool] ? h('button', { class: 'btn small', type: 'button', onclick: () => { mirrored = !mirrored; refresh(); } }, '⇋ Zrcadlit') : null),
        h('span', { class: 'muted' }, SHIP_TYPES[tool] ? '◆ = příď, klepni kam ji dát' : 'Klepni na levý dolní roh')) : null,
      hint ? h('p', { class: 'muted' }, hint) : null));
  }

  function renderShotEditor() {
    clear(shotEditor);
    const shot = layout.uloShot || [];
    const R = 3;
    const grid = h('div', { class: 'shot-grid' });
    const abs = shot.map(([dx, dy]) => [dx, dy]);
    const has = (x, y) => abs.findIndex(([a, b]) => a === x && b === y);
    for (let y = R; y >= -R; y--) {
      for (let x = -R; x <= R; x++) {
        const k = has(x, y);
        grid.append(h('button', {
          type: 'button',
          class: k === -1 ? '' : k === 0 ? 'on anchor' : 'on',
          onclick: () => {
            let cells = [...abs];
            if (k !== -1) cells.splice(k, 1);
            else if (cells.length < ULO_SHOT_SIZE) cells.push([x, y]);
            else return toast('Střela ULO má jen 4 políčka.');
            layout.uloShot = cells.length ? anchorShape(cells) : [];
            refresh();
          },
        }));
      }
    }
    shotEditor.append(
      h('div', { class: 'group-title' }, `Tvar střely ULO ${shot.length}/${ULO_SHOT_SIZE}`),
      h('div', { class: 'shot-wrap' }, grid,
        h('p', { class: 'muted' }, 'Klepni na 4 spojená políčka. První (◎) je místo, kam míříš. Tvar platí celou hru.')),
    );
  }

  function paint() {
    const base = ownRenderer(layout);
    let ghost = [];
    let bad = false;
    if (hover !== null && tool !== 'erase') {
      const cells = (SHIP_TYPES[tool]?.shape || STRUCTURE_TYPES[tool]?.rect) ? cellsAt(hover) : null;
      if (cells) {
        ghost = cells;
        if (SHIP_TYPES[tool]) bad = shipPlacementErrors(layout, tool, cells).length > 0;
      }
    }
    const ghostSet = new Set(ghost);
    const draftSet = new Set(draft);
    board.update((i) => {
      const r = base(i);
      if (draftSet.has(i)) r.cls += ' draft';
      if (ghostSet.has(i)) r.cls += bad ? ' ghost bad' : ' ghost';
      return r;
    });
  }

  function refresh() {
    renderPalette();
    renderShotEditor();
    paint();
    const errors = validateLayout(layout);
    doneBtn.classList.toggle('ready', errors.length === 0);
    clear(status);
    if (!errors.length) {
      status.append(h('p', { class: 'ok' }, '✔ Rozmístění je v pořádku. Klepni na Hotovo.'));
    } else {
      status.append(h('button', { class: 'linkish', type: 'button', onclick: () => { showErrors = !showErrors; refresh(); } },
        `${showErrors ? '▾' : '▸'} Co ještě chybí (${errors.length})`));
      if (showErrors) status.append(h('ul', { class: 'errors' }, errors.slice(0, 30).map((e) => h('li', {}, e))));
    }
  }

  refresh();
}
