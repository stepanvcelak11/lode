// Service worker – hra funguje i bez internetu. Při změně souborů zvyš VERSION.
const VERSION = 'lode-v1';
const FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'PRAVIDLA.md',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'src/engine/constants.js',
  'src/engine/geometry.js',
  'src/engine/rng.js',
  'src/engine/layout.js',
  'src/engine/game.js',
  'src/engine/bot.js',
  'src/ui/app.js',
  'src/ui/board.js',
  'src/ui/dom.js',
  'src/ui/editor.js',
  'src/ui/markdown.js',
  'src/ui/play.js',
  'src/ui/render.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Nejdřív síť (ať jsou vidět novinky), bez sítě z mezipaměti.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('index.html'))),
  );
});
