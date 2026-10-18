// Rozmístění hrací plochy jednoho hráče: pevnina, stavby, ostrovy, majáky,
// speciální políčko, lodě a tvar střely ULO. Obsahuje kontrolu pravidel
// a generátor náhodného platného rozmístění.

import {
  WIDTH, HEIGHT, CELLS, LAND_CELLS, MAX_ISLANDS, MAX_ISLAND_GROUP, MAX_LIGHTHOUSES,
  LIGHTHOUSE_RANGE, SHIP_TYPES, SHIP_ORDER, STRUCTURE_TYPES, STRUCTURE_ORDER, ULO_SHOT_SIZE,
} from './constants.js';
import {
  idx, xOf, yOf, neighbors4, neighbors8, isConnected4, transformShape, placeShape,
  cellsToShape, shapeKey, distanceToSet, label, anchorShape, normalizeShape,
} from './geometry.js';
import { int, pick, shuffle } from './rng.js';

export function emptyLayout() {
  return {
    land: [],
    structures: [],
    islands: [],
    lighthouses: [],
    special: null,
    ships: [],
    uloShot: [],
  };
}

export function cloneLayout(l) {
  return JSON.parse(JSON.stringify(l));
}

// Mapa obsazenosti políček pro rychlé dotazy.
export function occupancy(layout) {
  const land = new Uint8Array(CELLS);
  const structure = new Int16Array(CELLS).fill(-1);
  const ship = new Int16Array(CELLS).fill(-1);
  const island = new Uint8Array(CELLS);
  const lighthouse = new Uint8Array(CELLS);
  for (const c of layout.land) land[c] = 1;
  layout.structures.forEach((s, i) => s.cells.forEach((c) => { structure[c] = i; }));
  layout.ships.forEach((s, i) => s.cells.forEach((c) => { ship[c] = i; }));
  for (const c of layout.islands) island[c] = 1;
  for (const c of layout.lighthouses) lighthouse[c] = 1;
  return { land, structure, ship, island, lighthouse, special: layout.special };
}

export function isWaterConnected(landSet) {
  const water = [];
  for (let i = 0; i < CELLS; i++) if (!landSet.has(i)) water.push(i);
  return isConnected4(water);
}

const shipShapeKeys = {};
for (const [type, def] of Object.entries(SHIP_TYPES)) {
  if (!def.shape) continue;
  const keys = new Set();
  for (let r = 0; r < 4; r++) for (const m of [false, true]) keys.add(shapeKey(transformShape(def.shape, r, m)));
  shipShapeKeys[type] = keys;
}

export function shipSize(type) {
  const def = SHIP_TYPES[type];
  return def.shape ? def.shape.length : def.size;
}

function structureShapeOk(type, cells) {
  const def = STRUCTURE_TYPES[type];
  if (cells.length !== def.size) return false;
  if (new Set(cells).size !== cells.length) return false;
  if (!def.rect) return isConnected4(cells);
  const xs = cells.map(xOf), ys = cells.map(yOf);
  const w = Math.max(...xs) - Math.min(...xs) + 1;
  const h = Math.max(...ys) - Math.min(...ys) + 1;
  const [a, b] = def.rect;
  return w * h === def.size && ((w === a && h === b) || (w === b && h === a));
}

// Kontrola jedné lodi vůči zbytku rozmístění (bez ní samotné).
export function shipPlacementErrors(layout, type, cells, ignoreIndex = -1) {
  const errors = [];
  const def = SHIP_TYPES[type];
  if (!cells || cells.length !== shipSize(type)) {
    errors.push(`${def.name}: musí mít ${shipSize(type)} políček.`);
    return errors;
  }
  if (def.shape) {
    if (!shipShapeKeys[type].has(shapeKey(cellsToShape(cells)))) errors.push(`${def.name}: špatný tvar.`);
  } else if (!isConnected4(cells)) {
    errors.push(`${def.name}: políčka musí být spojená (ne úhlopříčně).`);
  }
  const occ = occupancy(layout);
  const portCells = new Set(layout.structures.filter((s) => s.type === 'P').flatMap((s) => s.cells));
  const own = new Set(cells);
  for (const c of cells) {
    if (occ.land[c]) errors.push(`${def.name}: ${label(c)} je pevnina.`);
    if (occ.island[c]) errors.push(`${def.name}: ${label(c)} je ostrov.`);
    if (occ.lighthouse[c]) errors.push(`${def.name}: ${label(c)} je maják.`);
    if (occ.special === c) errors.push(`${def.name}: ${label(c)} je speciální políčko.`);
    if (occ.ship[c] !== -1 && occ.ship[c] !== ignoreIndex) errors.push(`${def.name}: ${label(c)} je obsazené jinou lodí.`);
  }
  const touchesBig = (c) => {
    const s = occ.ship[c];
    return s !== -1 && s !== ignoreIndex && SHIP_TYPES[layout.ships[s].type].big;
  };
  const touched = new Set();
  for (const c of cells) {
    for (const n of neighbors8(c)) {
      if (own.has(n)) continue;
      if (def.big) {
        if (occ.land[n] && !portCells.has(n)) touched.add('pevniny');
        if (occ.island[n]) touched.add('ostrova');
        if (occ.lighthouse[n]) touched.add('majáku');
        if (occ.ship[n] !== -1 && occ.ship[n] !== ignoreIndex) touched.add('jiné lodi');
      } else if (touchesBig(n)) {
        touched.add('velké lodi');
      }
    }
  }
  for (const t of touched) errors.push(`${def.name}: nesmí se dotýkat ${t}.`);
  return errors;
}

// Kompletní kontrola pravidel. Vrací seznam chyb (česky); prázdný = platné.
export function validateLayout(layout) {
  const errors = [];
  const landSet = new Set(layout.land);
  const top = HEIGHT - 1;

  // Pevnina
  if (landSet.size !== LAND_CELLS) errors.push(`Pevnina musí mít přesně ${LAND_CELLS} políček (teď ${landSet.size}).`);
  if (layout.land.some((c) => yOf(c) === top)) errors.push('V horní řadě (R) nesmí být pevnina.');
  if (!isWaterConnected(landSet)) errors.push('Voda nesmí být uzavřená uvnitř pevniny (žádné jezero).');

  // Stavby
  const structCells = new Set();
  for (const type of STRUCTURE_ORDER) {
    const def = STRUCTURE_TYPES[type];
    const list = layout.structures.filter((s) => s.type === type);
    if (list.length !== def.count) errors.push(`${def.name}: musí být ${def.count}× (teď ${list.length}×).`);
  }
  for (const s of layout.structures) {
    const def = STRUCTURE_TYPES[s.type];
    if (!structureShapeOk(s.type, s.cells)) errors.push(`${def.name}: špatný tvar nebo velikost.`);
    for (const c of s.cells) {
      if (!landSet.has(c)) errors.push(`${def.name}: ${label(c)} musí stát na pevnině.`);
      if (structCells.has(c)) errors.push(`${def.name}: ${label(c)} se překrývá s jinou stavbou.`);
      structCells.add(c);
    }
    if (s.type === 'P' && !s.cells.some((c) => neighbors4(c).some((n) => !landSet.has(n)))) {
      errors.push('Přístav musí sousedit s mořem.');
    }
  }

  // Ostrovy
  const islandSet = new Set(layout.islands);
  if (layout.islands.length > MAX_ISLANDS) errors.push(`Ostrovů může být nejvýš ${MAX_ISLANDS}.`);
  if (islandSet.size !== layout.islands.length) errors.push('Dva ostrovy na stejném políčku.');
  for (const c of layout.islands) if (landSet.has(c)) errors.push(`Ostrov ${label(c)} nesmí být na pevnině.`);
  for (const group of components(layout.islands)) {
    if (group.length > MAX_ISLAND_GROUP) errors.push(`Vedle sebe smí být nejvýš ${MAX_ISLAND_GROUP} ostrovy.`);
  }

  // Majáky
  if (layout.lighthouses.length > MAX_LIGHTHOUSES) errors.push(`Majáky mohou být nejvýš ${MAX_LIGHTHOUSES}.`);
  if (new Set(layout.lighthouses).size !== layout.lighthouses.length) errors.push('Dva majáky na stejném políčku.');
  for (const c of layout.lighthouses) {
    if (landSet.has(c)) errors.push(`Maják ${label(c)} musí být ve vodě.`);
    if (islandSet.has(c)) errors.push(`Maják ${label(c)} nesmí být na ostrově.`);
    if (layout.land.length && distanceToSet(c, layout.land) > LIGHTHOUSE_RANGE) {
      errors.push(`Maják ${label(c)} musí být nejvýš ${LIGHTHOUSE_RANGE} políčka od pevniny.`);
    }
  }

  // Speciální políčko
  if (layout.special === null || layout.special === undefined) {
    errors.push('Chybí speciální políčko.');
  } else {
    const c = layout.special;
    if (structCells.has(c) || islandSet.has(c) || layout.lighthouses.includes(c)) {
      errors.push('Speciální políčko musí být na volné vodě nebo volné pevnině.');
    }
  }

  // Lodě
  for (const type of SHIP_ORDER) {
    const def = SHIP_TYPES[type];
    const n = layout.ships.filter((s) => s.type === type).length;
    if (n !== def.count) errors.push(`${def.name}: musí být ${def.count}× (teď ${n}×).`);
  }
  const seen = new Set();
  layout.ships.forEach((s, i) => {
    for (const e of shipPlacementErrors(layout, s.type, s.cells, i)) {
      if (!seen.has(e)) { seen.add(e); errors.push(e); }
    }
  });

  // Střela ULO
  const shot = layout.uloShot || [];
  if (shot.length !== ULO_SHOT_SIZE) {
    errors.push(`Střela ULO musí mít ${ULO_SHOT_SIZE} políčka.`);
  } else if (!isConnected4(placeShape(normalizeShape(shot), 0, 0) || [])) {
    errors.push('Políčka střely ULO musí být spojená (ne úhlopříčně).');
  }

  return errors;
}

function components(cells) {
  const set = new Set(cells);
  const seen = new Set();
  const out = [];
  for (const c of cells) {
    if (seen.has(c)) continue;
    const group = [];
    const stack = [c];
    seen.add(c);
    while (stack.length) {
      const k = stack.pop();
      group.push(k);
      for (const n of neighbors4(k)) {
        if (set.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
      }
    }
    out.push(group);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Náhodné rozmístění

function randomPolyomino(rng, size) {
  const cells = [[0, 0]];
  const key = (p) => p.join(',');
  const have = new Set([key(cells[0])]);
  while (cells.length < size) {
    const [x, y] = pick(rng, cells);
    const [dx, dy] = pick(rng, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
    const p = [x + dx, y + dy];
    if (!have.has(key(p))) { have.add(key(p)); cells.push(p); }
  }
  return cells;
}

export function randomUloShot(rng) {
  return anchorShape(randomPolyomino(rng, ULO_SHOT_SIZE));
}

function generateLand(rng) {
  const land = new Set();
  const top = HEIGHT - 1;
  // 1–3 pevniny u okrajů (hlavně dole), první začíná blokem 3×3 pro základnu.
  const masses = 1 + int(rng, 3);
  const seeds = [];
  for (let m = 0; m < masses; m++) {
    const side = m === 0 ? 'bottom' : pick(rng, ['bottom', 'left', 'right']);
    let x, y;
    if (side === 'bottom') { x = int(rng, WIDTH - 3); y = 0; }
    else if (side === 'left') { x = 0; y = int(rng, 8); }
    else { x = WIDTH - 3; y = int(rng, 8); }
    seeds.push([x, y]);
  }
  const [bx, by] = seeds[0];
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) land.add(idx(bx + dx, by + dy));
  for (const [x, y] of seeds.slice(1)) land.add(idx(x, y));

  let guard = 0;
  while (land.size < LAND_CELLS && guard++ < 5000) {
    const frontier = [];
    for (const c of land) {
      for (const n of neighbors4(c)) {
        if (!land.has(n) && yOf(n) < top - 3) frontier.push(n);
      }
    }
    if (!frontier.length) break;
    // Upřednostni nižší řady, ať pevnina „leží“ u kraje.
    const a = pick(rng, frontier), b = pick(rng, frontier);
    const n = yOf(a) <= yOf(b) ? a : b;
    land.add(n);
    if (!isWaterConnected(land)) land.delete(n);
  }
  return land.size === LAND_CELLS ? land : null;
}

function placeStructures(rng, land) {
  const used = new Set();
  const structures = [];
  const landArr = [...land];
  const free = (c) => land.has(c) && !used.has(c);
  const rectsOf = (w, h) => {
    const out = [];
    for (const c of landArr) {
      for (const [ww, hh] of w === h ? [[w, h]] : [[w, h], [h, w]]) {
        const cells = [];
        for (let dy = 0; dy < hh; dy++) for (let dx = 0; dx < ww; dx++) {
          const x = xOf(c) + dx, y = yOf(c) + dy;
          if (x < WIDTH && y < HEIGHT) cells.push(idx(x, y));
        }
        if (cells.length === ww * hh && cells.every(free)) out.push(cells);
      }
    }
    return out;
  };
  const add = (type, cells) => { cells.forEach((c) => used.add(c)); structures.push({ type, cells }); };

  const bases = rectsOf(2, 2);
  if (!bases.length) return null;
  add('Z', pick(rng, bases));
  const ports = rectsOf(2, 1).filter((cells) => cells.some((c) => neighbors4(c).some((n) => !land.has(n))));
  if (!ports.length) return null;
  add('P', pick(rng, ports));
  for (let k = 0; k < 2; k++) {
    const vs = rectsOf(2, 1);
    if (!vs.length) return null;
    add('V', pick(rng, vs));
  }
  for (const type of ['DI', 'DII']) {
    const cs = landArr.filter(free);
    if (!cs.length) return null;
    add(type, [pick(rng, cs)]);
  }
  // Hledač – 3 spojená políčka
  for (let attempt = 0; attempt < 200; attempt++) {
    const start = pick(rng, landArr);
    if (!free(start)) continue;
    const cells = [start];
    for (let g = 0; g < 20 && cells.length < 3; g++) {
      const n = pick(rng, neighbors4(pick(rng, cells)));
      if (free(n) && !cells.includes(n)) cells.push(n);
    }
    if (cells.length === 3) { add('H', cells); return structures; }
  }
  return null;
}

export function tryPlaceShip(rng, layout, type, attempts = 400) {
  const def = SHIP_TYPES[type];
  for (let a = 0; a < attempts; a++) {
    const base = def.shape || randomPolyomino(rng, def.size);
    const shape = transformShape(base, int(rng, 4), int(rng, 2) === 1);
    const cells = placeShape(shape, int(rng, WIDTH), int(rng, HEIGHT));
    if (!cells) continue;
    if (shipPlacementErrors(layout, type, cells).length === 0) {
      layout.ships.push({ type, cells });
      return true;
    }
  }
  return false;
}

export function randomLayout(rng) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const land = generateLand(rng);
    if (!land) continue;
    const structures = placeStructures(rng, land);
    if (!structures) continue;
    const layout = emptyLayout();
    layout.land = [...land].sort((a, b) => a - b);
    layout.structures = structures;
    const occupied = (c) => land.has(c) || layout.islands.includes(c) || layout.lighthouses.includes(c);

    // Ostrovy – volná voda, ne těsně u pevniny
    const sea = shuffle(rng, [...Array(CELLS).keys()].filter((c) => !land.has(c) && neighbors8(c).every((n) => !land.has(n))));
    for (const c of sea) {
      if (layout.islands.length >= MAX_ISLANDS) break;
      if (neighbors8(c).some((n) => layout.islands.includes(n))) continue;
      layout.islands.push(c);
    }
    // Majáky – voda do 3 polí od pevniny
    const coast = shuffle(rng, [...Array(CELLS).keys()].filter((c) => !occupied(c) && distanceToSet(c, layout.land) <= LIGHTHOUSE_RANGE));
    for (const c of coast) {
      if (layout.lighthouses.length >= MAX_LIGHTHOUSES) break;
      if (!occupied(c)) layout.lighthouses.push(c);
    }

    let ok = true;
    for (const type of SHIP_ORDER) {
      for (let k = 0; k < SHIP_TYPES[type].count; k++) {
        if (!tryPlaceShip(rng, layout, type)) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (!ok) continue;

    // Speciální políčko – volná voda
    const occ = occupancy(layout);
    const freeWater = [...Array(CELLS).keys()].filter((c) => !occ.land[c] && !occ.island[c] && !occ.lighthouse[c] && occ.ship[c] === -1);
    layout.special = pick(rng, freeWater);
    layout.uloShot = randomUloShot(rng);
    if (validateLayout(layout).length === 0) return layout;
  }
  throw new Error('Nepodařilo se vygenerovat rozmístění.');
}
