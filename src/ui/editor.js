// Editor rozmístění – průvodce ve 4 krocích: pevnina a stavby, moře, lodě, střela ULO.

import {
  SHIP_TYPES, SHIP_ORDER, STRUCTURE_TYPES, LAND_CELLS, MAX_ISLANDS, MAX_LIGHTHOUSES, ULO_SHOT_SIZE,
} from '../engine/constants.js';
import { idx, xOf, yOf, inBounds, transformShape, isConnected4, anchorShape } from '../engine/geometry.js';
import {
  emptyLayout, cloneLayout, occupancy, validateLayout, shipPlacementErrors, randomLayout, shipSize, tryPlaceShip, randomUloShot,
} from '../engine/layout.js';
import { createRng } from '../engine/rng.js';
import { Board } from './board.js';
import { ownRenderer } from './render.js';
import { h, toast } from './dom.js';
import { icon } from './icons.js';
import { shipSilhouette, shapeEl } from './widgets.js';

const STRUCT_NAMES = Object.values(STRUCTURE_TYPES).map((d) => d.name);
const SHIP_NAMES = Object.values(SHIP_TYPES).map((d) => d.name);

const STEPS = [
  {
    id: 'land', title: 'Pevnina a stavby', short: 'Pevnina',
    tools: ['land', 'Z', 'P', 'V', 'DI', 'DII', 'H', 'erase'],
    intro: 'Nakresli 60 polí pevniny a postav na ni stavby (stavby pevninu přidají samy). Horní řada R musí zůstat mořem.',
    owns: (e) => /^(Pevnina|V horní|Voda nesmí|Přístav musí)/.test(e) || STRUCT_NAMES.some((n) => e.startsWith(`${n}:`)),
  },
  {
    id: 'sea', title: 'Ostrovy, majáky a speciální políčko', short: 'Moře',
    tools: ['island', 'lighthouse', 'special', 'erase'],
    intro: 'Ostrovy (nejvýš 5) a majáky (nejvýš 2) jsou volitelné. Speciální políčko je povinné.',
    owns: (e) => /^(Ostrov|Vedle sebe|Dva ostrovy|Maják|Dva majáky|Chybí speciální|Speciální)/.test(e),
  },
  {
    id: 'ships', title: 'Lodě', short: 'Lodě',
    tools: [...SHIP_ORDER, 'erase'],
    intro: 'Klepni na plochu – loď se položí přídí (◆) na dané políčko. Klepnutím na položenou loď ji zvedneš a můžeš ji dát jinam.',
    owns: (e) => SHIP_NAMES.some((n) => e.startsWith(`${n}:`)),
  },
  {
    id: 'ulo', title: 'Tvar střely ULO', short: 'Střela ULO',
    tools: [],
    intro: 'Nakresli 4 spojená políčka. První z nich (◎) je místo, kam budeš při střelbě mířit. Tvar platí celou hru.',
    owns: (e) => /střely ULO|Střela ULO/.test(e),
  },
];

const TOOL_INFO = {
  land: { name: 'Pevnina', hint: 'Klepnutím přidáš nebo odebereš pole pevniny.' },
  erase: { name: 'Guma', hint: 'Klepnutím odstraníš, co na políčku je.' },
  island: { name: 'Ostrov', hint: 'Ostrov 1×1 na vodě, nejvýš 3 vedle sebe.' },
  lighthouse: { name: 'Maják', hint: 'Na vodě, nejvýš 3 pole od pevniny.' },
  special: { name: 'Speciální', hint: 'Jedno políčko na volné vodě nebo pevnině.' },
  Z: { name: 'Základna', hint: 'Blok 2×2 – klepni na levý dolní roh.' },
  P: { name: 'Přístav', hint: '2×1 u moře – sem se smí dotýkat velké lodě.' },
  V: { name: 'Vzdušná obrana', hint: '2×1 – sestřeluje střely do 2 polí kolem.' },
  DI: { name: 'Dělo 1', hint: 'Obyčejné dělo 1×1.' },
  DII: { name: 'Dělo 2', hint: 'Dělo s naváděnými střelami 1×1.' },
  H: { name: 'Hledač', hint: 'Klepni postupně na 3 spojená políčka.' },
};

export function openEditor(root, { playerName, playerIndex = 0, initial, onDone, onBack }) {
  let layout = initial ? cloneLayout(initial) : emptyLayout();
  let step = 0;
  let tool = 'land';
  let rotation = 0;
  let mirrored = false;
  let draft = [];
  let hover = null;

  const board = new Board({ onCell: (i) => { apply(i); refresh(); }, caption: 'Tvoje plocha' });
  board.grid.addEventListener('mouseover', (e) => {
    const t = e.target.closest('.cell');
    hover = t ? Number(t.dataset.i) : null;
    paint();
  });
  board.grid.addEventListener('mouseleave', () => { hover = null; paint(); });

  const stepper = h('nav', { class: 'stepper' });
  const stepHead = h('div', { class: 'step-head' });
  const toolbar = h('div', { class: 'toolbar' });
  const toolsEl = h('div', { class: 'tools' });
  const issues = h('div', { class: 'issues' });
  const boardArea = h('section', { class: 'editor-board' }, board.el);
  const uloArea = h('section', { class: 'ulo-area' });
  const footer = h('footer', { class: 'editor-foot' });

  root.replaceChildren(
    h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn', type: 'button', onclick: onBack, 'aria-label': 'Zpět do menu' }, icon('back')),
      h('div', { class: 'title' }, h('strong', {}, playerName), h('span', {}, 'rozmísti svou plochu')),
      h('button', { class: 'btn small ghost-line', type: 'button', onclick: randomAll, title: 'Celé rozmístění náhodně' }, icon('dice'), h('span', {}, 'Náhodně'))),
    stepper,
    h('main', { class: `editor pc${playerIndex}` },
      boardArea, uloArea,
      h('aside', { class: 'editor-side' }, stepHead, toolbar, toolsEl, issues)),
    footer,
  );

  // ------------------------------------------------------------ počty
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

  const optional = (kind) => kind === 'island' || kind === 'lighthouse';

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

  // ------------------------------------------------------------ úpravy
  function removeShipAt(i) {
    const k = layout.ships.findIndex((s) => s.cells.includes(i));
    return k === -1 ? null : layout.ships.splice(k, 1)[0];
  }

  function removeStructureAt(i) {
    const k = layout.structures.findIndex((s) => s.cells.includes(i));
    return k === -1 ? null : layout.structures.splice(k, 1)[0];
  }

  const blockedForLand = (c, occ) => occ.ship[c] !== -1 || occ.island[c] || occ.lighthouse[c];

  function placeStructure(type, cells) {
    const occ = occupancy(layout);
    if (cells.some((c) => blockedForLand(c, occ))) return toast('Stavba musí stát na volném místě (bez lodí, ostrovů a majáků).');
    if (cells.some((c) => occ.structure[c] !== -1)) return toast('Tady už stojí jiná stavba.');
    if (count(type) >= maxOf(type)) {
      layout.structures.splice(layout.structures.findIndex((s) => s.type === type), 1);
    }
    for (const c of cells) if (!layout.land.includes(c)) layout.land.push(c);
    if (cells.includes(layout.special)) layout.special = null;
    layout.structures.push({ type, cells });
  }

  function apply(i) {
    if (STEPS[step].id === 'ulo') return;
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
    if (SHIP_TYPES[tool] && occ.ship[i] !== -1) {
      const ship = removeShipAt(i);
      tool = ship.type;
      draft = [];
      toast(`${SHIP_TYPES[ship.type].name} zvednuta – klepni, kam ji položit.`);
      return;
    }
    switch (tool) {
      case 'land':
        if (layout.land.includes(i)) {
          removeStructureAt(i);
          layout.land = layout.land.filter((c) => c !== i);
        } else {
          if (blockedForLand(i, occ)) return toast('Na lodi, ostrově ani majáku nemůže být pevnina.');
          if (count('land') >= LAND_CELLS) return toast(`Pevnina už má všech ${LAND_CELLS} polí. Gumou nebo klepnutím na pevninu nějaké uber.`);
          layout.land.push(i);
        }
        return;
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
        if (tool === 'ulo' && count('ulo') >= 1) return toast('ULO už je na ploše. Klepnutím na něj ho zvedneš.');
        draft.push(i);
        if (draft.length < size) return;
        const cells = draft;
        draft = [];
        if (!isConnected4(cells)) return toast('Políčka musí být spojená stranou (ne úhlopříčně). Zkus to znovu.');
        if (tool === 'H') return placeStructure('H', cells);
        const errors = shipPlacementErrors(layout, 'ulo', cells);
        if (errors.length) return toast(errors[0]);
        layout.ships.push({ type: 'ulo', cells });
        return;
      }
      default:
    }
    const cells = cellsAt(i);
    if (!cells) return toast('Nevejde se na plochu – zkus jiné místo nebo otoč.');
    if (STRUCTURE_TYPES[tool]) return placeStructure(tool, cells);
    if (SHIP_TYPES[tool]) {
      if (count(tool) >= maxOf(tool)) return toast(`${SHIP_TYPES[tool].name}: všechny už jsou na ploše. Klepnutím na loď ji zvedneš.`);
      const errors = shipPlacementErrors(layout, tool, cells);
      if (errors.length) return toast(errors[0]);
      layout.ships.push({ type: tool, cells });
      // po položení poslední lodi daného typu přejdi na další chybějící
      if (count(tool) >= maxOf(tool)) {
        const next = SHIP_ORDER.find((t) => count(t) < maxOf(t));
        if (next) tool = next;
      }
    }
  }

  function randomAll() {
    if ((layout.land.length || layout.ships.length) && !confirm('Nahradit celé rozmístění náhodným?')) return;
    layout = randomLayout(createRng(Date.now()));
    draft = [];
    refresh();
    toast('Hotovo – rozmístění je náhodné a platné. Můžeš ho ještě upravit.');
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

  function goStep(k) {
    step = Math.max(0, Math.min(STEPS.length - 1, k));
    draft = [];
    tool = STEPS[step].tools[0] || tool;
    rotation = 0;
    mirrored = false;
    refresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function finish() {
    const errors = validateLayout(layout);
    if (errors.length) {
      const bad = STEPS.findIndex((s) => errors.some(s.owns));
      goStep(bad === -1 ? 0 : bad);
      toast(`Ještě to není hotové – podívej se na „${STEPS[bad === -1 ? 0 : bad].short}“.`);
      return;
    }
    onDone(cloneLayout(layout));
  }

  // ------------------------------------------------------------- vykreslení
  function toolIcon(t) {
    if (SHIP_TYPES[t]) return shipSilhouette(t, null, { cls: 'tiny', bow: true });
    return icon(t, `tool-svg${STRUCTURE_TYPES[t] ? ' st-tile' : ['island', 'lighthouse', 'special'].includes(t) ? ' sea-tile' : ''}`);
  }

  function renderStepper(errors) {
    stepper.replaceChildren(...STEPS.map((s, k) => {
      const done = !errors.some(s.owns);
      return h('button', { type: 'button', class: `st${k === step ? ' current' : ''}${done ? ' done' : ''}`, onclick: () => goStep(k) },
        h('span', { class: 'st-num' }, done ? '✓' : String(k + 1)), h('span', { class: 'st-label' }, s.short));
    }));
  }

  function renderTools() {
    const s = STEPS[step];
    stepHead.replaceChildren(h('h2', {}, s.title), h('p', { class: 'muted' }, s.intro));
    if (s.id === 'ulo') { toolsEl.replaceChildren(); toolbar.replaceChildren(); return; }
    toolsEl.replaceChildren(...s.tools.map((t) => {
      const max = maxOf(t);
      const c = count(t);
      const full = max !== null && c >= max;
      const name = TOOL_INFO[t]?.name || SHIP_TYPES[t]?.name;
      return h('button', {
        type: 'button',
        class: `tool${tool === t ? ' active' : ''}${full ? ' full' : ''}${t === 'erase' ? ' erase' : ''}`,
        onclick: () => { tool = t; draft = []; rotation = 0; mirrored = false; refresh(); },
      },
      h('span', { class: 'tool-ico' }, toolIcon(t)),
      h('span', { class: 'tool-name' }, name),
      max !== null ? h('span', { class: 'tool-count' }, full ? '✓' : `${c}/${max}`, optional(t) && !full ? h('small', {}, ' volit.') : null) : null);
    }));

    const shape = currentShape();
    const info = TOOL_INFO[tool];
    const hint = SHIP_TYPES[tool]
      ? (tool === 'ulo' ? `Klepni postupně na 5 spojených políček (${draft.length}/5).` : 'Klepni na plochu – příď (◆) bude na tom políčku.')
      : tool === 'H' ? `Klepni postupně na 3 spojená políčka (${draft.length}/3).` : info?.hint;
    toolbar.replaceChildren(...[
      h('div', { class: 'tb-tool' },
        h('span', { class: 'tool-ico' }, shape ? shapeEl(shape, { cls: `sil ${SHIP_TYPES[tool] ? `ship-${tool}` : 'struct'}`, bow: !!SHIP_TYPES[tool] }) : toolIcon(tool)),
        h('div', {}, h('strong', {}, info?.name || SHIP_TYPES[tool]?.name), h('small', {}, hint))),
      shape ? h('div', { class: 'tb-btns' },
        h('button', { type: 'button', class: 'icon-btn round', title: 'Otočit', 'aria-label': 'Otočit', onclick: () => { rotation = (rotation + 1) % 4; refresh(); } }, icon('rotate')),
        SHIP_TYPES[tool] ? h('button', { type: 'button', class: 'icon-btn round', title: 'Zrcadlit', 'aria-label': 'Zrcadlit', onclick: () => { mirrored = !mirrored; refresh(); } }, icon('mirror')) : null) : null,
      s.id === 'ships' ? h('button', { type: 'button', class: 'btn small', onclick: randomShips }, icon('dice'), ' Lodě náhodně') : null,
    ].filter(Boolean));
  }

  function renderUlo() {
    const shot = layout.uloShot || [];
    const R = 3;
    const grid = h('div', { class: 'shot-grid' });
    const has = (x, y) => shot.findIndex(([a, b]) => a === x && b === y);
    for (let y = R; y >= -R; y--) {
      for (let x = -R; x <= R; x++) {
        const k = has(x, y);
        grid.append(h('button', {
          type: 'button',
          class: k === -1 ? '' : k === 0 ? 'on anchor' : 'on',
          'aria-label': k === -1 ? 'Přidat políčko' : 'Odebrat políčko',
          onclick: () => {
            const cells = [...shot];
            if (k !== -1) cells.splice(k, 1);
            else if (cells.length < ULO_SHOT_SIZE) cells.push([x, y]);
            else return toast('Střela ULO má jen 4 políčka – nejdřív nějaké odeber.');
            layout.uloShot = cells.length ? anchorShape(cells) : [];
            refresh();
          },
        }));
      }
    }
    const ok = shot.length === ULO_SHOT_SIZE && !validateLayout(layout).some(STEPS[3].owns);
    const ulo = layout.ships.find((s) => s.type === 'ulo');
    uloArea.replaceChildren(h('div', { class: 'ulo-card' },
      h('div', { class: 'ulo-top' },
        h('div', { class: 'ulo-ship' }, h('small', {}, 'Tvoje ULO'), ulo ? shipSilhouette('ulo', ulo.cells, { bow: true }) : h('em', { class: 'muted' }, 'ještě není na ploše')),
        h('div', { class: `ulo-status${ok ? ' ok' : ''}` }, ok ? '✓ Tvar je hotový' : `${shot.length} / ${ULO_SHOT_SIZE} políček`)),
      grid,
      h('div', { class: 'row-btns center' },
        h('button', { type: 'button', class: 'btn small', onclick: () => { layout.uloShot = randomUloShot(createRng(Date.now())); refresh(); } }, icon('dice'), ' Náhodný tvar'),
        h('button', { type: 'button', class: 'btn small', onclick: () => { layout.uloShot = []; refresh(); } }, 'Vymazat'))));
  }

  function renderIssues(errors) {
    const mine = errors.filter(STEPS[step].owns);
    if (!mine.length) {
      issues.replaceChildren(h('p', { class: 'ok-line' }, '✓ Tento krok je v pořádku'));
      return;
    }
    issues.replaceChildren(h('details', { class: 'issue-box', open: mine.length <= 3 },
      h('summary', {}, `Ještě chybí nebo nesedí (${mine.length})`),
      h('ul', {}, mine.slice(0, 12).map((e) => h('li', {}, e)))));
  }

  function renderFooter(errors) {
    const last = step === STEPS.length - 1;
    const allOk = errors.length === 0;
    footer.replaceChildren(
      h('button', { type: 'button', class: 'btn', onclick: () => (step === 0 ? onBack() : goStep(step - 1)) }, step === 0 ? 'Menu' : '← Zpět'),
      h('div', { class: 'foot-progress' }, h('div', { style: { width: `${Math.round(((STEPS.filter((s) => !errors.some(s.owns)).length) / STEPS.length) * 100)}%` } })),
      last || allOk
        ? h('button', { type: 'button', class: `btn primary${allOk ? ' ready' : ''}`, onclick: finish }, allOk ? 'Hotovo ✓' : 'Hotovo')
        : h('button', { type: 'button', class: 'btn primary', onclick: () => goStep(step + 1) }, 'Další →'));
  }

  function paint() {
    const base = ownRenderer(layout);
    let ghost = [];
    let bad = false;
    if (hover !== null && tool !== 'erase' && (SHIP_TYPES[tool]?.shape || STRUCTURE_TYPES[tool]?.rect)) {
      const cells = cellsAt(hover);
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
    const errors = validateLayout(layout);
    const isUlo = STEPS[step].id === 'ulo';
    boardArea.classList.toggle('hidden', isUlo);
    uloArea.classList.toggle('hidden', !isUlo);
    renderStepper(errors);
    renderTools();
    if (isUlo) renderUlo(); else paint();
    renderIssues(errors);
    renderFooter(errors);
  }

  refresh();
}
