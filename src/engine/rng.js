// Deterministický generátor náhody (mulberry32). Stav je jedno číslo, takže
// celý stav hry lze uložit jako JSON a přehrát.

export function createRng(seed = Date.now()) {
  return { s: seed >>> 0 };
}

export function next(rng) {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const int = (rng, n) => Math.floor(next(rng) * n);
export const die = (rng) => 1 + int(rng, 6);
export const pick = (rng, arr) => arr[int(rng, arr.length)];

export function shuffle(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
