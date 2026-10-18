// Vykreslení hrací plochy 24 × 19 s popisky řádků (A–R) a sloupců (1–24).

import { WIDTH, HEIGHT, ROWS } from '../engine/constants.js';
import { idx } from '../engine/geometry.js';
import { h, store } from './dom.js';

const ZOOM_KEY = 'lode.zoom';

export class Board {
  constructor({ onCell, small = false } = {}) {
    this.onCell = onCell;
    this.small = small;
    this.cells = [];
    this.el = h('div', { class: `board-wrap${small ? ' small' : ''}` });
    this.scroller = h('div', { class: 'board-scroll' });
    const grid = h('div', { class: 'board', role: 'grid' });
    grid.append(h('div', { class: 'lbl corner' }));
    for (let x = 0; x < WIDTH; x++) grid.append(h('div', { class: 'lbl col' }, String(x + 1)));
    for (let y = HEIGHT - 1; y >= 0; y--) {
      grid.append(h('div', { class: 'lbl row' }, ROWS[y]));
      for (let x = 0; x < WIDTH; x++) {
        const i = idx(x, y);
        const cell = h('button', { class: 'cell', type: 'button', 'data-i': i });
        this.cells[i] = cell;
        grid.append(cell);
      }
    }
    grid.addEventListener('click', (e) => {
      const t = e.target.closest('.cell');
      if (t && this.onCell) this.onCell(Number(t.dataset.i));
    });
    this.grid = grid;
    this.scroller.append(grid);
    this.el.append(this.scroller);
    if (!small) {
      this.zoom = store.get(ZOOM_KEY, 1);
      const zoomBar = h('div', { class: 'zoom' },
        h('button', { type: 'button', 'aria-label': 'Oddálit', onclick: () => this.setZoom(this.zoom / 1.25) }, '−'),
        h('button', { type: 'button', 'aria-label': 'Přiblížit', onclick: () => this.setZoom(this.zoom * 1.25) }, '+'));
      this.el.prepend(zoomBar);
      this.setZoom(this.zoom);
    }
  }

  setZoom(z) {
    this.zoom = Math.min(3, Math.max(1, z));
    store.set(ZOOM_KEY, this.zoom);
    this.grid.style.setProperty('--zoom', this.zoom);
  }

  // render(i) -> { cls, text, title }
  update(render) {
    for (let i = 0; i < this.cells.length; i++) {
      const el = this.cells[i];
      const r = render(i) || {};
      const cls = `cell ${r.cls || ''}`;
      if (el.className !== cls) el.className = cls;
      const text = r.text || '';
      if (el.textContent !== text) el.textContent = text;
      if (r.title) el.title = r.title; else el.removeAttribute('title');
    }
  }

  scrollTo(i) {
    const el = this.cells[i];
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
