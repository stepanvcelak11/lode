// SVG ikony pro políčka plochy a ovládání (viewBox 24×24).

const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  island: svg(`<ellipse cx="12" cy="18.5" rx="8.5" ry="3.6" fill="#e6cf8f"/>
    <path d="M11.5 18.5c0-3.8.6-6.9 2.3-9.6" stroke="#7a5428" stroke-width="1.9" fill="none" stroke-linecap="round"/>
    <path d="M13.8 8.9C12 5.8 8 5.6 5.6 7.6c3.1-.3 5.6.3 8.2 1.3zm0 0c1-3.2 4.9-4.3 7.2-2.5-3 0-5.2.9-7.2 2.5zm0 0c-3.2-.2-6.2 1.9-6.4 5.1 1.9-2.1 4-3.4 6.4-5.1zm0 0c3.1.1 5.2 2.2 5.2 5.2-1-2.1-2.9-3.9-5.2-5.2z" fill="#3fae54"/>`),
  lighthouse: svg(`<path d="M5 6.4l4.6 1.4v1.6L5 10.8zM19 6.4l-4.6 1.4v1.6l4.6 1.4z" fill="#ffd54a" opacity=".85"/>
    <path d="M9.2 21.5l1.4-12h2.8l1.4 12z" fill="#fff"/>
    <path d="M9.6 18.2h4.8l.3 2.3H9.3zM10.2 13.4h3.6l.25 2.1H9.95z" fill="#e5484d"/>
    <rect x="9.6" y="5.6" width="4.8" height="3.6" rx="1" fill="#e5484d"/>
    <path d="M9.2 5.6L12 2.8l2.8 2.8z" fill="#9b1c1f"/>
    <rect x="10.8" y="6.6" width="2.4" height="1.6" rx=".5" fill="#ffe680"/>`),
  special: svg(`<path d="M12 2.6l2.8 5.8 6.4.8-4.7 4.4 1.2 6.3L12 16.8l-5.7 3.1 1.2-6.3-4.7-4.4 6.4-.8z" fill="#ffd54a" stroke="#a86b00" stroke-width=".9" stroke-linejoin="round"/>`),
  mine: svg(`<g stroke="#20252c" stroke-width="2.1" stroke-linecap="round"><path d="M12 3.6v3.1M12 17.3v3.1M3.6 12h3.1M17.3 12h3.1M6 6l2.2 2.2M18 6l-2.2 2.2M6 18l2.2-2.2M18 18l-2.2-2.2"/></g>
    <circle cx="12" cy="12" r="5.6" fill="#2b313a"/><circle cx="10.2" cy="10.2" r="1.5" fill="#8a96a6"/>`),
  bow: svg(`<circle cx="12" cy="12" r="3.6" fill="rgba(10,25,40,.55)"/><circle cx="12" cy="12" r="1.5" fill="rgba(255,255,255,.7)"/>`),
  Z: svg(`<path d="M4.5 21V11.2L12 6.8l7.5 4.4V21z" fill="#5b3a1e"/>
    <rect x="10.3" y="15" width="3.4" height="6" rx=".6" fill="#f2b544"/>
    <path d="M12 6.8V2.2" stroke="#5b3a1e" stroke-width="1.5"/><path d="M12 2.2l4.6 1.5L12 5.2z" fill="#e5484d"/>`),
  P: svg(`<g stroke="#1b3550" stroke-width="2.1" fill="none" stroke-linecap="round"><circle cx="12" cy="5.2" r="2"/><path d="M12 7.2v13M8 10.4h8M4.8 14c0 4 3.2 6.4 7.2 6.4s7.2-2.4 7.2-6.4"/></g>`),
  V: svg(`<path d="M12 2.6l7.4 3.1v5.4c0 5-3.1 8.4-7.4 10.3-4.3-1.9-7.4-5.3-7.4-10.3V5.7z" fill="#2e6b52"/>
    <g stroke="#fff" stroke-width="1.6" fill="none"><circle cx="12" cy="11.4" r="3.1"/><path d="M12 6.2v2.2M12 14.4v2.2M6.8 11.4H9M15 11.4h2.2"/></g>`),
  DI: svg(`<path d="M7.5 14.6l11.2-6.3 1.6 2.8-11.2 6.3z" fill="#2c2117"/><circle cx="8.6" cy="16.4" r="3.6" fill="#2c2117"/>
    <circle cx="8.6" cy="16.4" r="1.4" fill="#d9b27a"/><text x="17.6" y="21.6" font-size="7.5" font-weight="800" fill="#2c2117" font-family="system-ui,sans-serif">1</text>`),
  DII: svg(`<path d="M5.5 17.4l9.4-9.4 4.2-1.4-1.4 4.2-9.4 9.4z" fill="#2c2117"/><path d="M5.5 17.4l-2 .6 2.6 2.6.6-2z" fill="#ff8a3d"/>
    <path d="M8 14.8l-2.6-.2M10.2 17l.2 2.6" stroke="#2c2117" stroke-width="1.6" stroke-linecap="round"/>
    <text x="16.4" y="21.6" font-size="7.5" font-weight="800" fill="#2c2117" font-family="system-ui,sans-serif">2</text>`),
  H: svg(`<path d="M2.4 12S6 6 12 6s9.6 6 9.6 6-3.6 6-9.6 6-9.6-6-9.6-6z" fill="#fff" stroke="#2c2117" stroke-width="1.4"/>
    <circle cx="12" cy="12" r="3.4" fill="#2c2117"/><circle cx="13.1" cy="10.9" r="1.1" fill="#fff"/>`),
  // ovládání
  land: svg(`<path d="M2 19l5.5-8 3.5 4.5L15 9l7 10z" fill="#8f9e55"/><path d="M15 9l2.1 3H13z" fill="#e8eef2"/>`),
  sea: svg(`<path d="M2 9c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 14c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 19c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0" stroke="#5ec8ff" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  erase: svg(`<path d="M14.6 3.8l5.6 5.6-9.8 9.8H6.2l-3-3z" fill="#f2a3b3"/><path d="M8.7 9.7l5.6 5.6" stroke="#0b1d33" stroke-width="1.4"/><path d="M10 20.4h10" stroke="#f2a3b3" stroke-width="2" stroke-linecap="round"/>`),
  target: svg(`<g stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/></g>`),
  ship: svg(`<path d="M3 14h18l-3 5.5H6z" fill="currentColor"/><path d="M7 14V10h7v4M10 10V6.5h3V10M14 12h5" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>`),
  book: svg(`<path d="M4 4.5h6.5a2 2 0 012 2V20a1.8 1.8 0 00-1.8-1.8H4zM20 4.5h-6.5a2 2 0 00-2 2V20a1.8 1.8 0 011.8-1.8H20z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>`),
  list: svg(`<path d="M8 6.5h12M8 12h12M8 17.5h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="4" cy="6.5" r="1.3" fill="currentColor"/><circle cx="4" cy="12" r="1.3" fill="currentColor"/><circle cx="4" cy="17.5" r="1.3" fill="currentColor"/>`),
  sheet: svg(`<rect x="4" y="3" width="16" height="18" rx="2.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`),
  help: svg(`<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M9.6 9.4a2.5 2.5 0 114 2c-1 .7-1.6 1.2-1.6 2.4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="12" cy="17" r="1.1" fill="currentColor"/>`),
  menu: svg(`<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`),
  back: svg(`<path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),
  rotate: svg(`<path d="M19 12a7 7 0 11-2.05-4.95M19 4.5V9h-4.5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),
  mirror: svg(`<path d="M12 3v18" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2"/><path d="M9 7L3.5 17H9zM15 7l5.5 10H15z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>`),
  dice: svg(`<rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><g fill="currentColor"><circle cx="8.5" cy="8.5" r="1.6"/><circle cx="15.5" cy="15.5" r="1.6"/><circle cx="12" cy="12" r="1.6"/></g>`),
  fire: svg(`<path d="M12 2.5c1 3.4 5.5 5.6 5.5 10.8A5.5 5.5 0 0112 19a5.5 5.5 0 01-5.5-5.7c0-2.6 1.6-3.9 2.4-5.6.6 1.5 1.3 2.2 2.3 2.6-.4-2.6.1-5.1.8-7.8z" fill="currentColor"/>`),
  radar: svg(`<g stroke="currentColor" stroke-width="1.8" fill="none"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l6-6"/></g><circle cx="15.5" cy="9.5" r="1.4" fill="currentColor"/>`),
  eye: svg(`<path d="M2.4 12S6 6 12 6s9.6 6 9.6 6-3.6 6-9.6 6-9.6-6-9.6-6z" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="12" cy="12" r="3" fill="currentColor"/>`),
  rocket: svg(`<path d="M5.5 17.4l9.4-9.4 4.2-1.4-1.4 4.2-9.4 9.4z" fill="currentColor"/><path d="M5.5 17.4l-2 .6 2.6 2.6.6-2z" fill="#ff8a3d"/>`),
  trophy: svg(`<path d="M7 3.5h10v5a5 5 0 01-10 0zM7 5.5H3.8a3.2 3.2 0 003.6 3.9M17 5.5h3.2a3.2 3.2 0 01-3.6 3.9M12 13.5V17M8 20.5h8l-1-3.5H9z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>`),
};

export const STRUCTURE_ICON = { Z: 'Z', P: 'P', V: 'V', DI: 'DI', DII: 'DII', H: 'H' };

export function icon(name, cls = 'ico') {
  const span = document.createElement('span');
  span.className = cls;
  span.innerHTML = ICONS[name] || '';
  return span;
}
