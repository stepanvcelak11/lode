import { WIDTH, HEIGHT, ROWS } from './constants.js';

export const idx = (x, y) => y * WIDTH + x;
export const xOf = (i) => i % WIDTH;
export const yOf = (i) => Math.floor(i / WIDTH);
export const inBounds = (x, y) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;

export function label(i) {
  return `${ROWS[yOf(i)]}${xOf(i) + 1}`;
}

export function chebyshev(a, b) {
  return Math.max(Math.abs(xOf(a) - xOf(b)), Math.abs(yOf(a) - yOf(b)));
}

export function distanceToSet(cell, cells) {
  let best = Infinity;
  for (const c of cells) best = Math.min(best, chebyshev(cell, c));
  return best;
}

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function around(i, dirs) {
  const x = xOf(i), y = yOf(i);
  const out = [];
  for (const [dx, dy] of dirs) {
    if (inBounds(x + dx, y + dy)) out.push(idx(x + dx, y + dy));
  }
  return out;
}

export const neighbors4 = (i) => around(i, DIRS4);
export const neighbors8 = (i) => around(i, DIRS8);

// Všechna políčka ve čtverci o „poloměru“ r (Chebyshev) kolem buňky.
export function cellsWithin(i, r) {
  const x = xOf(i), y = yOf(i);
  const out = [];
  for (let yy = y - r; yy <= y + r; yy++) {
    for (let xx = x - r; xx <= x + r; xx++) {
      if (inBounds(xx, yy)) out.push(idx(xx, yy));
    }
  }
  return out;
}

// Jsou buňky propojené přes hrany (ne úhlopříčně)?
export function isConnected4(cells) {
  if (cells.length === 0) return true;
  const set = new Set(cells);
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const c = stack.pop();
    for (const n of neighbors4(c)) {
      if (set.has(n) && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen.size === set.size;
}

// Tvar [[dx,dy],...] – zachovává pořadí buněk (první = příď / kotva).
export function rotateShape(shape) {
  return shape.map(([dx, dy]) => [dy, -dx]);
}

export function mirrorShape(shape) {
  return shape.map(([dx, dy]) => [-dx, dy]);
}

// Posune tvar tak, aby první buňka byla [0,0].
export function anchorShape(shape) {
  const [ax, ay] = shape[0];
  return shape.map(([dx, dy]) => [dx - ax, dy - ay]);
}

// Posune tvar do kladných souřadnic (min x = 0, min y = 0).
export function normalizeShape(shape) {
  const minX = Math.min(...shape.map((p) => p[0]));
  const minY = Math.min(...shape.map((p) => p[1]));
  return shape.map(([dx, dy]) => [dx - minX, dy - minY]);
}

export function transformShape(shape, rotation = 0, mirrored = false) {
  let s = mirrored ? mirrorShape(shape) : shape.map((p) => [...p]);
  for (let r = 0; r < ((rotation % 4) + 4) % 4; r++) s = rotateShape(s);
  return normalizeShape(s);
}

// Umístí tvar s levým dolním rohem na (x, y). Vrací null, pokud vyčnívá z plochy.
export function placeShape(shape, x, y) {
  const out = [];
  for (const [dx, dy] of shape) {
    if (!inBounds(x + dx, y + dy)) return null;
    out.push(idx(x + dx, y + dy));
  }
  return out;
}

// Převede buňky na tvar (relativní souřadnice, pořadí zachováno).
export function cellsToShape(cells) {
  return normalizeShape(cells.map((c) => [xOf(c), yOf(c)]));
}

export function shapeKey(shape) {
  return normalizeShape(shape).map((p) => p.join(',')).sort().join(';');
}

// Prochází úsečka mezi středy dvou buněk některou z blokujících buněk?
// Vzorkujeme úsečku jemně a sledujeme buňky, kterými prochází (mimo koncové body).
export function lineBlocked(from, to, blocked) {
  const x0 = xOf(from) + 0.5, y0 = yOf(from) + 0.5;
  const x1 = xOf(to) + 0.5, y1 = yOf(to) + 0.5;
  const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 8);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const cx = Math.floor(x0 + (x1 - x0) * t);
    const cy = Math.floor(y0 + (y1 - y0) * t);
    const c = idx(cx, cy);
    if (c !== from && c !== to && blocked.has(c)) return true;
  }
  return false;
}
