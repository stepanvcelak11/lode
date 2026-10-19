// Vykreslení hrací plochy 24 × 19 s popisky řádků (A–R) a sloupců (1–24).

import { WIDTH, HEIGHT, ROWS } from '../engine/constants.js';
import { idx } from '../engine/geometry.js';
import { h, store } from './dom.js';
import { ICONS, icon } from './icons.js';

const ZOOM_KEY = 'lode.zoom';
const FRESH_MS = 1400;

export class Board {
  constructor({ onCell, small = false, caption = null } = {}) {
    this.onCell = onCell;
    this.small = small;
    this.cells = [];
    this.marks = [];
    this.freshUntil = new Float64Array(WIDTH * HEIGHT);
    this.el = h('div', { class: `board-wrap${small ? ' small' : ''}` });
    this.scroller = h('div', { class: 'board-scroll' });
    const grid = h('div', { class: 'board', role: 'grid' });
    grid.append(h('div', { class: 'lbl corner' }));
    for (let x = 0; x < WIDTH; x++) grid.append(h('div', { class: 'lbl col' }, String(x + 1)));
    for (let y = HEIGHT - 1; y >= 0; y--) {
      grid.append(h('div', { class: 'lbl row' }, ROWS[y]));
      for (let x = 0; x < WIDTH; x++) {
        const i = idx(x, y);
        const cell = h('button', { class: 'cell', type: 'button', 'data-i': i, tabindex: -1 });
        this.cells[i] = cell;
        grid.append(cell);
      }
    }
    grid.addEventListener('click', (e) => {
      const t = e.target.closest('.cell');
      if (t && this.onCell) this.onCell(Number(t.dataset.i));
    });
    this.grid = grid;
    this.banner = h('div', { class: 'board-banner', 'aria-live': 'polite' });
    this.scroller.append(grid);
    const frame = h('div', { class: 'board-frame' }, this.scroller, this.banner);
    if (!small) {
      this.zoom = store.get(ZOOM_KEY, 1);
      this.zoomLabel = h('span', { class: 'zoom-val' });
      const bar = h('div', { class: 'board-bar' },
        caption ? h('div', { class: 'board-caption' }, caption) : h('span'),
        h('div', { class: 'zoom' },
          h('button', { type: 'button', 'aria-label': 'Oddálit', onclick: () => this.setZoom(this.zoom / 1.25) }, '−'),
          this.zoomLabel,
          h('button', { type: 'button', 'aria-label': 'Přiblížit', onclick: () => this.setZoom(this.zoom * 1.25) }, '+')));
      this.el.append(bar);
      this.setZoom(this.zoom);
    }
    this.el.append(frame);
  }

  setCaption(node) {
    const c = this.el.querySelector('.board-caption');
    if (c) c.replaceChildren(node);
  }

  setZoom(z) {
    this.zoom = Math.min(3, Math.max(1, Math.round(z * 100) / 100));
    store.set(ZOOM_KEY, this.zoom);
    this.grid.style.setProperty('--zoom', this.zoom);
    if (this.zoomLabel) this.zoomLabel.textContent = `${Math.round(this.zoom * 100)} %`;
  }

  // render(i) -> { cls, icon, mark, title }. S animate=true se nové značky „rozsvítí“.
  update(render, { animate = false } = {}) {
    const now = performance.now();
    for (let i = 0; i < this.cells.length; i++) {
      const el = this.cells[i];
      const r = render(i) || {};
      const mark = r.mark || '';
      if (animate && mark && this.marks[i] !== undefined && this.marks[i] !== mark) this.freshUntil[i] = now + FRESH_MS;
      this.marks[i] = mark;
      const cls = `cell ${r.cls || ''}${this.freshUntil[i] > now ? ' fresh' : ''}`;
      if (el.className !== cls) el.className = cls;
      const ic = r.icon || '';
      if (el.dataset.ic !== ic) {
        el.dataset.ic = ic;
        el.innerHTML = ic ? ICONS[ic] : '';
      }
      if (r.title) el.title = r.title; else el.removeAttribute('title');
    }
    clearTimeout(this.freshTimer);
    this.freshTimer = setTimeout(() => {
      const t = performance.now();
      this.cells.forEach((el, i) => { if (this.freshUntil[i] && this.freshUntil[i] <= t) el.classList.remove('fresh'); });
    }, FRESH_MS + 50);
  }

  // Velké hlášení přes plochu („ZÁSAH!“, „VEDLE“ …).
  showBanner(text, kind = 'info', sub = '', iconName = null) {
    this.banner.replaceChildren(h('div', { class: `banner banner-${kind}` },
      iconName ? icon(iconName, 'banner-ico') : null,
      h('div', {}, h('strong', {}, text), sub ? h('span', {}, sub) : null)));
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.banner.classList.remove('show'), 3200);
  }

  scrollTo(i) {
    const el = this.cells[i];
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
